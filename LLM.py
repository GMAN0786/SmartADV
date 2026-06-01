import csv
import concurrent.futures
import io
import os
import re
import time
from dotenv import load_dotenv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from google import genai
from google.genai import types


def report_progress(pct: int, message: str):
    """PROGRESS:XX:message 형식으로 stdout에 출력하여 Java 백엔드에 세부 진행률을 전달합니다."""
    print(f"PROGRESS:{pct}:{message}", flush=True)


# ===== 설정 =====
load_dotenv()
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = Path(os.getenv("SMARTADV_OUTPUT", BASE_DIR / "output_clips"))
SILENCE_SUMMARY_PATH = OUTPUT_DIR / "silence_summary.txt"
STT_SUMMARY_PATH = OUTPUT_DIR / "stt_summary.txt"

CONTEXT_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
LLM_RAW_OUTPUT_PATH = OUTPUT_DIR / "gemini_ad_raw.txt"
LLM_CSV_OUTPUT_PATH = OUTPUT_DIR / "gemini_ad_script.csv"
LLM_TXT_OUTPUT_PATH = OUTPUT_DIR / "gemini_ad_script.txt"

GEMINI_CLEAR_FILES_BEFORE_REQUEST = os.getenv("GEMINI_CLEAR_FILES_BEFORE_REQUEST", "1") == "1"
GEMINI_DELETE_UPLOADED_FILES_AFTER_REQUEST = os.getenv("GEMINI_DELETE_UPLOADED_FILES_AFTER_REQUEST", "1") == "1"
GEMINI_FILE_POLL_INTERVAL_SECONDS = float(os.getenv("GEMINI_FILE_POLL_INTERVAL_SECONDS", "2.0"))
GEMINI_FILE_POLL_TIMEOUT_SECONDS = float(os.getenv("GEMINI_FILE_POLL_TIMEOUT_SECONDS", "60.0"))
GEMINI_TIMEOUT_SECONDS = int(os.getenv("GEMINI_TIMEOUT_SECONDS", "180"))
GEMINI_MAX_RETRIES = int(os.getenv("GEMINI_MAX_RETRIES", "5"))

TTS_SYLLABLES_PER_SECOND = 4   # TTS 초당 발화 음절 수
TTS_MARGIN_SECONDS = 0.5        # 해설 분량 계산 시 여유 시간 (초)

# llm_mode.txt에서 작동 모드 읽기
LLM_MODE_PATH = OUTPUT_DIR / "llm_mode.txt"
if LLM_MODE_PATH.exists():
    LLM_MODE = LLM_MODE_PATH.read_text(encoding="utf-8").strip()
else:
    LLM_MODE = "IMAGE"
print(f"[설정] llm_mode: {LLM_MODE}")


# ===== 데이터 구조 =====
@dataclass
class SceneInfo:
    """장면전환 간격 < 5초인 cut들을 묶은 해설 단위."""
    scene_id: int
    window_start_abs: float                 # scene의 첫 장면전환 시각
    window_end_abs: float                   # 다음 scene의 첫 장면전환 또는 silence 끝
    window_duration: float                  # window_end_abs - window_start_abs
    images: List[Path] = field(default_factory=list)   # 시간순 키프레임 이미지
    video_path: Optional[Path] = None                 # 비디오 클립 경로 (VIDEO 모드용)


@dataclass
class SilenceInfo:
    silence_id: int
    start_seconds: float
    end_seconds: float
    context_before_lines: List[str] = field(default_factory=list)
    context_after_lines: List[str] = field(default_factory=list)
    scenes: List[SceneInfo] = field(default_factory=list)


# ===== 유틸 =====
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


def seconds_to_hhmmss(seconds: float) -> str:
    """초(float)를 HH:MM:SS:mmm 형식 문자열로 변환합니다."""
    seconds = max(0.0, seconds)
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    h = total_s // 3600
    m = (total_s % 3600) // 60
    s = total_s % 60
    return f"{h:02d}:{m:02d}:{s:02d}:{ms:03d}"


