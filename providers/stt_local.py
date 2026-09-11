"""이 컴퓨터에서 whisper 를 돌려 전사한다.

faster-whisper 가 있으면 그것을, 없으면 openai-whisper 를 쓴다. 둘 다 없으면
무엇을 설치하면 되는지 알려 준다.

Modal 쪽과 견주면 이쪽이 유리한 점이 하나 있다 — 모델을 한 번만 올려 두고 모든
클립에 다시 쓴다. Modal 은 클립마다 컨테이너가 새로 뜨므로 매번 모델을 올린다.

    LOCAL_STT_MODEL=small          # tiny · base · small · medium · large-v3
    LOCAL_STT_DEVICE=auto          # auto · cpu · cuda
    LOCAL_STT_COMPUTE_TYPE=auto    # faster-whisper 전용: int8 · float16 ...
"""

import os
import tempfile
from pathlib import Path
from typing import List, Optional

from .base import ProviderError, SttSegment

MODEL_NAME = os.getenv("LOCAL_STT_MODEL", "small")
DEVICE = os.getenv("LOCAL_STT_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("LOCAL_STT_COMPUTE_TYPE", "auto")
LANGUAGE = os.getenv("LOCAL_STT_LANGUAGE", "ko")


class LocalSTT:
    name = "local"

    def __init__(self) -> None:
        self._model: Optional[object] = None
        self._flavor: str = ""

    def transcribe_many(self, audio_chunks: List[bytes]) -> List[List[SttSegment]]:
        if not audio_chunks:
            return []

        self._load()
        print(f"   -> {len(audio_chunks)}개 오디오 클립을 이 컴퓨터에서 전사합니다 "
              f"({self._flavor} · {MODEL_NAME} · {DEVICE})...")

        results: List[List[SttSegment]] = []
        for index, audio in enumerate(audio_chunks, start=1):
            results.append(self._transcribe_one(audio))
            print(f"      전사 {index}/{len(audio_chunks)} 완료")
        return results

    # ── 안쪽 ──────────────────────────────────────────────────────────────

    def _transcribe_one(self, audio: bytes) -> List[SttSegment]:
        """whisper 가 파일 경로를 요구하므로 임시 파일을 거친다."""
        handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        try:
            handle.write(audio)
            handle.close()
            if self._flavor == "faster-whisper":
                return self._run_faster_whisper(handle.name)
            return self._run_openai_whisper(handle.name)
        finally:
            Path(handle.name).unlink(missing_ok=True)

    def _run_faster_whisper(self, path: str) -> List[SttSegment]:
        segments, _info = self._model.transcribe(path, language=LANGUAGE, task="transcribe")
        return [
            {"relative_start": int(segment.start), "text": segment.text.strip()}
            for segment in segments
            if segment.text.strip()
        ]

    def _run_openai_whisper(self, path: str) -> List[SttSegment]:
        result = self._model.transcribe(path, language=LANGUAGE, task="transcribe")
        return [
            {"relative_start": int(segment["start"]), "text": segment.get("text", "").strip()}
            for segment in result.get("segments", [])
            if segment.get("text", "").strip()
        ]

    def _load(self) -> None:
        """모델을 한 번만 올린다. 클립이 많을수록 이게 크게 남는다."""
        if self._model is not None:
            return

        try:
            from faster_whisper import WhisperModel  # type: ignore
        except Exception:
            pass
        else:
            device = DEVICE if DEVICE != "auto" else self._guess_device()
            compute = COMPUTE_TYPE if COMPUTE_TYPE != "auto" else ("float16" if device == "cuda" else "int8")
            print(f"[로컬 STT] faster-whisper 로드: {MODEL_NAME} (device={device}, compute={compute})")
            self._model = WhisperModel(MODEL_NAME, device=device, compute_type=compute)
            self._flavor = "faster-whisper"
            return

        try:
            import whisper  # type: ignore
        except Exception as exc:
            raise ProviderError(
                self.name,
                "faster-whisper 도 openai-whisper 도 설치되어 있지 않습니다. "
                "`pip install faster-whisper` 를 권합니다 (더 빠르고 가볍습니다).",
            ) from exc

        device = DEVICE if DEVICE != "auto" else self._guess_device()
        print(f"[로컬 STT] openai-whisper 로드: {MODEL_NAME} (device={device})")
        self._model = whisper.load_model(MODEL_NAME, device=device)
        self._flavor = "openai-whisper"

    @staticmethod
    def _guess_device() -> str:
        try:
            import torch  # type: ignore

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    def describe(self) -> str:
        return f"로컬 whisper {MODEL_NAME} (device={DEVICE})"
