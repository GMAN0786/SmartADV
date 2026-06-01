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


def split_silences_into_batches(silences: Dict[int, SilenceInfo], max_scenes_per_batch: int = 10) -> List[Dict[int, SilenceInfo]]:
    """무음구간(Silence)의 문맥 응집성을 극대화하기 위해 Silence 단위를 쪼개지 않고 배치로 묶습니다.
    단, 단일 Silence 내 Scene 개수가 10개를 초과할 때만 가상 분할하여 전후 대사 맥락을 보존 주입합니다."""
    batches = []
    current_batch = {}
    current_scenes_count = 0
    
    for silence_id in sorted(silences):
        silence = silences[silence_id]
        n_scenes = len(silence.scenes)
        
        # 장면전환이 없는 구간은 어디에나 들어갈 수 있음
        if n_scenes == 0:
            current_batch[silence_id] = silence
            continue
            
        # Case A: 단일 무음구간에 속한 Scene 개수가 한 배치의 한계치를 넘는 예외 상황
        if n_scenes > max_scenes_per_batch:
            if current_batch:
                batches.append(current_batch)
                current_batch = {}
                current_scenes_count = 0
                
            scenes_list = silence.scenes
            for chunk_idx in range(0, len(scenes_list), max_scenes_per_batch):
                chunk_scenes = scenes_list[chunk_idx : chunk_idx + max_scenes_per_batch]
                split_silence = SilenceInfo(
                    silence_id=silence.silence_id,
                    start_seconds=silence.start_seconds,
                    end_seconds=silence.end_seconds,
                    context_before_lines=silence.context_before_lines.copy(),
                    context_after_lines=silence.context_after_lines.copy(),
                    scenes=chunk_scenes
                )
                
                if len(chunk_scenes) == max_scenes_per_batch:
                    batches.append({silence.silence_id: split_silence})
                else:
                    current_batch = {silence.silence_id: split_silence}
                    current_scenes_count = len(chunk_scenes)
            continue
            
        # Case B: 전체 무음구간을 추가하면 배치의 한계치를 넘는 경우 (배치 분할 선언)
        if current_scenes_count + n_scenes > max_scenes_per_batch:
            batches.append(current_batch)
            current_batch = {silence_id: silence}
            current_scenes_count = n_scenes
            
        # Case C: 전체 무음구간이 무리 없이 현재 배치에 속하는 경우
        else:
            current_batch[silence_id] = silence
            current_scenes_count += n_scenes
            
    if current_batch:
        batches.append(current_batch)
        
    return batches


def upload_and_wait_all_files(client, file_paths: List[Path], batch_num: int, total_batches: int) -> Dict[Path, object]:
    """배치 내의 모든 미디어 파일을 concurrent.futures를 사용해 병렬로 업로드하고,
    이후 단일 폴링 루프를 통해 모든 파일이 ACTIVE 상태가 될 때까지 병렬 대기합니다.
    """
    unique_paths = sorted(list(set(file_paths)))
    if not unique_paths:
        return {}

    print(f"[Batch {batch_num}/{total_batches}] 파일 병렬 업로드 개시: 총 {len(unique_paths)}개")
    path_to_uploaded = {}
    
    def upload_worker(path: Path):
        try:
            uploaded = client.files.upload(file=str(path))
            return path, uploaded
        except Exception as e:
            print(f"[Batch {batch_num}/{total_batches}] 업로드 실패 ({path.name}): {e}")
            raise

    # 1. 병렬 업로드 실행
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(unique_paths)) as executor:
        futures = {executor.submit(upload_worker, p): p for p in unique_paths}
        for future in concurrent.futures.as_completed(futures):
            path = futures[future]
            try:
                p, uploaded = future.result()
                path_to_uploaded[p] = uploaded
            except Exception as e:
                raise RuntimeError(f"파일 업로드 중 오류 발생: {path.name}") from e

    print(f"[Batch {batch_num}/{total_batches}] 모든 파일 업로드 완료. 병렬 상태 검사(ACTIVE) 시작...")

    # 2. 단일 폴링 루프를 통해 모든 파일이 ACTIVE가 될 때까지 대기
    deadline = time.time() + GEMINI_FILE_POLL_TIMEOUT_SECONDS
    pending_paths = list(unique_paths)
    final_files = {}

    while pending_paths and time.time() < deadline:
        next_pending = []
        
        def poll_worker(path: Path):
            uploaded = path_to_uploaded[path]
            try:
                current = client.files.get(name=uploaded.name)
                return path, current
            except Exception as e:
                print(f"[Batch {batch_num}/{total_batches}] 상태 조회 실패 ({path.name}): {e}")
                raise

        # 병렬로 각 파일의 상태를 조회
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(pending_paths)) as poll_executor:
            poll_futures = {poll_executor.submit(poll_worker, p): p for p in pending_paths}
            for future in concurrent.futures.as_completed(poll_futures):
                path = poll_futures[future]
                try:
                    p, current = future.result()
                    state = getattr(current, "state", None)
                    state_name = getattr(state, "name", str(state)) if state is not None else "UNKNOWN"

                    if state_name == "ACTIVE":
                        final_files[p] = current
                    elif state_name == "FAILED":
                        raise RuntimeError(f"Gemini Files API 처리 실패: {p.name} -> {current.name}")
                    else:
                        next_pending.append(p)
                except Exception as e:
                    raise RuntimeError(f"파일 상태 조회 중 오류 발생: {path.name}") from e

        pending_paths = next_pending
        if pending_paths:
            time.sleep(GEMINI_FILE_POLL_INTERVAL_SECONDS)

    if pending_paths:
        raise TimeoutError(f"Gemini Files API 활성화 대기 타임아웃: {[p.name for p in pending_paths]}")

    print(f"[Batch {batch_num}/{total_batches}] 모든 파일 ACTIVE 활성화 완료")
    return final_files