def parse_silence_summary(path: Path) -> Dict[int, SilenceInfo]:
    """scene 기반의 silence_summary.txt를 파싱합니다.

    형식 예시:
        silence001 (00:00:00:000 ~ 00:00:35:000)
        scene001 (00:00:02:211 ~ 00:00:12:095)
        scene002 (00:00:12:095 ~ 00:00:19:561)
    """
    if not path.exists():
        raise FileNotFoundError(f"무음 요약 파일이 없습니다: {path}")

    silences: Dict[int, SilenceInfo] = {}
    current_silence_id: Optional[int] = None
    current_scene_list: List[SceneInfo] = []

    silence_re = re.compile(
        r"silence(\d{3})\s*\((\d{2}:\d{2}:\d{2}:\d{3})\s*~\s*(\d{2}:\d{2}:\d{2}:\d{3})\)"
    )
    scene_re = re.compile(
        r"scene(\d{3})\s*\((\d{2}:\d{2}:\d{2}:\d{3})\s*~\s*(\d{2}:\d{2}:\d{2}:\d{3})\)"
    )

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("["):
            continue

        silence_match = silence_re.match(line)
        if silence_match:
            if current_silence_id is not None:
                silences[current_silence_id].scenes = current_scene_list

            silence_id = int(silence_match.group(1))
            start_seconds = hhmmss_to_seconds(silence_match.group(2))
            end_seconds = hhmmss_to_seconds(silence_match.group(3))
            silences[silence_id] = SilenceInfo(
                silence_id=silence_id,
                start_seconds=start_seconds,
                end_seconds=end_seconds,
            )
            current_silence_id = silence_id
            current_scene_list = []
            continue

        scene_match = scene_re.match(line)
        if scene_match and current_silence_id is not None:
            scene_id = int(scene_match.group(1))
            window_start = hhmmss_to_seconds(scene_match.group(2))
            window_end = hhmmss_to_seconds(scene_match.group(3))
            current_scene_list.append(SceneInfo(
                scene_id=scene_id,
                window_start_abs=window_start,
                window_end_abs=window_end,
                window_duration=window_end - window_start,
            ))

    if current_silence_id is not None:
        silences[current_silence_id].scenes = current_scene_list

    print(f"[입력] 무음구간 요약 파싱 완료: {len(silences)}개")
    return silences


def parse_stt_summary(path: Path, silences: Dict[int, SilenceInfo]) -> None:
    if not path.exists():
        raise FileNotFoundError(f"STT 요약 파일이 없습니다: {path}")

    current_id: Optional[int] = None
    current_side: Optional[str] = None
    header_re = re.compile(r"\[무음구간(\d+)\s+(전|후)\]")

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue

        header_match = header_re.match(line)
        if header_match:
            current_id = int(header_match.group(1))
            current_side = "before" if header_match.group(2) == "전" else "after"
            continue

        if current_id is None or current_side is None:
            continue
        if current_id not in silences:
            continue
        if line == "대사 없음":
            continue

        if current_side == "before":
            silences[current_id].context_before_lines.append(line)
        else:
            silences[current_id].context_after_lines.append(line)

    total_before = sum(len(s.context_before_lines) for s in silences.values())
    total_after = sum(len(s.context_after_lines) for s in silences.values())
    print(f"[입력] 전 대사 {total_before}개, 후 대사 {total_after}개 로드 완료")


