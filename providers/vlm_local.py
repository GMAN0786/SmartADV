"""로컬에서 띄운 비전 모델로 화면해설 대본을 받아 온다.

OpenAI 호환 `/chat/completions` 를 부른다. vLLM · llama.cpp server · Ollama ·
LM Studio 가 모두 이 규약을 내놓기 때문에, 어떤 걸로 모델을 띄우든 주소만
바꾸면 된다. 이미지는 올릴 데가 없으므로 base64 로 프롬프트에 실어 보낸다.

    LOCAL_VLM_BASE_URL=http://localhost:8000/v1     # vLLM
    LOCAL_VLM_BASE_URL=http://localhost:11434/v1    # Ollama
    LOCAL_VLM_BASE_URL=http://localhost:1234/v1     # LM Studio

바깥에서 보면 Gemini provider 와 완전히 같다 — 같은 VLMRequest 를 받아 같은
CSV 글자를 돌려준다.
"""

import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

from .base import ProviderError, ProviderNotConfigured, VLMRequest
from .progress import report_progress

BASE_URL = os.getenv("LOCAL_VLM_BASE_URL", "http://localhost:8000/v1").rstrip("/")
MODEL = os.getenv("LOCAL_VLM_MODEL", "")
API_KEY = os.getenv("LOCAL_VLM_API_KEY", "")
TIMEOUT_SECONDS = int(os.getenv("LOCAL_VLM_TIMEOUT_SECONDS", "900"))
MAX_RETRIES = int(os.getenv("LOCAL_VLM_MAX_RETRIES", "3"))
MAX_TOKENS = int(os.getenv("LOCAL_VLM_MAX_TOKENS", "8192"))
#: scene 하나에 실어 보낼 이미지 수 상한. 0 이면 제한 없음.
#: 로컬 모델은 이미지가 많으면 컨텍스트가 먼저 터지므로, 필요하면 여기서 줄인다.
MAX_IMAGES_PER_SCENE = int(os.getenv("LOCAL_VLM_MAX_IMAGES_PER_SCENE", "0"))

MIME_BY_SUFFIX: Dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


class LocalVLM:
    name = "local"

    def generate(self, request: VLMRequest) -> str:
        if not MODEL:
            raise ProviderNotConfigured(
                self.name,
                "LOCAL_VLM_MODEL 이 비어 있습니다. 띄워 둔 모델 이름을 넣으세요 "
                "(예: Qwen2.5-VL-7B-Instruct).",
            )

        content = self._build_content(request)
        payload = {
            "model": MODEL,
            "messages": [{"role": "user", "content": content}],
            "temperature": request.temperature,
            "max_tokens": MAX_TOKENS,
            "stream": False,
        }

        last_error: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                report_progress(58, f"로컬 모델 응답 대기 중... (시도 {attempt}/{MAX_RETRIES})")
                print(f"[로컬 VLM] 요청 시작: model={MODEL} @ {BASE_URL} "
                      f"(시도 {attempt}/{MAX_RETRIES}, 타임아웃 {TIMEOUT_SECONDS}초)")

                text = self._post_chat(payload)
                print(f"[로컬 VLM] 응답 수신 완료: {len(text)}자")
                if not text.strip():
                    raise ValueError("로컬 모델 응답이 비어 있습니다.")
                return text

            except Exception as exc:
                last_error = exc
                if attempt < MAX_RETRIES:
                    wait = 10 * attempt
                    report_progress(58, f"로컬 모델 응답 실패. {wait}초 후 재시도... ({attempt}/{MAX_RETRIES})")
                    print(f"[로컬 VLM] 재시도 사유: {str(exc)[:120]}. {wait}초 후 다시 시도합니다.")
                    time.sleep(wait)

        raise ProviderError(self.name, f"{MAX_RETRIES}번 모두 실패했습니다: {last_error}")

    # ── 안쪽 ──────────────────────────────────────────────────────────────

    def _build_content(self, request: VLMRequest) -> List[dict]:
        """프롬프트 뒤에 [scene 라벨 → 그 scene 의 이미지들] 을 번갈아 놓는다.

        Gemini 쪽과 배치 순서가 같아야 프롬프트를 손대지 않고 모델만 갈아 끼울
        수 있다. 다른 점은 올리느냐(Files API) 싣느냐(base64)뿐이다.
        """
        content: List[dict] = [{"type": "text", "text": request.prompt}]

        total = request.image_count()
        print(f"[프롬프트] 이미지 인코딩 시작: 총 {total}개")
        report_progress(45, f"로컬 모델에 키프레임 이미지 {total}장 싣는 중...")

        index = 0
        skipped = 0
        for scene in request.scenes:
            images = scene.existing()
            if not images:
                continue
            if MAX_IMAGES_PER_SCENE > 0 and len(images) > MAX_IMAGES_PER_SCENE:
                skipped += len(images) - MAX_IMAGES_PER_SCENE
                images = self._thin_out(images, MAX_IMAGES_PER_SCENE)

            content.append({"type": "text", "text": scene.label})
            for image_path in images:
                index += 1
                pct = 45 + int((index / total) * 13) if total > 0 else 45
                report_progress(pct, f"이미지 싣는 중 ({index}/{total}): {image_path.name}")
                content.append({
                    "type": "image_url",
                    "image_url": {"url": self._data_url(image_path)},
                })

        if skipped:
            print(f"[프롬프트] scene당 이미지 상한({MAX_IMAGES_PER_SCENE})에 걸려 {skipped}장을 덜어냈습니다.")
        report_progress(58, "이미지 준비 완료! 로컬 모델 응답 대기 중...")
        print(f"[프롬프트] 이미지 인코딩 완료: scene별 교차 배치, 이미지 {index}개")
        return content

    @staticmethod
    def _thin_out(images: List[Path], keep: int) -> List[Path]:
        """앞뒤를 버리지 않고 고르게 솎아낸다. 장면의 처음과 끝은 반드시 남는다."""
        if keep <= 1:
            return images[:1]
        step = (len(images) - 1) / (keep - 1)
        return [images[round(i * step)] for i in range(keep)]

    @staticmethod
    def _data_url(image_path: Path) -> str:
        mime = MIME_BY_SUFFIX.get(image_path.suffix.lower(), "image/jpeg")
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        return f"data:{mime};base64,{encoded}"

    def _post_chat(self, payload: dict) -> str:
        request = urllib.request.Request(
            f"{BASE_URL}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise ProviderError(self.name, f"HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ProviderError(
                self.name,
                f"{BASE_URL} 에 닿지 못했습니다 ({exc.reason}). 모델 서버가 떠 있는지 확인하세요.",
            ) from exc

        try:
            return body["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderError(self.name, f"응답 형식이 예상과 다릅니다: {str(body)[:200]}") from exc

    @staticmethod
    def _headers() -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        # 로컬 서버는 대개 인증이 없지만, vLLM 을 --api-key 로 띄웠다면 필요하다.
        if API_KEY:
            headers["Authorization"] = f"Bearer {API_KEY}"
        return headers
