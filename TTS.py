import csv
import os
import shutil
import subprocess
import asyncio
from dotenv import load_dotenv
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

load_dotenv()


def report_progress(pct: int, message: str):
    """PROGRESS:XX:message 형식으로 stdout에 출력하여 Java 백엔드에 세부 진행률을 전달합니다."""
    print(f"PROGRESS:{pct}:{message}", flush=True)

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.getenv("SMARTADV_OUTPUT", BASE_DIR / "output_clips"))
INPUT_VIDEO_PATH = Path(os.getenv("SMARTADV_INPUT", BASE_DIR / "input.mp4"))
LLM_CSV_PATH = OUTPUT_DIR / "gemini_ad_script.csv"

TTS_SEGMENTS_DIR = OUTPUT_DIR / "tts_segments"
TTS_TIMELINE_PATH = OUTPUT_DIR / "tts_timeline.csv"
NARRATION_MIX_PATH = OUTPUT_DIR / "ad_narration_mix.wav"
FINAL_VIDEO_PATH = OUTPUT_DIR / "input_with_ad.mp4"
FINAL_AUDIO_PATH = OUTPUT_DIR / "input_with_ad_audio.m4a"

# Edge TTS 설정
EDGE_TTS_VOICE = os.getenv("EDGE_TTS_VOICE", "ko-KR-SunHiNeural")
BASE_TTS_SPEED = float(os.getenv("EDGE_TTS_SPEED", "1.0"))

# 합성 관련 설정
TTS_START_OFFSET_MS = 300            # scene 시작 시점 + 0.3초 후에 오디오 시작
MAX_ATEMPO_SPEED = 1.3              # window 초과 시 허용하는 최대 atempo 배속
TTS_VOLUME = 1.25
ORIGINAL_AUDIO_DUCK_THRESHOLD = 0.02
ORIGINAL_AUDIO_DUCK_RATIO = 8.0
ORIGINAL_AUDIO_DUCK_ATTACK_MS = 15
ORIGINAL_AUDIO_DUCK_RELEASE_MS = 350

# Deployment overrides
TTS_START_OFFSET_MS = int(os.getenv("TTS_START_OFFSET_MS", str(TTS_START_OFFSET_MS)))
MAX_ATEMPO_SPEED = float(os.getenv("MAX_ATEMPO_SPEED", str(MAX_ATEMPO_SPEED)))
TTS_VOLUME = float(os.getenv("TTS_VOLUME", str(TTS_VOLUME)))
ORIGINAL_AUDIO_DUCK_THRESHOLD = float(os.getenv("ORIGINAL_AUDIO_DUCK_THRESHOLD", str(ORIGINAL_AUDIO_DUCK_THRESHOLD)))
ORIGINAL_AUDIO_DUCK_RATIO = float(os.getenv("ORIGINAL_AUDIO_DUCK_RATIO", str(ORIGINAL_AUDIO_DUCK_RATIO)))
ORIGINAL_AUDIO_DUCK_ATTACK_MS = int(os.getenv("ORIGINAL_AUDIO_DUCK_ATTACK_MS", str(ORIGINAL_AUDIO_DUCK_ATTACK_MS)))
ORIGINAL_AUDIO_DUCK_RELEASE_MS = int(os.getenv("ORIGINAL_AUDIO_DUCK_RELEASE_MS", str(ORIGINAL_AUDIO_DUCK_RELEASE_MS)))


@dataclass
class ADScriptRow:
    silence_id: int
    scene_id: int
    window_start: str
    window_end: str          # 다음 scene의 첫 장면전환 시각 또는 silence 끝
    window_start_seconds: float
    window_end_seconds: float
    window_duration: float
    text: str


@dataclass
class GeneratedSegment:
    row: ADScriptRow
    audio_path: Path
    end_ms: int            # window_end in ms — 오디오가 끝나야 하는 시각
    start_ms: int          # end_ms - audio_duration_ms
    duration_seconds: float
    atempo_speed: float