def build_multimodal_contents_for_batch(prompt: str, silences: Dict[int, SilenceInfo], client, mode: str, batch_num: int, total_batches: int) -> Tuple[List[object], List[str]]:
    """해당 배치 스레드의 파일들을 Files API에 병렬 업로드하고 교차 배치합니다."""
    contents: List[object] = [prompt]
    uploaded_file_names: List[str] = []

    # 1. 업로드할 모든 파일의 경로를 먼저 수집합니다.
    file_paths: List[Path] = []
    if mode == "VIDEO":
        for silence_id in sorted(silences):
            silence = silences[silence_id]
            for scene in silence.scenes:
                if scene.video_path and scene.video_path.exists():
                    file_paths.append(scene.video_path)
    else:
        for silence_id in sorted(silences):
            silence = silences[silence_id]
            for scene in silence.scenes:
                for img_path in scene.images:
                    if img_path.exists():
                        file_paths.append(img_path)

    # 2. 모든 파일을 병렬로 업로드하고 ACTIVE 상태가 될 때까지 병렬 대기합니다.
    uploaded_files_map = upload_and_wait_all_files(client, file_paths, batch_num, total_batches)

    # 3. 원래의 텍스트와 파일 오브젝트 순서를 유지하면서 contents를 구성합니다.
    if mode == "VIDEO":
        total_videos = len(file_paths)
        print(f"[Batch {batch_num}/{total_batches}] contents 리스트 구성 중: 총 비디오 {total_videos}개")

        for silence_id in sorted(silences):
            silence = silences[silence_id]
            for scene in silence.scenes:
                if not scene.video_path or not scene.video_path.exists():
                    continue
                contents.append(f"[silence{silence.silence_id:03d} scene{scene.scene_id:03d} 동영상]")
                uploaded_file = uploaded_files_map[scene.video_path]
                contents.append(uploaded_file)
                uploaded_file_names.append(uploaded_file.name)
    else:
        total_images = len(file_paths)
        print(f"[Batch {batch_num}/{total_batches}] contents 리스트 구성 중: 총 이미지 {total_images}개")

        for silence_id in sorted(silences):
            silence = silences[silence_id]
            for scene in silence.scenes:
                existing_images = [p for p in scene.images if p.exists()]
                if not existing_images:
                    continue
                contents.append(f"[silence{silence.silence_id:03d} scene{scene.scene_id:03d} 이미지]")
                for image_path in existing_images:
                    uploaded_file = uploaded_files_map[image_path]
                    contents.append(uploaded_file)
                    uploaded_file_names.append(uploaded_file.name)

    return contents, uploaded_file_names


