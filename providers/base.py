"""provider 들이 주고받는 모양.

지금은 Gemini · Edge TTS · Modal Whisper 를 쓰지만, 나중에 로컬 모델로 갈아탈
때 파이프라인 코드는 손대지 않는다. 그러려면 주고받는 값이 어느 한쪽 서비스의
자료구조가 아니어야 한다 — 그래서 여기 있는 것은 전부 "글자, 파일 경로, 초"
같은 평범한 값뿐이다.

Gemini 는 이미지를 Files API 에 올려서 참조로 넘기고, 로컬 모델은 같은 이미지를
base64 로 프롬프트에 실어 보낸다. 그 차이는 각 provider 안에서만 다뤄지고
바깥으로 새지 않는다.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Protocol, runtime_checkable


class ProviderError(RuntimeError):
    """provider 가 끝내 답을 주지 못했을 때. 어느 provider 였는지 함께 들고 있는다."""

    def __init__(self, provider: str, message: str):
        super().__init__(f"[{provider}] {message}")
        self.provider = provider


class ProviderNotConfigured(ProviderError):
    """키·주소 같은 설정이 비어 있어 시작조차 못 할 때."""


# ── 화면해설 대본 생성 (VLM) ──────────────────────────────────────────────

@dataclass
class SceneImages:
    """한 scene 에 딸린 키프레임 묶음.

    label 은 프롬프트에 그대로 끼워 넣는 표식이라, 어느 이미지가 어느 scene 의
    것인지 모델이 헷갈리지 않는다.
    """
    label: str
    paths: List[Path] = field(default_factory=list)

    def existing(self) -> List[Path]:
        return [p for p in self.paths if p.exists()]


@dataclass
class VLMRequest:
    """대본 한 벌을 받아 오기 위한 요청. 글자 하나와 이미지 묶음들이 전부다."""
    prompt: str
    scenes: List[SceneImages] = field(default_factory=list)
    temperature: float = 0.2

    def image_count(self) -> int:
        return sum(len(scene.existing()) for scene in self.scenes)


@runtime_checkable
class VLMProvider(Protocol):
    """이미지와 글을 함께 읽고 CSV 대본을 글자로 돌려준다."""
    name: str

    def generate(self, request: VLMRequest) -> str: ...


# ── 해설 음성 (TTS) ───────────────────────────────────────────────────────

@runtime_checkable
class TTSProvider(Protocol):
    """문장 하나를 음성 파일 하나로 만든다.

    speed 는 1.0 이 기본이고, 창(window)에 넣기 위해 미리 빠르게 읽어야 할 때
    1.0 보다 큰 값이 들어온다. 배속을 직접 지원하지 않는 엔진이라면 1.0 으로
    만들고 넘겨도 된다 — 뒤에서 ffmpeg atempo 가 한 번 더 맞춘다.
    """
    name: str
    #: 만들어 내는 파일 형식. 파이프라인이 확장자를 이걸로 정한다.
    audio_suffix: str

    def synthesize(self, text: str, output_path: Path, speed: float = 1.0) -> None: ...


# ── 음성 인식 (STT) ───────────────────────────────────────────────────────

#: 전사 결과 한 조각. {"relative_start": 3, "text": "안녕하세요"}
SttSegment = Dict[str, object]


@runtime_checkable
class STTProvider(Protocol):
    """16kHz 모노 WAV 바이트 여러 개를 한꺼번에 전사한다.

    입력 순서와 출력 순서가 같아야 한다 — 파이프라인이 zip 으로 짝지어 쓴다.
    """
    name: str

    def transcribe_many(self, audio_chunks: List[bytes]) -> List[List[SttSegment]]: ...