# ===== 시간 유틸 =====
def hhmmss_to_seconds(value: str) -> float:
    """HH:MM:SS 또는 HH:MM:SS:mmm 형식을 초(float)로 변환합니다."""
    parts = value.strip().split(":")
    if len(parts) == 4:
        h, m, s, ms = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
        return h * 3600 + m * 60 + s + ms / 1000
    elif len(parts) == 3:
        h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
        return h * 3600 + m * 60 + s
    raise ValueError(f"타임스탬프 형식 오류: {value}")


def seconds_to_hhmmssms(seconds: float) -> str:
    """초(float)를 HH:MM:SS:mmm 형식 문자열로 변환합니다."""
    seconds = max(0.0, seconds)
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    h = total_s // 3600
    m = (total_s % 3600) // 60
    s = total_s % 60
    return f"{h:02d}:{m:02d}:{s:02d}:{ms:03d}"


# ===== 파일/CSV 로드 =====
def load_ad_rows(csv_path: Path) -> List[ADScriptRow]:
    if not csv_path.exists():
        raise FileNotFoundError(f"해설 CSV 파일이 없습니다: {csv_path}")

    rows: List[ADScriptRow] = []
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        expected = ["silence_id", "scene_id", "window_start", "window_end", "text"]
        if reader.fieldnames != expected:
            raise ValueError(f"CSV 헤더가 예상과 다릅니다: {reader.fieldnames}")

        for item in reader:
            text = item["text"].strip()
            if not text:
                continue

            window_start_seconds = hhmmss_to_seconds(item["window_start"])
            window_end_seconds = hhmmss_to_seconds(item["window_end"])
            rows.append(
                ADScriptRow(
                    silence_id=int(item["silence_id"]),
                    scene_id=int(item["scene_id"]),
                    window_start=item["window_start"].strip(),
                    window_end=item["window_end"].strip(),
                    window_start_seconds=window_start_seconds,
                    window_end_seconds=window_end_seconds,
                    window_duration=max(0.0, window_end_seconds - window_start_seconds),
                    text=text,
                )
            )

    return rows


# ===== 시스템 유틸 =====
def ensure_ffmpeg_installed() -> None:
    if shutil.which("ffmpeg") is None:
        raise EnvironmentError("ffmpeg가 PATH에 없습니다. 먼저 ffmpeg를 설치하세요.")
    if shutil.which("ffprobe") is None:
        raise EnvironmentError("ffprobe가 PATH에 없습니다. 먼저 ffmpeg를 설치하세요.")


def get_media_duration_seconds(file_path: Path) -> float:
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]
    result = subprocess.check_output(cmd, text=True).strip()
    return float(result)


def run_ffmpeg(cmd: List[str]) -> None:
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ===== Edge TTS =====
def import_edge_tts():
    try:
        import edge_tts  # type: ignore
    except Exception as exc:
        raise ImportError(
            "edge-tts가 설치되어 있지 않거나 불러올 수 없습니다. "
            "`pip install edge-tts` 후 다시 실행하세요."
        ) from exc
    return edge_tts


async def _synthesize_with_edge_tts_async(text: str, output_path: Path, rate_percent: int) -> None:
    edge_tts = import_edge_tts()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    rate_str = f"{rate_percent:+d}%"
    
    max_retries = 5
    backoff = 1.0
    import random
    
    for attempt in range(1, max_retries + 1):
        try:
            communicate = edge_tts.Communicate(text=text, voice=EDGE_TTS_VOICE, rate=rate_str)
            await communicate.save(str(output_path))
            return  # Success!
        except Exception as exc:
            print(f"[TTS.py WARNING] Edge-TTS synthesis failed (attempt {attempt}/{max_retries}): {exc}", flush=True)
            if attempt == max_retries:
                print(f"[TTS.py ERROR] Edge-TTS synthesis completely failed after {max_retries} attempts.", flush=True)
                raise exc
            
            sleep_time = backoff * (2 ** (attempt - 1)) + random.uniform(0.1, 1.0)
            print(f"[TTS.py WARNING] Retrying in {sleep_time:.2f} seconds...", flush=True)
            await asyncio.sleep(sleep_time)