def delete_uploaded_gemini_files(client, file_names: List[str]) -> None:
    """이번 스레드 배치 요청에서 업로드한 고유 Gemini 파일만 정리합니다."""
    if not GEMINI_DELETE_UPLOADED_FILES_AFTER_REQUEST:
        return

    deleted_count = 0
    failed_count = 0
    for file_name in file_names:
        try:
            client.files.delete(name=file_name)
            deleted_count += 1
        except Exception:
            failed_count += 1

    print(f"[Gemini] 배치 스레드 업로드 파일 정리 완료: 삭제 {deleted_count}개, 실패 {failed_count}개")


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


def merge_csv_results(csv_results: List[str]) -> str:
    """각 배치 스레드로부터 수신된 CSV 응답들을 똑똑하게 헤더 교정 및 정규화하여 하나로 병합합니다."""
    expected_header = ["silence_id", "scene_id", "window_start", "window_end", "text"]
    merged_rows = []
    
    for csv_text in csv_results:
        try:
            cleaned = strip_code_fence(csv_text)
            rows = list(csv.reader(io.StringIO(cleaned)))
            if not rows:
                continue
            
            header = [cell.strip() for cell in rows[0]]
            start_idx = 1
            if header != expected_header:
                if len(header) >= 5 and header[0].strip().lower() in ("silence_id", "silenceid", "silence"):
                    start_idx = 1
                else:
                    start_idx = 0
            
            for row in rows[start_idx:]:
                if not row or all(not cell.strip() for cell in row):
                    continue
                merged_rows.append(row)
        except Exception as e:
            print(f"[Warning] CSV 결과 파싱 실패: {e}")
            
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(expected_header)
    
    for row in merged_rows:
        normalized = (row + [""] * len(expected_header))[: len(expected_header)]
        normalized = [cell.strip() for cell in normalized]
        
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
    """Gemini Files API 계정에 남아 있는 이전/최종 찌꺼기 파일들을 완벽히 일괄 삭제합니다."""
    if not GEMINI_CLEAR_FILES_BEFORE_REQUEST:
        return

    print("[Gemini] Files API 강제 일괄 클린업 작동 중...")
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
            except Exception:
                failed_count += 1

        print(f"[Gemini] Files API 클린업 완수: 대상 {listed_count}개 중 {deleted_count}개 삭제 성공 (실패 {failed_count}개)")
    except Exception as exc:
        print(f"[Gemini] Files API 일괄 정리 실패: {exc}")


