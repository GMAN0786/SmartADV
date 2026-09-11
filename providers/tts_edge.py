"""Edge TTS 로 해설 음성을 만든다. 지금 실제로 쓰는 provider.

원래 TTS.py 안에 있던 코드를 그대로 옮겨 왔다. 배속은 엔진이 직접 지원하므로
rate 로 넘긴다 — 여기서 미리 줄여 두면 뒤에서 ffmpeg atempo 로 다시 깎을 일이
줄고 음질도 덜 상한다.
"""

import asyncio
import os
from pathlib import Path

from .base import ProviderError

VOICE = os.getenv("EDGE_TTS_VOICE", "ko-KR-SunHiNeural")


class EdgeTTS:
    name = "edge"
    audio_suffix = ".wav"

    def synthesize(self, text: str, output_path: Path, speed: float = 1.0) -> None:
        rate_percent = int(round((speed - 1.0) * 100))
        asyncio.run(self._synthesize_async(text, output_path, rate_percent))

    async def _synthesize_async(self, text: str, output_path: Path, rate_percent: int) -> None:
        edge_tts = self._import_edge_tts()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        communicate = edge_tts.Communicate(text=text, voice=VOICE, rate=f"{rate_percent:+d}%")
        await communicate.save(str(output_path))

    def _import_edge_tts(self):
        try:
            import edge_tts  # type: ignore
        except Exception as exc:
            raise ProviderError(
                self.name,
                "edge-tts가 설치되어 있지 않거나 불러올 수 없습니다. "
                "`pip install edge-tts` 후 다시 실행하세요.",
            ) from exc
        return edge_tts

    def describe(self) -> str:
        return f"Edge TTS voice={VOICE}"