def collect_scene_media(silences: Dict[int, SilenceInfo], output_dir: Path, mode: str) -> None:
    """모드에 따라 .jpg 키프레임 이미지 또는 .mp4 비디오 클립 파일을 각 SceneInfo에 연결합니다."""
    if mode == "VIDEO":
        video_re = re.compile(
            r"silence(\d{3})_scene(\d{3})\.(mp4)$", re.IGNORECASE
        )
        count = 0
        for file_path in output_dir.iterdir():
            if not file_path.is_file() or file_path.suffix.lower() != ".mp4":
                continue
            match = video_re.match(file_path.name)
            if not match:
                continue
            silence_id = int(match.group(1))
            scene_id = int(match.group(2))
            if silence_id in silences:
                for scene in silences[silence_id].scenes:
                    if scene.scene_id == scene_id:
                        scene.video_path = file_path
                        count += 1
        print(f"[입력] 비디오 클립 {count}개 로드 완료")
    else:
        image_re = re.compile(
            r"silence(\d{3})_scene(\d{3})_cut(\d{2})\.(jpg|jpeg|png|webp)$", re.IGNORECASE
        )
        image_map: Dict[Tuple[int, int], List[Tuple[int, Path]]] = {}
        count = 0

        for file_path in output_dir.iterdir():
            if not file_path.is_file() or file_path.suffix.lower() not in CONTEXT_IMAGE_EXTENSIONS:
                continue
            match = image_re.match(file_path.name)
            if not match:
                continue
            silence_id = int(match.group(1))
            scene_id = int(match.group(2))
            cut_num = int(match.group(3))
            image_map.setdefault((silence_id, scene_id), []).append((cut_num, file_path))
            count += 1

        for silence in silences.values():
            for scene in silence.scenes:
                key = (silence.silence_id, scene.scene_id)
                if key in image_map:
                    sorted_images = sorted(image_map[key], key=lambda x: x[0])
                    scene.images = [path for _, path in sorted_images]

        print(f"[입력] 키프레임 이미지 {count}개 로드 완료")


def build_prompt_image(silences: Dict[int, SilenceInfo]) -> str:
    prompt_lines: List[str] = []
    prompt_lines.extend([
        "당신은 시각장애인을 위한 전문 오디오 화면해설(Audio Description) 작가입니다.",
        "각 scene의 키프레임 이미지를 시간순으로 보고 해설 대본을 작성합니다.",
        "해설 오디오는 각 scene의 window_start(첫 장면전환 시각) 직후부터 재생됩니다.",
        "",
        "[핵심 규칙]",
        "1. 제공된 키프레임 이미지들은 시간순으로 정렬되어 있습니다.",
        "   - Scene 내에 각 장면이 순서대로 제공됩니다.",
        "   - 이미지 순서를 따라 장면 변화를 파악하고 해설을 작성합니다.",
        "2. 전후 대사는 행동 추론 참고용으로만 사용하고, 출력 문장에 직접 쓰지 않습니다.",
        "3. 감정 해석, 소리 묘사, 추측성 표현은 금지합니다.",
        f"4. TTS 발화 속도는 초당 약 {TTS_SYLLABLES_PER_SECOND}음절입니다.",
        f"   window_duration에서 {TTS_MARGIN_SECONDS}초를 뺀 시간 안에 읽힐 분량으로 작성합니다.",
        "   (예: window 8.0초 → 최대 약 30음절 / window 5.0초 → 최대 약 18음절)",
        "5. 출력은 반드시 CSV만 반환합니다. 코드블록, 설명문, 마크다운을 절대 추가하지 않습니다.",
        "",
        "[출력 CSV 스키마]",
        "silence_id,scene_id,window_start,window_end,text",
        "- scene_id: 해당 silence 내 scene 번호 (숫자만, 예: 1, 2, 3)",
        "- window_start: scene의 첫 장면전환 시각 (HH:MM:SS:mmm)",
        "- window_end: 다음 scene의 첫 장면전환 시각 또는 silence 끝 (HH:MM:SS:mmm)",
        "- text: TTS에 바로 넣을 수 있는 평어체 한 문장 또는 두 문장",
        "",
        "[입력 데이터]",
    ])

    for silence_id in sorted(silences):
        silence = silences[silence_id]
        prompt_lines.append(f"## silence{silence.silence_id:03d}")
        prompt_lines.append(
            f"구간: {seconds_to_hhmmss(silence.start_seconds)} ~ {seconds_to_hhmmss(silence.end_seconds)}"
        )

        if silence.context_before_lines:
            prompt_lines.append("[전 대사]")
            prompt_lines.extend(silence.context_before_lines)
        else:
            prompt_lines.append("[전 대사]\n대사 없음")

        if silence.context_after_lines:
            prompt_lines.append("[후 대사]")
            prompt_lines.extend(silence.context_after_lines)
        else:
            prompt_lines.append("[후 대사]\n대사 없음")

        if not silence.scenes:
            prompt_lines.append("[장면전환 없음 — 해설 불필요]")
        else:
            prompt_lines.append("[scene 목록]")
            for scene in silence.scenes:
                max_narration_sec = max(0.0, scene.window_duration - TTS_MARGIN_SECONDS)
                max_syllables = int(max_narration_sec * TTS_SYLLABLES_PER_SECOND)
                prompt_lines.append(
                    f"- scene{scene.scene_id:03d}: "
                    f"window={seconds_to_hhmmss(scene.window_start_abs)}~{seconds_to_hhmmss(scene.window_end_abs)}, "
                    f"window_duration={scene.window_duration:.3f}s, "
                    f"이미지 {len(scene.images)}장, "
                    f"최대음절={max_syllables}자"
                )
                for img in scene.images:
                    prompt_lines.append(f"  * {img.name}")
        prompt_lines.append("")

    prompt_lines.append("반드시 CSV 헤더부터 출력하십시오.")
    prompt = "\n".join(prompt_lines)
    print(f"[프롬프트] 생성 완료: {len(prompt)}자")
    return prompt