def call_gemini_for_batch(client, prompt: str, silences: Dict[int, SilenceInfo], mode: str, batch_num: int, total_batches: int) -> Tuple[str, int, int, int]:
    """개별 스레드 배치를 위해 Gemini API를 안전하게 실행하고 토큰 정보를 반환합니다."""
    contents, uploaded_file_names = build_multimodal_contents_for_batch(prompt, silences, client, mode, batch_num, total_batches)

    max_retries = GEMINI_MAX_RETRIES
    last_error = None
    prompt_tokens = 0
    completion_tokens = 0
    total_tokens = 0

    try:
        for attempt in range(1, max_retries + 1):
            try:
                print(f"[Gemini Batch {batch_num}/{total_batches}] 대본 요청 시작 (시도 {attempt}/{max_retries})")

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
                        raise TimeoutError(f"Gemini Batch {batch_num} 응답 {GEMINI_TIMEOUT_SECONDS}초 타임아웃")

                print(f"[Gemini Batch {batch_num}/{total_batches}] 응답 수신 성공")
                
                try:
                    if hasattr(response, "usage_metadata") and response.usage_metadata is not None:
                        prompt_tokens = response.usage_metadata.prompt_token_count or 0
                        completion_tokens = response.usage_metadata.candidates_token_count or 0
                        total_tokens = response.usage_metadata.total_token_count or 0
                except Exception as exc:
                    print(f"[Gemini Batch {batch_num}] 토큰 메타 추출 오류: {exc}")

                if not response.text:
                    raise ValueError(f"Gemini Batch {batch_num} 응답 텍스트 공백 오류")
                return response.text, prompt_tokens, completion_tokens, total_tokens

            except Exception as e:
                last_error = e
                error_str = str(e)
                is_retryable = any(kw in error_str for kw in [
                    "503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500", "INTERNAL", "Timeout", "타임아웃"
                ])
                if is_retryable and attempt < max_retries:
                    wait_sec = 15 * attempt
                    print(f"[Gemini Batch {batch_num}] 서버 대기 후 재시도 ({wait_sec}초) | 사유: {error_str[:80]}...")
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

    report_progress(40, "Gemini 프롬프트 구성 및 배칭 처리 중...")
    print("[3/4] Gemini 프롬프트 구성 및 문맥 흐름 보존형 배칭 분할 시작")
    
    # VIDEO/IMAGE 모드 모두 최대 10개 Scene 단위 병렬 배치 분할 실행
    batches = split_silences_into_batches(silences, max_scenes_per_batch=10)
    print(f" -> 문맥 보존 배칭 완수: 총 {len(silences)}개 무음구간을 {len(batches)}개 배치로 분할함 (배치당 최대 10개 Scene)")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise EnvironmentError("GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.")

    client = genai.Client(api_key=api_key)

    # 1. 최초 사전 클린업: 시작 전 찌꺼기 완벽 정리
    cleanup_gemini_files(client)

    batch_results = [None] * len(batches)
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_overall_tokens = 0

    print(f"[4/4] Gemini 호출 시작: 총 {len(batches)}개 배치를 병렬(ThreadPool)로 전송합니다.")
    report_progress(45, f"Gemini AI에 병렬로 해설 대본 요청 중... (총 {len(batches)}개 배치)")

    def process_batch_worker(batch_idx: int, batch_silences: Dict[int, SilenceInfo]):
        if LLM_MODE == "VIDEO":
            batch_prompt = build_prompt_video(batch_silences)
        else:
            batch_prompt = build_prompt_image(batch_silences)
        
        return call_gemini_for_batch(client, batch_prompt, batch_silences, LLM_MODE, batch_idx + 1, len(batches))

    # 최적의 동시 실행 수 5개 스레드로 병렬 가동
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_to_idx = {
            executor.submit(process_batch_worker, i, batch): i 
            for i, batch in enumerate(batches)
        }

        for future in concurrent.futures.as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                res_text, p_tok, c_tok, t_tok = future.result()
                batch_results[idx] = res_text
                
                # 스레드 안전하게 토큰 사용량 집계
                total_prompt_tokens += p_tok
                total_completion_tokens += c_tok
                total_overall_tokens += t_tok
            except Exception as exc:
                print(f"[Fatal] 배치 {idx + 1} 병렬 기동 실패: {exc}")
                raise exc

    print("[Gemini] 모든 병렬 배치 스레드 응답 수신 완료")

    # 토큰 총합 기록 저장
    try:
        token_usage_path = OUTPUT_DIR / "token_usage.txt"
        token_usage_path.write_text(f"{total_prompt_tokens},{total_completion_tokens},{total_overall_tokens}", encoding="utf-8")
        print(f"[Gemini] 합산 토큰 사용량 기록 완료: 입력={total_prompt_tokens}, 출력={total_completion_tokens}, 합계={total_overall_tokens}")
    except Exception as exc:
        print(f"[Gemini] 합산 토큰 기록 실패: {exc}")

    report_progress(60, "AI 응답 통합 병합 및 대본 저장 중...")
    
    # 2. 수신된 모든 스레드 결과를 하나로 정교하게 병합 및 정규화
    merged_csv = merge_csv_results([r for r in batch_results if r])
    
    LLM_RAW_OUTPUT_PATH.write_text("\n\n---\n\n".join([r for r in batch_results if r]), encoding="utf-8")
    LLM_CSV_OUTPUT_PATH.write_text(merged_csv, encoding="utf-8")
    LLM_TXT_OUTPUT_PATH.write_text(csv_to_txt(merged_csv), encoding="utf-8")
    print("[저장] 병합 및 CSV/TXT 대본 생성 완료")

    # 3. 최종 사후 클린업: 작업 성공 시 찌꺼기 파일 완벽 정리
    cleanup_gemini_files(client)

    report_progress(66, "해설 대본 생성 완료")
    print(f"Gemini CSV 대본 저장 완료: {LLM_CSV_OUTPUT_PATH}")
    print(f"Gemini TXT 대본 저장 완료: {LLM_TXT_OUTPUT_PATH}")


if __name__ == "__main__":
    main()
