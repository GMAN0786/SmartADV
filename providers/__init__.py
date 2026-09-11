"""모델을 부르는 자리를 한 군데로 모은 곳.

파이프라인(engine.py · LLM.py · TTS.py)은 어느 회사 API 를 쓰는지 모른다.
`get_vlm()` · `get_tts()` · `get_stt()` 로 일꾼을 받아 쓸 뿐이다. 그래서 나중에
로컬 모델이 제대로 돌기 시작하면 파이프라인 코드는 한 줄도 고치지 않고
환경변수만 바꾸면 된다.

    VLM_PROVIDER=gemini | local     (기본 gemini)
    TTS_PROVIDER=edge   | local     (기본 edge)
    STT_PROVIDER=modal  | local     (기본 modal)

셋은 서로 독립이다. 대본만 먼저 로컬로 옮기고 음성은 Edge 를 계속 쓰는 식으로
하나씩 갈아탈 수 있다. 지금 무엇으로 돌고 있는지는 아래로 확인한다.

    python -m providers.check
"""

import os

from dotenv import load_dotenv

# provider 모듈들이 os.getenv 로 설정을 읽기 전에 .env 를 먼저 올려 둔다.
# (아래 팩토리들이 모듈을 늦게 들여오는 이유이기도 하다.)
load_dotenv()

from .base import (  # noqa: E402  — load_dotenv 뒤여야 한다
    ProviderError,
    ProviderNotConfigured,
    SceneImages,
    SttSegment,
    STTProvider,
    TTSProvider,
    VLMProvider,
    VLMRequest,
)
from .progress import report_progress  # noqa: E402

__all__ = [
    "get_vlm",
    "get_tts",
    "get_stt",
    "describe_providers",
    "ProviderError",
    "ProviderNotConfigured",
    "SceneImages",
    "SttSegment",
    "STTProvider",
    "TTSProvider",
    "VLMProvider",
    "VLMRequest",
    "report_progress",
]

DEFAULT_VLM = "gemini"
DEFAULT_TTS = "edge"
DEFAULT_STT = "modal"


def _chosen(env_key: str, default: str) -> str:
    return (os.getenv(env_key) or default).strip().lower()


def _unknown(kind: str, name: str, known: tuple) -> ProviderError:
    return ProviderError(name, f"알 수 없는 {kind} provider 입니다. 쓸 수 있는 값: {', '.join(known)}")


def get_vlm() -> VLMProvider:
    """장면 이미지를 읽고 해설 대본(CSV)을 써 주는 모델."""
    name = _chosen("VLM_PROVIDER", DEFAULT_VLM)

    if name == "gemini":
        from .vlm_gemini import GeminiVLM

        return GeminiVLM()
    if name == "local":
        from .vlm_local import LocalVLM

        return LocalVLM()

    raise _unknown("VLM", name, ("gemini", "local"))


def get_tts() -> TTSProvider:
    """해설 문장을 음성으로 바꿔 주는 엔진."""
    name = _chosen("TTS_PROVIDER", DEFAULT_TTS)

    if name == "edge":
        from .tts_edge import EdgeTTS

        return EdgeTTS()
    if name == "local":
        from .tts_local import LocalTTS

        return LocalTTS()

    raise _unknown("TTS", name, ("edge", "local"))


def get_stt() -> STTProvider:
    """무음 구간 앞뒤 대사를 받아 적는 엔진."""
    name = _chosen("STT_PROVIDER", DEFAULT_STT)

    if name == "modal":
        from .stt_modal import ModalSTT

        return ModalSTT()
    if name == "local":
        from .stt_local import LocalSTT

        return LocalSTT()

    raise _unknown("STT", name, ("modal", "local"))


def describe_providers() -> str:
    """지금 무엇으로 돌고 있는지 한 줄로. 로그 맨 앞에 찍어 두면 헷갈릴 일이 없다."""
    return (
        f"VLM={_chosen('VLM_PROVIDER', DEFAULT_VLM)} · "
        f"TTS={_chosen('TTS_PROVIDER', DEFAULT_TTS)} · "
        f"STT={_chosen('STT_PROVIDER', DEFAULT_STT)}"
    )