def build_prompt_video(silences: Dict[int, SilenceInfo]) -> str:
    prompt_lines: List[str] = []
    prompt_lines.extend([
        "당신은 시각장애인을 위한 전문 오디오 화면해설(Audio Description) 작가입니다.",
        "각 scene의 480p 동영상 클립을 보고 해설 대본을 작성합니다.",
        "해설 오디오는 각 scene의 window_start(첫 장면전환 시각) 직후부터 재생됩니다.",
        "",
        "[핵심 규칙]",
        "1. 제공된 동영상 클립을 시청하고, 해당 scene 내의 장면 변화 및 인물의 행동을 파악하여 해설을 작성합니다.",
        "2. 전후 대사는 행동 추론 참고용으로만 사용하고, 출력 문장에 직접 쓰지 않습니다.",
        "3. 감정 해석, 소리 묘사, 추측성 표현은 금지합니다.",
        f"4. TTS 발화 속도는 초당 약 {TTS_SYLLABLES_PER_SECOND}음절입니다.",
        f"   window_duration에서 {TTS_MARGIN_SECONDS}초를 뺀 시간 안에 읽힐 분량으로 작성합니다.",
        "   (예: window 8.0초 → 최대 약 30음절 / window 5.0초 → 최대 약 18음절)",
        "5. 출력은 반드시 CSV만 반환합니다. 코드블록, 설명문, 마크다운을 절대 추가하지 않습니다.",
        "",
        "[출력 CSV 스키마]",
        "silence_id,scene_id,window_start,window_end,text",
        "- scene_id: 해당 silence 내 scene 번호 (숫자만, 예: 1, 2, 3)",
        "- window_start: scene의 첫 장면전환 시각 (HH:MM:SS:mmm)",
        "- window_end: 다음 scene의 첫 장면전환 시각 또는 silence 끝 (HH:MM:SS:mmm)",
        "- text: TTS에 바로 넣을 수 있는 평어체 한 문장 또는 두 문장",
        "",
        "[입력 데이터]",
    ])

    for silence_id in sorted(silences):
        silence = silences[silence_id]
        prompt_lines.append(f"## silence{silence.silence_id:03d}")
        prompt_lines.append(
            f"구간: {seconds_to_hhmmss(silence.start_seconds)} ~ {seconds_to_hhmmss(silence.end_seconds)}"
        )

        if silence.context_before_lines:
            prompt_lines.append("[전 대사]")
            prompt_lines.extend(silence.context_before_lines)
        else:
            prompt_lines.append("[전 대사]\n대사 없음")

        if silence.context_after_lines:
            prompt_lines.append("[후 대사]")
            prompt_lines.extend(silence.context_after_lines)
        else:
            prompt_lines.append("[후 대사]\n대사 없음")

        if not silence.scenes:
            prompt_lines.append("[장면전환 없음 — 해설 불필요]")
        else:
            prompt_lines.append("[scene 목록]")
            for scene in silence.scenes:
                max_narration_sec = max(0.0, scene.window_duration - TTS_MARGIN_SECONDS)
                max_syllables = int(max_narration_sec * TTS_SYLLABLES_PER_SECOND)
                prompt_lines.append(
                    f"- scene{scene.scene_id:03d}: "
                    f"window={seconds_to_hhmmss(scene.window_start_abs)}~{seconds_to_hhmmss(scene.window_end_abs)}, "
                    f"window_duration={scene.window_duration:.3f}s, "
                    f"동영상 클립: {scene.video_path.name if scene.video_path else 'None'}, "
                    f"최대음절={max_syllables}자"
                )
        prompt_lines.append("")

    prompt_lines.append("반드시 CSV 헤더부터 출력하십시오.")
    prompt = "\n".join(prompt_lines)
    print(f"[프롬프트] 생성 완료: {len(prompt)}자")
    return prompt


