"""Gemini 로 화면해설 대본을 받아 온다. 지금 실제로 쓰는 provider.

원래 LLM.py 안에 있던 코드를 그대로 옮겨 온 것이라 동작은 달라지지 않는다.
Files API 에 이미지를 올리고, scene 라벨과 번갈아 배치하고, 503/429 에는
기다리는 시간을 늘려 가며 다시 물어본다.
"""

import concurrent.futures
import os
import time
from pathlib import Path
from typing import List, Optional, Tuple

from .base import ProviderError, ProviderNotConfigured, VLMRequest
from .progress import report_progress

MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
CLEAR_FILES_BEFORE_REQUEST = os.getenv("GEMINI_CLEAR_FILES_BEFORE_REQUEST", "1") == "1"
DELETE_UPLOADED_FILES_AFTER_REQUEST = os.getenv("GEMINI_DELETE_UPLOADED_FILES_AFTER_REQUEST", "1") == "1"
FILE_POLL_INTERVAL_SECONDS = float(os.getenv("GEMINI_FILE_POLL_INTERVAL_SECONDS", "2.0"))
FILE_POLL_TIMEOUT_SECONDS = float(os.getenv("GEMINI_FILE_POLL_TIMEOUT_SECONDS", "60.0"))
TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "180"))
MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "5"))

#: 다시 물어볼 만한 실패. 서버가 잠깐 밀렸다는 신호들이다.
RETRYABLE = ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "INTERNAL", "Timeout", "타임아웃")