def synthesize_with_edge_tts(text: str, output_path: Path, speed: float = 1.0) -> None:
    rate_percent = int(round((speed - 1.0) * 100))
    asyncio.run(_synthesize_with_edge_tts_async(text, output_path, rate_percent))


# ===== atempo 배속 =====
def apply_atempo(src_path: Path, dst_path: Path, speed: float) -> None:
    """ffmpeg atempo 필터로 음성을 배속 처리합니다."""
    run_ffmpeg([
        "ffmpeg", "-y", "-i", str(src_path),
        "-filter:a", f"atempo={speed:.6f}",
        str(dst_path),
    ])


# ===== 세그먼트 음성 생성 =====
def generate_tts_segments(rows: List[ADScriptRow]) -> List[GeneratedSegment]:
    """각 scene의 해설 오디오를 생성하고, window_end에 오디오 끝이 맞도록 start_ms를 계산합니다."""
    print(f"Edge TTS voice 사용: {EDGE_TTS_VOICE}")

    generated: List[GeneratedSegment] = []
    for row in rows:
        raw_path = TTS_SEGMENTS_DIR / f"silence_{row.silence_id:03d}_scene_{row.scene_id:03d}_raw.wav"
        final_path = TTS_SEGMENTS_DIR / f"silence_{row.silence_id:03d}_scene_{row.scene_id:03d}.wav"

        # 기본 속도로 TTS 생성
        synthesize_with_edge_tts(row.text, raw_path, BASE_TTS_SPEED)
        raw_duration = get_media_duration_seconds(raw_path)

        # 실제 가용 시간 = window_duration - 0.3초(시작 오프셋)
        available_duration = row.window_duration - (TTS_START_OFFSET_MS / 1000)

        # 오디오가 가용 시간을 초과하면 atempo로 압축 (최대 1.3x)
        if raw_duration > available_duration:
            needed_speed = raw_duration / available_duration
            atempo_speed = min(MAX_ATEMPO_SPEED, needed_speed)
            apply_atempo(raw_path, final_path, atempo_speed)
            final_duration = get_media_duration_seconds(final_path)
            print(
                f"  → atempo 배속 적용: {atempo_speed:.3f}x "
                f"(원본 {raw_duration:.3f}s → {final_duration:.3f}s, 가용 {available_duration:.3f}s)"
            )
        else:
            shutil.copy2(raw_path, final_path)
            atempo_speed = 1.0
            final_duration = raw_duration

        # first_cut_time + 0.3초에 오디오 시작
        start_ms = int(round(row.window_start_seconds * 1000)) + TTS_START_OFFSET_MS
        end_ms = start_ms + int(round(final_duration * 1000))

        generated.append(
            GeneratedSegment(
                row=row,
                audio_path=final_path,
                end_ms=end_ms,
                start_ms=start_ms,
                duration_seconds=final_duration,
                atempo_speed=atempo_speed,
            )
        )
        print(
            f"생성 완료: {final_path.name} | "
            f"배치 {seconds_to_hhmmssms(start_ms / 1000)} ~ {seconds_to_hhmmssms(end_ms / 1000)} | "
            f"duration={final_duration:.3f}s | atempo={atempo_speed:.3f}x"
        )

    return generated


# ===== 타임라인 저장 =====
def write_tts_timeline(segments: List[GeneratedSegment], output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "silence_id",
            "scene_id",
            "window_start",
            "window_end",
            "placement_start",
            "audio_file",
            "audio_duration_seconds",
            "atempo_speed",
            "text",
        ])
        for segment in segments:
            writer.writerow([
                segment.row.silence_id,
                segment.row.scene_id,
                segment.row.window_start,
                segment.row.window_end,
                seconds_to_hhmmssms(segment.start_ms / 1000),
                segment.audio_path.name,
                f"{segment.duration_seconds:.3f}",
                f"{segment.atempo_speed:.3f}",
                segment.row.text,
            ])