def build_multimodal_contents(prompt: str, silences: Dict[int, SilenceInfo], client, mode: str) -> Tuple[List[object], List[str]]:
    """프롬프트 텍스트 뒤에 scene별로 [scene 라벨 텍스트 → 해당 이미지 또는 동영상]을 교차 배치합니다."""
    contents: List[object] = [prompt]
    uploaded_file_names: List[str] = []

    if mode == "VIDEO":
        total_videos = sum(
            1 for silence in silences.values()
            for scene in silence.scenes
            if scene.video_path and scene.video_path.exists()
        )
        print(f"[프롬프트] Files API 업로드 시작: 총 비디오 {total_videos}개")
        report_progress(45, f"Gemini에 비디오 클립 {total_videos}개 업로드 시작...")

        vid_idx = 0
        for silence_id in sorted(silences):
            silence = silences[silence_id]
            for scene in silence.scenes:
                if not scene.video_path or not scene.video_path.exists():
                    continue
                contents.append(f"[silence{silence.silence_id:03d} scene{scene.scene_id:03d} 동영상]")
                vid_idx += 1
                upload_pct = 45 + int((vid_idx / total_videos) * 13) if total_videos > 0 else 45
                report_progress(upload_pct, f"비디오 업로드 중 ({vid_idx}/{total_videos}): {scene.video_path.name}")
                print(f"[Files API] 업로드 중 ({vid_idx}/{total_videos}): {scene.video_path.name}")
                uploaded_file = upload_gemini_file(client, scene.video_path)
                contents.append(uploaded_file)
                uploaded_file_names.append(uploaded_file.name)
                print(f"[Files API] 업로드 완료 ({vid_idx}/{total_videos}): {scene.video_path.name} -> {uploaded_file.name}")
        
        report_progress(58, "비디오 업로드 완료! Gemini AI 응답 대기 중...")
        print(f"[프롬프트] Files API 업로드 완료: scene별 교차 배치, 원격 비디오 {total_videos}개")
    else:
        total_images = sum(
            1 for silence in silences.values()
            for scene in silence.scenes
            for img_path in scene.images if img_path.exists()
        )
        print(f"[프롬프트] Files API 업로드 시작: 총 이미지 {total_images}개")
        report_progress(45, f"Gemini에 키프레임 이미지 {total_images}장 업로드 시작...")

        img_idx = 0
        for silence_id in sorted(silences):
            silence = silences[silence_id]
            for scene in silence.scenes:
                existing_images = [p for p in scene.images if p.exists()]
                if not existing_images:
                    continue
                contents.append(f"[silence{silence.silence_id:03d} scene{scene.scene_id:03d} 이미지]")
                for image_path in existing_images:
                    img_idx += 1
                    upload_pct = 45 + int((img_idx / total_images) * 13) if total_images > 0 else 45
                    report_progress(upload_pct, f"이미지 업로드 중 ({img_idx}/{total_images}): {image_path.name}")
                    print(f"[Files API] 업로드 중 ({img_idx}/{total_images}): {image_path.name}")
                    uploaded_file = upload_gemini_file(client, image_path)
                    contents.append(uploaded_file)
                    uploaded_file_names.append(uploaded_file.name)
                    print(f"[Files API] 업로드 완료 ({img_idx}/{total_images}): {image_path.name} -> {uploaded_file.name}")

        report_progress(58, "이미지 업로드 완료! Gemini AI 응답 대기 중...")
        print(f"[프롬프트] Files API 업로드 완료: scene별 교차 배치, 원격 이미지 {total_images}개")

    return contents, uploaded_file_names


