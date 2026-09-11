"""지금 설정된 provider 가 실제로 대답하는지 확인한다.

파이프라인 전체를 돌려 보기 전에 여기서 먼저 걸러 낸다. 로컬 모델로 갈아탈 때
"서버가 떠 있나 · 모델 이름이 맞나 · 목소리 이름이 맞나" 를 몇 초 만에 본다.

    python -m providers.check          # 셋 다
    python -m providers.check vlm      # 하나만 (vlm · tts · stt)
"""

import struct
import sys
import tempfile
from pathlib import Path
from typing import List

from . import describe_providers, get_stt, get_tts, get_vlm
from .base import VLMRequest

OK = "  ✓"
NO = "  ✗"


def check_vlm() -> bool:
    """이미지 없이 짧은 요청 하나를 보낸다. 닿는지와 대답하는지만 본다."""
    print("[VLM] 대본 생성 모델")
    try:
        provider = get_vlm()
        answer = provider.generate(
            VLMRequest(
                prompt=(
                    "연결 확인용 요청입니다. 다른 말은 붙이지 말고 아래 한 줄만 그대로 출력하세요.\n"
                    "silence_id,scene_id,window_start,window_end,text"
                ),
                temperature=0.0,
            )
        )
    except Exception as exc:
        print(f"{NO} {exc}")
        return False

    trimmed = answer.strip().splitlines()[0] if answer.strip() else "(빈 응답)"
    print(f"{OK} {provider.name} 응답: {trimmed[:80]}")
    if "silence_id" not in answer:
        print("     주의: CSV 헤더를 그대로 내지 못했습니다. 대본 형식을 못 지킬 수 있습니다.")
    return True


def check_tts() -> bool:
    """짧은 문장 하나를 실제로 합성해 파일이 생기는지 본다."""
    print("[TTS] 해설 음성 엔진")
    try:
        provider = get_tts()
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / f"check{provider.audio_suffix}"
            provider.synthesize("연결 확인용 문장입니다.", output)
            size = output.stat().st_size if output.exists() else 0
    except Exception as exc:
        print(f"{NO} {exc}")
        return False

    if size <= 0:
        print(f"{NO} {provider.name}: 음성 파일이 비어 있습니다.")
        return False

    print(f"{OK} {provider.name} 합성 성공: {size:,} 바이트")
    return True


def check_stt() -> bool:
    """1초짜리 무음을 넣어 본다. 받아 적을 말은 없지만 모델이 뜨는지는 확인된다."""
    print("[STT] 음성 인식 엔진")
    try:
        provider = get_stt()
        segments = provider.transcribe_many([_silent_wav(seconds=1.0)])
    except Exception as exc:
        print(f"{NO} {exc}")
        return False

    print(f"{OK} {provider.name} 응답: 무음 1초 → 전사 {len(segments[0]) if segments else 0}건 "
          f"(0건이 정상입니다)")
    return True


def _silent_wav(seconds: float, sample_rate: int = 16000) -> bytes:
    """16kHz 모노 무음 WAV. 파이프라인이 STT 에 넘기는 것과 같은 모양이다."""
    frames = int(sample_rate * seconds)
    data = b"\x00\x00" * frames
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + len(data), b"WAVE",
        b"fmt ", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16,
        b"data", len(data),
    )
    return header + data


CHECKS = {"vlm": check_vlm, "tts": check_tts, "stt": check_stt}


def main(argv: List[str]) -> int:
    wanted = [name.lower() for name in argv[1:]] or list(CHECKS)
    unknown = [name for name in wanted if name not in CHECKS]
    if unknown:
        print(f"모르는 이름입니다: {', '.join(unknown)} (쓸 수 있는 값: vlm, tts, stt)")
        return 2

    print(f"설정: {describe_providers()}\n")
    results = {name: CHECKS[name]() for name in wanted}
    failed = [name for name, ok in results.items() if not ok]

    print()
    if failed:
        print(f"{len(failed)}건 실패했습니다: {', '.join(failed)}")
        return 1
    print("전부 응답했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