class GeminiVLM:
    name = "gemini"

    def generate(self, request: VLMRequest) -> str:
        from google import genai
        from google.genai import types

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ProviderNotConfigured(self.name, "GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.")

        client = genai.Client(api_key=api_key)
        self._cleanup_old_files(client)
        contents, uploaded = self._upload(client, request)

        last_error: Optional[Exception] = None
        try:
            for attempt in range(1, MAX_RETRIES + 1):
                try:
                    report_progress(58, f"Gemini AI 응답 대기 중... (시도 {attempt}/{MAX_RETRIES})")
                    print(f"[Gemini] 요청 시작: model={MODEL} (시도 {attempt}/{MAX_RETRIES}, 타임아웃 {TIMEOUT_SECONDS}초)")

                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(
                            client.models.generate_content,
                            model=MODEL,
                            contents=contents,
                            config=types.GenerateContentConfig(
                                temperature=request.temperature,
                                response_mime_type="text/plain",
                            ),
                        )
                        try:
                            response = future.result(timeout=TIMEOUT_SECONDS)
                        except concurrent.futures.TimeoutError:
                            raise TimeoutError(f"Gemini API 응답 {TIMEOUT_SECONDS}초 타임아웃 (503 UNAVAILABLE)")

                    print("[Gemini] 응답 수신 완료")
                    if not response.text:
                        raise ValueError("Gemini 응답 텍스트가 비어 있습니다.")
                    return response.text

                except Exception as exc:
                    last_error = exc
                    text = str(exc)
                    if any(keyword in text for keyword in RETRYABLE) and attempt < MAX_RETRIES:
                        wait = 30 * attempt
                        report_progress(58, f"서버 과부하/타임아웃! {wait}초 후 재시도... ({attempt}/{MAX_RETRIES})")
                        print(f"[Gemini] 재시도 사유: ({text[:80]}...). {wait}초 후 재시도합니다.")
                        time.sleep(wait)
                    else:
                        raise

            raise ProviderError(self.name, f"{MAX_RETRIES}번 모두 실패했습니다: {last_error}")
        finally:
            self._delete_uploaded(client, uploaded)

    # ── 안쪽 ──────────────────────────────────────────────────────────────

    def _upload(self, client, request: VLMRequest) -> Tuple[List[object], List[str]]:
        """프롬프트 뒤에 [scene 라벨 → 그 scene 의 이미지들] 을 번갈아 놓는다.

        이렇게 해야 어떤 이미지가 어떤 scene 것인지 모델이 정확히 안다.
        """
        contents: List[object] = [request.prompt]
        uploaded_names: List[str] = []

        total = request.image_count()
        print(f"[프롬프트] Files API 업로드 시작: 총 이미지 {total}개")
        report_progress(45, f"Gemini에 키프레임 이미지 {total}장 업로드 시작...")

        index = 0
        for scene in request.scenes:
            images = scene.existing()
            if not images:
                continue
            contents.append(scene.label)
            for image_path in images:
                index += 1
                pct = 45 + int((index / total) * 13) if total > 0 else 45
                report_progress(pct, f"이미지 업로드 중 ({index}/{total}): {image_path.name}")
                print(f"[Files API] 업로드 중 ({index}/{total}): {image_path.name}")
                uploaded = self._upload_one(client, image_path)
                contents.append(uploaded)
                uploaded_names.append(uploaded.name)
                print(f"[Files API] 업로드 완료 ({index}/{total}): {image_path.name} -> {uploaded.name}")

        report_progress(58, "이미지 업로드 완료! Gemini AI 응답 대기 중...")
        print(f"[프롬프트] Files API 업로드 완료: scene별 교차 배치, 원격 이미지 {total}개")
        return contents, uploaded_names

    def _upload_one(self, client, file_path: Path):
        """이미지 한 장을 올리고 ACTIVE 가 될 때까지 기다린다."""
        uploaded = client.files.upload(file=str(file_path))
        print(f"[Files API] 원격 처리 대기 시작: {file_path.name} -> {uploaded.name}")
        deadline = time.time() + FILE_POLL_TIMEOUT_SECONDS
        last_state = None

        while time.time() < deadline:
            current = client.files.get(name=uploaded.name)
            state = getattr(current, "state", None)
            state_name = getattr(state, "name", str(state)) if state is not None else "UNKNOWN"

            if state_name != last_state:
                print(f"[Files API] 상태 변경: {file_path.name} -> {state_name}")
                last_state = state_name

            if state_name == "ACTIVE":
                return current
            if state_name == "FAILED":
                raise ProviderError(self.name, f"Files API 처리 실패: {file_path} -> {uploaded.name}")

            time.sleep(FILE_POLL_INTERVAL_SECONDS)

        raise ProviderError(self.name, f"Files API 활성화 대기 타임아웃: {file_path} -> {uploaded.name}")

    def _cleanup_old_files(self, client) -> None:
        """지난 요청에서 남은 업로드 파일을 미리 치운다."""
        if not CLEAR_FILES_BEFORE_REQUEST:
            print("[Gemini] Files API 사전 정리 생략 설정됨")
            return

        print("[Gemini] Files API 사전 정리 시작")
        listed = deleted = failed = 0
        try:
            for file_obj in client.files.list():
                listed += 1
                name = getattr(file_obj, "name", None)
                if not name:
                    continue
                try:
                    client.files.delete(name=name)
                    deleted += 1
                    print(f"[Gemini] 이전 업로드 파일 삭제: {name}")
                except Exception as exc:
                    failed += 1
                    print(f"[Gemini] 이전 업로드 파일 삭제 실패: {name} | {exc}")
            print(f"[Gemini] Files API 사전 정리 완료: 조회 {listed}개, 삭제 {deleted}개, 실패 {failed}개")
        except Exception as exc:
            print(f"[Gemini] Files API 목록 조회/정리 실패: {exc}")

    def _delete_uploaded(self, client, file_names: List[str]) -> None:
        """이번 요청에서 올린 것만 되돌려 지운다."""
        if not DELETE_UPLOADED_FILES_AFTER_REQUEST:
            print("[Gemini] 요청 후 업로드 파일 삭제 생략 설정됨")
            return

        deleted = failed = 0
        for name in file_names:
            try:
                client.files.delete(name=name)
                deleted += 1
            except Exception:
                failed += 1
        print(f"[Gemini] 요청 후 업로드 파일 정리 완료: 삭제 {deleted}개, 실패 {failed}개")