def upload_gemini_file(client, file_path: Path):
    """단일 이미지를 Gemini Files API에 업로드하고 ACTIVE 상태가 될 때까지 대기합니다."""
    uploaded_file = client.files.upload(file=str(file_path))
    print(f"[Files API] 원격 처리 대기 시작: {file_path.name} -> {uploaded_file.name}")
    deadline = time.time() + GEMINI_FILE_POLL_TIMEOUT_SECONDS
    last_logged_state = None

    while time.time() < deadline:
        current = client.files.get(name=uploaded_file.name)
        state = getattr(current, "state", None)
        state_name = getattr(state, "name", str(state)) if state is not None else "UNKNOWN"

        if state_name != last_logged_state:
            print(f"[Files API] 상태 변경: {file_path.name} -> {state_name}")
            last_logged_state = state_name

        if state_name == "ACTIVE":
            return current
        if state_name == "FAILED":
            raise RuntimeError(f"Gemini Files API 처리 실패: {file_path} -> {uploaded_file.name}")

        time.sleep(GEMINI_FILE_POLL_INTERVAL_SECONDS)

    raise TimeoutError(f"Gemini Files API 활성화 대기 타임아웃: {file_path} -> {uploaded_file.name}")


def delete_uploaded_gemini_files(client, file_names: List[str]) -> None:
    """이번 요청에서 업로드한 Gemini Files API 파일만 정리합니다."""
    if not GEMINI_DELETE_UPLOADED_FILES_AFTER_REQUEST:
        print("[Gemini] 요청 후 업로드 파일 삭제 생략 설정됨")
        return

    deleted_count = 0
    failed_count = 0
    for file_name in file_names:
        try:
            client.files.delete(name=file_name)
            deleted_count += 1
        except Exception:
            failed_count += 1

    print(f"[Gemini] 요청 후 업로드 파일 정리 완료: 삭제 {deleted_count}개, 실패 {failed_count}개")


def strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned


def normalize_csv_text(csv_text: str) -> str:
    cleaned = strip_code_fence(csv_text)
    rows = list(csv.reader(io.StringIO(cleaned)))
    if not rows:
        raise ValueError("Gemini 응답에서 CSV를 찾지 못했습니다.")

    expected_header = ["silence_id", "scene_id", "window_start", "window_end", "text"]
    header = [cell.strip() for cell in rows[0]]
    if header != expected_header:
        raise ValueError(f"CSV 헤더가 예상과 다릅니다: {header}")

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(expected_header)

    for row in rows[1:]:
        if not row or all(not cell.strip() for cell in row):
            continue
        normalized = (row + [""] * len(expected_header))[: len(expected_header)]
        normalized = [cell.strip() for cell in normalized]
        # silence_id, scene_id에 'silence001', 'scene01' 같은 접두사가 붙어 있으면 숫자만 추출
        for col_idx in (0, 1):
            digits = re.sub(r'\D', '', normalized[col_idx])
            if digits:
                normalized[col_idx] = str(int(digits))
        writer.writerow(normalized)

    return output.getvalue().strip() + "\n"


