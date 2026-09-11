"""Modal GPU 에 올려 둔 whisper 로 전사한다. 지금 실제로 쓰는 provider.

`modal deploy modal_workers.py` 로 배포해 둔 함수를 이름으로 찾아 `.map()` 으로
부른다. 클립마다 별도 GPU 컨테이너가 떠서 한꺼번에 처리된다.

MODAL_TOKEN_ID / MODAL_TOKEN_SECRET (또는 ~/.modal.toml) 이 필요하다.
"""

import os
from typing import List, Optional

from .base import ProviderError, SttSegment

APP_NAME = os.getenv("MODAL_APP_NAME", "smartadv")
FUNCTION_NAME = os.getenv("MODAL_STT_FUNCTION", "run_stt")


class ModalSTT:
    name = "modal"

    def __init__(self) -> None:
        self._function: Optional[object] = None

    def transcribe_many(self, audio_chunks: List[bytes]) -> List[List[SttSegment]]:
        if not audio_chunks:
            return []

        function = self._resolve()
        print(f"   -> {len(audio_chunks)}개 오디오 클립을 Modal에서 병렬 전사합니다...")
        try:
            return [result or [] for result in function.map(audio_chunks)]
        except Exception as exc:
            raise ProviderError(self.name, f"전사 실패: {exc}") from exc

    def _resolve(self):
        """배포해 둔 함수를 한 번만 찾아 두고 다시 쓴다."""
        if self._function is not None:
            return self._function

        try:
            import modal
        except Exception as exc:
            raise ProviderError(self.name, "modal 패키지를 불러올 수 없습니다.") from exc

        try:
            self._function = modal.Function.from_name(APP_NAME, FUNCTION_NAME)
        except Exception as exc:
            raise ProviderError(
                self.name,
                f"배포된 함수를 찾지 못했습니다 ({APP_NAME}/{FUNCTION_NAME}). "
                "`modal deploy modal_workers.py` 를 먼저 실행하세요.",
            ) from exc
        return self._function

    def describe(self) -> str:
        return f"Modal GPU whisper ({APP_NAME}/{FUNCTION_NAME})"
