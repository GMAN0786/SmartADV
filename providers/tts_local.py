"""로컬에서 띄운 TTS 서버로 해설 음성을 만든다.

OpenAI 호환 `/audio/speech` 를 부른다. Kokoro-FastAPI · openedai-speech ·
Coqui 래퍼 등이 이 규약을 내놓는다. 음성 파일 바이트를 그대로 받아 저장한다.

    LOCAL_TTS_BASE_URL=http://localhost:8880/v1
    LOCAL_TTS_VOICE=af_heart
    LOCAL_TTS_FORMAT=wav

배속(speed)을 지원하지 않는 서버라면 `LOCAL_TTS_SUPPORTS_SPEED=0` 으로 꺼 둔다.
그래도 문제없다 — 창(window)에 넣는 마지막 조절은 어차피 뒤에서 ffmpeg atempo
가 한 번 더 한다.
"""

import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict

from .base import ProviderError, ProviderNotConfigured

BASE_URL = os.getenv("LOCAL_TTS_BASE_URL", "http://localhost:8880/v1").rstrip("/")
MODEL = os.getenv("LOCAL_TTS_MODEL", "tts-1")
VOICE = os.getenv("LOCAL_TTS_VOICE", "")
API_KEY = os.getenv("LOCAL_TTS_API_KEY", "")
FORMAT = os.getenv("LOCAL_TTS_FORMAT", "wav")
TIMEOUT_SECONDS = int(os.getenv("LOCAL_TTS_TIMEOUT_SECONDS", "120"))
SUPPORTS_SPEED = os.getenv("LOCAL_TTS_SUPPORTS_SPEED", "1") == "1"


class LocalTTS:
    name = "local"

    @property
    def audio_suffix(self) -> str:
        return f".{FORMAT}"

    def synthesize(self, text: str, output_path: Path, speed: float = 1.0) -> None:
        if not VOICE:
            raise ProviderNotConfigured(
                self.name,
                "LOCAL_TTS_VOICE 가 비어 있습니다. 띄워 둔 서버가 가진 목소리 이름을 넣으세요.",
            )

        payload: Dict[str, object] = {
            "model": MODEL,
            "voice": VOICE,
            "input": text,
            "response_format": FORMAT,
        }
        if SUPPORTS_SPEED and abs(speed - 1.0) > 1e-6:
            payload["speed"] = round(speed, 3)

        request = urllib.request.Request(
            f"{BASE_URL}/audio/speech",
            data=json.dumps(payload).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                audio = response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise ProviderError(self.name, f"HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ProviderError(
                self.name,
                f"{BASE_URL} 에 닿지 못했습니다 ({exc.reason}). TTS 서버가 떠 있는지 확인하세요.",
            ) from exc

        if not audio:
            raise ProviderError(self.name, "음성 데이터가 비어 있습니다.")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(audio)

    @staticmethod
    def _headers() -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if API_KEY:
            headers["Authorization"] = f"Bearer {API_KEY}"
        return headers

    def describe(self) -> str:
        return f"로컬 TTS {BASE_URL} model={MODEL} voice={VOICE or '(미설정)'}"