def csv_to_txt(csv_text: str) -> str:
    reader = csv.DictReader(io.StringIO(csv_text))
    blocks: List[str] = []

    for row in reader:
        silence_id = row["silence_id"]
        scene_id = row["scene_id"]
        window_start = row["window_start"]
        window_end = row["window_end"]
        text = row["text"]

        blocks.append(f"[silence{int(silence_id):03d} scene{int(scene_id):03d}]")
        blocks.append(f"window {window_start} ~ {window_end}")
        blocks.append(text)
        blocks.append("")

    return "\n".join(blocks).strip() + "\n"


def cleanup_gemini_files(client) -> None:
    """요청 시작 전에 Gemini Files API에 남아 있는 이전 업로드 파일들을 정리합니다."""
    if not GEMINI_CLEAR_FILES_BEFORE_REQUEST:
        print("[Gemini] Files API 사전 정리 생략 설정됨")
        return

    print("[Gemini] Files API 사전 정리 시작")
    deleted_count = 0
    failed_count = 0
    listed_count = 0

    try:
        for file_obj in client.files.list():
            listed_count += 1
            file_name = getattr(file_obj, "name", None)
            if not file_name:
                continue
            try:
                client.files.delete(name=file_name)
                deleted_count += 1
                print(f"[Gemini] 이전 업로드 파일 삭제: {file_name}")
            except Exception as exc:
                failed_count += 1
                print(f"[Gemini] 이전 업로드 파일 삭제 실패: {file_name} | {exc}")

        print(f"[Gemini] Files API 사전 정리 완료: 조회 {listed_count}개, 삭제 {deleted_count}개, 실패 {failed_count}개")
    except Exception as exc:
        print(f"[Gemini] Files API 목록 조회/정리 실패: {exc}")


def call_gemini(prompt: str, silences: Dict[int, SilenceInfo], mode: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.")

    client = genai.Client(api_key=api_key)
    cleanup_gemini_files(client)
    contents, uploaded_file_names = build_multimodal_contents(prompt, silences, client, mode)

    max_retries = GEMINI_MAX_RETRIES
    last_error = None

    try:
        for attempt in range(1, max_retries + 1):
            try:
                report_progress(58, f"Gemini AI 응답 대기 중... (시도 {attempt}/{max_retries})")
                print(f"[Gemini] 요청 시작: model={GEMINI_MODEL} (시도 {attempt}/{max_retries}, 타임아웃 {GEMINI_TIMEOUT_SECONDS}초)")

                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    future = executor.submit(
                        client.models.generate_content,
                        model=GEMINI_MODEL,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            temperature=0.2,
                            response_mime_type="text/plain",
                        ),
                    )
                    try:
                        response = future.result(timeout=GEMINI_TIMEOUT_SECONDS)
                    except concurrent.futures.TimeoutError:
                        raise TimeoutError(f"Gemini API 응답 {GEMINI_TIMEOUT_SECONDS}초 타임아웃 (503 UNAVAILABLE)")

                print("[Gemini] 응답 수신 완료")
                try:
                    if hasattr(response, "usage_metadata") and response.usage_metadata is not None:
                        prompt_tokens = response.usage_metadata.prompt_token_count
                        completion_tokens = response.usage_metadata.candidates_token_count
                        total_tokens = response.usage_metadata.total_token_count
                        token_usage_path = OUTPUT_DIR / "token_usage.txt"
                        token_usage_path.write_text(f"{prompt_tokens},{completion_tokens},{total_tokens}", encoding="utf-8")
                        print(f"[Gemini] 토큰 사용량 저장 완료: 입력={prompt_tokens}, 출력={completion_tokens}, 합계={total_tokens}")
                except Exception as exc:
                    print(f"[Gemini] 토큰 사용량 추출/저장 실패: {exc}")

                if not response.text:
                    raise ValueError("Gemini 응답 텍스트가 비어 있습니다.")
                return response.text

            except Exception as e:
                last_error = e
                error_str = str(e)
                is_retryable = any(kw in error_str for kw in [
                    "503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "INTERNAL", "Timeout", "타임아웃"
                ])
                if is_retryable and attempt < max_retries:
                    wait_sec = 30 * attempt
                    report_progress(58, f"서버 과부하/타임아웃! {wait_sec}초 후 재시도... ({attempt}/{max_retries})")
                    print(f"[Gemini] 재시도 사유: ({error_str[:80]}...). {wait_sec}초 후 재시도합니다.")
                    time.sleep(wait_sec)
                else:
                    raise

        raise last_error
    finally:
        delete_uploaded_gemini_files(client, uploaded_file_names)