def render_narration_mix(segments: List[GeneratedSegment]) -> Path:
    """장면별 TTS 세그먼트를 시간축에 맞춰 배치한 내레이션 전용 믹스를 생성합니다."""
    if not segments:
        raise ValueError("내레이션 믹스를 생성할 TTS 세그먼트가 없습니다.")

    narr_inputs: List[str] = []
    narr_parts: List[str] = []
    narr_labels: List[str] = []

    for idx, segment in enumerate(segments):
        narr_inputs.extend(["-i", str(segment.audio_path)])
        label = f"m{idx}"
        narr_parts.append(
            f"[{idx}:a]volume={TTS_VOLUME},adelay={segment.start_ms}|{segment.start_ms},aresample=48000[{label}]"
        )
        narr_labels.append(f"[{label}]")

    if len(narr_labels) == 1:
        narr_parts.append(f"{narr_labels[0]}anull[nout]")
    else:
        narr_parts.append(f"{''.join(narr_labels)}amix=inputs={len(narr_labels)}:normalize=0[nout]")

    narration_cmd = ["ffmpeg", "-y"] + narr_inputs + [
        "-filter_complex", ";".join(narr_parts),
        "-map", "[nout]",
        str(NARRATION_MIX_PATH),
    ]
    run_ffmpeg(narration_cmd)
    return NARRATION_MIX_PATH


def render_narration_and_final_mix(input_video_path: Path, segments: List[GeneratedSegment]) -> Tuple[Path, Path]:
    if not input_video_path.exists():
        raise FileNotFoundError(f"원본 영상 파일이 없습니다: {input_video_path}")

    if not segments:
        raise ValueError("합성할 TTS 세그먼트가 없습니다.")

    narration_mix_path = render_narration_mix(segments)

    # 원본 오디오와 내레이션 믹스 합성 (audio ducking 적용)
    filter_complex = (
        f"[0:a]aresample=48000[orig];"
        f"[1:a]aresample=48000,volume={TTS_VOLUME},asplit=2[narr_sc][narr_mix];"
        f"[orig][narr_sc]sidechaincompress="
        f"threshold={ORIGINAL_AUDIO_DUCK_THRESHOLD}:"
        f"ratio={ORIGINAL_AUDIO_DUCK_RATIO}:"
        f"attack={ORIGINAL_AUDIO_DUCK_ATTACK_MS}:"
        f"release={ORIGINAL_AUDIO_DUCK_RELEASE_MS}[ducked];"
        f"[ducked][narr_mix]amix=inputs=2:normalize=0[aout]"
    )

    video_cmd = [
        "ffmpeg", "-y",
        "-i", str(input_video_path),
        "-i", str(narration_mix_path),
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac",
        str(FINAL_VIDEO_PATH),
    ]
    run_ffmpeg(video_cmd)

    audio_cmd = [
        "ffmpeg", "-y",
        "-i", str(input_video_path),
        "-i", str(narration_mix_path),
        "-filter_complex", filter_complex,
        "-map", "[aout]",
        "-c:a", "aac",
        str(FINAL_AUDIO_PATH),
    ]
    run_ffmpeg(audio_cmd)

    return FINAL_AUDIO_PATH, FINAL_VIDEO_PATH


def main() -> None:
    ensure_ffmpeg_installed()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TTS_SEGMENTS_DIR.mkdir(parents=True, exist_ok=True)

    report_progress(68, "해설 대본 CSV 로드 중...")
    rows = load_ad_rows(LLM_CSV_PATH)
    if not rows:
        raise ValueError("TTS로 변환할 해설 문장이 없습니다. gemini_ad_script.csv를 확인하세요.")

    report_progress(72, f"{len(rows)}개 해설 문장 TTS 음성 합성 중...")
    segments = generate_tts_segments(rows)
    write_tts_timeline(segments, TTS_TIMELINE_PATH)

    report_progress(85, "원본 영상과 해설 음성 믹싱 중...")
    final_audio_path, final_video_path = render_narration_and_final_mix(INPUT_VIDEO_PATH, segments)

    report_progress(99, "최종 영상 생성 완료!")
    print(f"TTS 타임라인 저장: {TTS_TIMELINE_PATH}")
    print(f"내레이션 믹스 저장: {NARRATION_MIX_PATH}")
    print(f"최종 오디오 저장: {final_audio_path}")
    print(f"최종 영상 저장: {final_video_path}")


if __name__ == "__main__":
    main()