def load_all_inputs(mode: str) -> Dict[int, SilenceInfo]:
    print("[1/4] 입력 파일 파싱 시작")
    silences = parse_silence_summary(SILENCE_SUMMARY_PATH)
    parse_stt_summary(STT_SUMMARY_PATH, silences)
    collect_scene_media(silences, OUTPUT_DIR, mode)
    total_scenes = sum(len(s.scenes) for s in silences.values())
    if mode == "VIDEO":
        total_videos = sum(1 for s in silences.values() for scene in s.scenes if scene.video_path)
        print(f"[1/4] 입력 파일 파싱 완료: 총 scene {total_scenes}개, 비디오 클립 {total_videos}개")
    else:
        total_images = sum(len(scene.images) for s in silences.values() for scene in s.scenes)
        print(f"[1/4] 입력 파일 파싱 완료: 총 scene {total_scenes}개, 이미지 {total_images}개")
    return silences


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    report_progress(35, "전처리 결과 파일 파싱 중...")
    silences = load_all_inputs(LLM_MODE)
    print(f"[2/4] 무음구간 데이터 준비 완료: {len(silences)}개")
    if not silences:
        raise ValueError("처리할 무음구간 데이터가 없습니다.")

    report_progress(40, "Gemini 프롬프트 구성 중...")
    print("[3/4] Gemini 프롬프트 생성 시작")
    if LLM_MODE == "VIDEO":
        prompt = build_prompt_video(silences)
    else:
        prompt = build_prompt_image(silences)
    print("[3/4] Gemini 프롬프트 생성 완료")

    report_progress(45, "Gemini AI에 해설 대본 요청 중... (최대 수 분 소요)")
    print("[4/4] Gemini 호출 시작")
    raw_response = call_gemini(prompt, silences, LLM_MODE)
    print(f"[4/4] Gemini 호출 완료: 응답 {len(raw_response)}자")

    report_progress(60, "AI 응답 후처리 및 대본 저장 중...")
    LLM_RAW_OUTPUT_PATH.write_text(raw_response, encoding="utf-8")
    print(f"[저장] 원본 응답 저장 완료: {LLM_RAW_OUTPUT_PATH}")

    normalized_csv = normalize_csv_text(raw_response)
    LLM_CSV_OUTPUT_PATH.write_text(normalized_csv, encoding="utf-8")
    LLM_TXT_OUTPUT_PATH.write_text(csv_to_txt(normalized_csv), encoding="utf-8")
    print("[저장] 응답 후처리 및 파일 저장 완료")

    report_progress(66, "해설 대본 생성 완료")
    print(f"Gemini 원본 응답 저장: {LLM_RAW_OUTPUT_PATH}")
    print(f"Gemini CSV 저장: {LLM_CSV_OUTPUT_PATH}")
    print(f"Gemini TXT 저장: {LLM_TXT_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
