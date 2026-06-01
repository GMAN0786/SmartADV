# 파이썬 외부 터미널을 사용하기 위함
import subprocess
import sys

# 운영체제와 상호작용하기 위한 모듈
import os

# 실행 시간 측정 및 CPU 모니터링 모듈
import time
import psutil

# FFmpeg 로그 분석을 위한 정규표현식 모듈
import re
import glob

# 파이토치 임포트 (Silero VAD EC2 로컬 실행용)
import torch

# Modal GPU 워커 호출 - STT 전용 (modal_workers.py 참고)
# 사전 조건: modal deploy modal_workers.py 로 배포 완료 필요
import modal
from pathlib import Path


def report_progress(pct: int, message: str):
    """PROGRESS:XX:message 형식으로 stdout에 출력하여 Java 백엔드에 세부 진행률을 전달합니다."""
    print(f"PROGRESS:{pct}:{message}", flush=True)

# --설정 영역 start--

# 분석할 원본 동영상 파일
INPUT_FILE = os.getenv("SMARTADV_INPUT", "input.mp4")

# 잘라낸 무음 구간 클립들을 모아둘 폴더명
OUTPUT_DIR = os.getenv("SMARTADV_OUTPUT", "output_clips")

# Silero VAD 모델이 분석하기 위해 사용할 임시 오디오 파일의 이름
TEMP_WAV = os.path.join(OUTPUT_DIR, "temp_16k.wav")

# 너무 짧은 구간을 무시하기 위한 최소길이 (초)
MIN_SILENCE_DURATION = 5.0

# 장면 전환(카메라 컷) 감지 민감도 (기본 0.3)
SCENE_THRESHOLD = 0.30

# 장면 캡처시 캡처 간격 설정
SCENE_GAP = 1.0
MIN_SCENE_DURATION = 4.5

# 장면전환 간격이 이보다 짧으면 하나의 scene으로 묶음 (초)
MIN_CUT_WINDOW = 5.0

# 무음 구간 전후 음원 추출 시 추출할 길이
CONTEXT_WINDOW = 15.0
CONTEXT_AUDIO_DIR = os.path.join(OUTPUT_DIR, "context_audio")

STT_OUTPUT_FILE = os.path.join(OUTPUT_DIR, "stt_summary.txt")

# --설정 영역 end--


def get_video_duration(file_path):
    # 영상 전체 길이를 초 단위로 알아내기 위한 함수
    # ffprobe는 ffmpeg 와 함께 깔리는 미디어 정보 분석 도구
    # 영상 포맷 정보 중 duration 만 정확히 텍스트로 뽑아내도록 함

    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
        "default=noprint_wrappers=1:nokey=1", file_path
    ]

    # cmd에 저장한 명령어를 터미널에 입력하고, 나온 결과를 문자열로 치환후 양쪽 공백 제거
    result = subprocess.check_output(cmd).decode("utf-8").strip()

    return float(result)


def detect_scene_changes(video_path, threshold=0.3, start_time=None, end_time=None, min_scene_duration=3.0):
    """FFmpeg의 gt(scene, threshold) + showinfo를 이용해 장면 전환 타임스탬프를 추출합니다."""
    cmd = ["ffmpeg", "-y"]

    if start_time is not None:
        cmd.extend(["-ss", str(start_time)])
    if end_time is not None:
        cmd.extend(["-to", str(end_time)])

    cmd.extend([
        "-i", video_path,
        "-filter:v", f"select='gt(scene,{threshold})',showinfo",
        "-f", "null", "-"
    ])

    result = subprocess.run(cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL, text=True, encoding='utf-8')

    raw_scene_times = []
    for line in result.stderr.splitlines():
        if "Parsed_showinfo" in line and "pts_time:" in line:
            match = re.search(r"pts_time:([0-9.]+)", line)
            if match:
                time_val = float(match.group(1))
                if time_val > 0.1:  # 극초반 0초에 잡히는 가짜 컷은 무시
                    raw_scene_times.append(time_val)

    # 장면전환이 한 번 감지되면, 그 이후 min_scene_duration 초 동안은 추가 감지를 무시하는 쿨다운 필터링
    filtered_scene_times = []
    last_kept_time = None
    for scene_time in raw_scene_times:
        if last_kept_time is None or scene_time >= last_kept_time + min_scene_duration:
            filtered_scene_times.append(scene_time)
            last_kept_time = scene_time

    return filtered_scene_times


def format_timestamp(seconds):
    # 초 단위를 HH:MM:SS:mmm 형식 문자열로 변환
    seconds = max(0.0, seconds)
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_seconds = total_ms // 1000
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:02d}:{ms:03d}"


def group_cuts_into_scenes(scene_times, silence_start, silence_end):
    """첫 장면전환 시점부터 누적하여, 다음 cut을 포함하면 span >= 5초가 되는 시점에서 scene을 끊습니다.
    마지막 scene의 window(first_cut ~ silence_end)가 5초 미만이면 이전 scene에 합칩니다.
    반환: [ [abs_time, ...], ... ]  — 각 리스트가 하나의 scene(절대 시각)."""
    if not scene_times:
        return []

    absolute_times = [silence_start + t for t in scene_times]
    scenes = []
    current_scene = [absolute_times[0]]
    scene_start = absolute_times[0]

    for i in range(1, len(absolute_times)):
        if absolute_times[i] - scene_start >= MIN_CUT_WINDOW:
            scenes.append(current_scene)
            current_scene = [absolute_times[i]]
            scene_start = absolute_times[i]
        else:
            current_scene.append(absolute_times[i])

    scenes.append(current_scene)

    # 마지막 scene의 window(first_cut ~ silence_end)가 5초 미만이면 이전 scene에 합침
    if len(scenes) >= 2:
        last_window = silence_end - scenes[-1][0]
        if last_window < MIN_CUT_WINDOW:
            scenes[-2] = scenes[-2] + scenes[-1]
            scenes.pop()

    return scenes


def write_silence_summary(silence_summaries):
    output_path = os.path.join(OUTPUT_DIR, "silence_summary.txt")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("[silence timestamp summary]\n")

        if not silence_summaries:
            f.write("no silence segments found.\n")
        else:
            for summary in silence_summaries:
                silence_start_text = format_timestamp(summary['start'])
                silence_end_text = format_timestamp(summary['end'])
                f.write(f"silence{summary['index']:03d} ({silence_start_text} ~ {silence_end_text})\n")

                scenes = summary.get('scenes', [])
                if not scenes:
                    pass  # 장면전환 없음 — 해설 대상 없음
                else:
                    for i, scene_transitions in enumerate(scenes):
                        first_cut = scene_transitions[0]
                        if i + 1 < len(scenes):
                            window_end = scenes[i + 1][0]  # 다음 scene의 첫 장면전환
                        else:
                            window_end = summary['end']     # 마지막 scene은 silence 끝까지
                        f.write(f"scene{i + 1:03d} ({format_timestamp(first_cut)} ~ {format_timestamp(window_end)})\n")

                f.write("\n")

    print(f"\n무음 구간 요약이 파일로 저장되었습니다: {output_path}")


def write_stt_summary(silence_summaries):
    """Modal STT 결과(pre-computed)를 파일로 기록합니다.

    silence_summaries 각 항목에 'before_stt_segments' / 'after_stt_segments' 키가
    이미 채워져 있어야 합니다. (main()의 STEP 5에서 Modal .map() 결과로 채움)
    """
    with open(STT_OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("[무음 구간 전후 대사 추출 결과]\n\n")

        if not silence_summaries:
            f.write("전사할 무음 구간 정보가 없습니다.\n")
            print(f"\nSTT 결과가 파일로 저장되었습니다: {STT_OUTPUT_FILE}")
            return

        for summary in silence_summaries:
            print(f"   -> 무음구간 {summary['index']} 전/후 대사 기록 중...")

            for side_key, side_label in (("before", "전"), ("after", "후")):
                f.write(f"[무음구간{summary['index']} {side_label}]\n")

                segments = summary.get(f"{side_key}_stt_segments", [])
                time_offset = summary.get(f"{side_key}_time_offset")

                if not segments or time_offset is None:
                    f.write("대사 없음\n\n")
                    continue

                for seg_idx, segment in enumerate(segments, start=1):
                    absolute_time = time_offset + segment['relative_start']
                    f.write(
                        f"대사 {seg_idx} {segment['text']} ({format_timestamp(absolute_time)})\n"
                    )

                f.write("\n")

    print(f"\nSTT 결과가 파일로 저장되었습니다: {STT_OUTPUT_FILE}")


def main():
    # 초정밀 타이머 시작 및 CPU 점유율 측정 기준점 설정
    start_time = time.perf_counter()
    psutil.cpu_percent(percpu=True)  # 첫 호출로 0%부터 측정 시작을 위한 베이스라인 세팅

    # OUTPUT_DIR이 존재하지 않는 경우, 생성
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(CONTEXT_AUDIO_DIR, exist_ok=True)

    # 이전 실행의 scene 이미지, 비디오 클립 및 모드 파일 정리
    for old_img in glob.glob(os.path.join(OUTPUT_DIR, "silence*_scene*_cut*.jpg")):
        try: os.remove(old_img)
        except: pass
    for old_vid in glob.glob(os.path.join(OUTPUT_DIR, "silence*_scene*.mp4")):
        try: os.remove(old_vid)
        except: pass
    old_mode = os.path.join(OUTPUT_DIR, "llm_mode.txt")
    if os.path.exists(old_mode):
        try: os.remove(old_mode)
        except: pass
    print("[정리] 이전 scene 이미지, 비디오 클립 및 모드 파일 삭제 완료")

    # Modal GPU 워커 참조 (STT 전용)
    # modal deploy modal_workers.py 로 배포한 함수를 이름으로 조회합니다.
    # MODAL_TOKEN_ID / MODAL_TOKEN_SECRET 환경변수(또는 ~/.modal.toml)가 필요합니다.
    run_stt = modal.Function.from_name("smartadv", "run_stt")

    # STEP 1. ffmpeg를 통한 분석 오디오 추출

    report_progress(2, "영상에서 오디오를 추출하는 중...")
    print("[1/5] 영상에서 오디오를 추출하는 중...")

    # Silero VAD는 16KHz 오디오를 가장 잘 인식하기에, 원본 소스를 16KHz로 리샘플링
    # -y : 덮어쓰기 허용 / -vn : 비디오 제외 / -ac 1: 모노채널 / -ar 16000: 16KHz
    subprocess.run(["ffmpeg", "-y", "-i", INPUT_FILE, "-vn",
                    "-ac", "1", "-ar", "16k", TEMP_WAV],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # STEP 2. Silero VAD 로드 및 음성(대사) 구간 탐지 (EC2 CPU 로컬 실행)

    report_progress(8, "Silero VAD 모델 로드 및 대사 구간 탐지 중...")
    print("[2/5] Silero VAD 모델 로드 및 대사 구간 탐지 중...")

    # PyTorch Hub를 이용해 Silero VAD 모델 로드
    # 로컬에 캐시된 모델이 없으면 자동 다운로드
    model, utils = torch.hub.load(
        repo_or_dir='snakers4/silero-vad',
        model='silero_vad',
        trust_repo=True
    )
    get_speech_timestamps, _, read_audio, _, _ = utils

    # 방금 전 FFmpeg로 만든 16kHz 임시 오디오 파일을 읽어 들임
    wav = read_audio(TEMP_WAV)

    # 진폭 게이팅: -45dB 이하 소리는 무시
    amplitude_limit = 10 ** (-45.0 / 20)
    wav[wav.abs() < amplitude_limit] = 0.0

    speech_timestamps = get_speech_timestamps(
        wav,
        model,
        sampling_rate=16000,
        return_seconds=True,
        threshold=0.5,
        min_speech_duration_ms=250,
        min_silence_duration_ms=100,
    )
    print(f"   -> {len(speech_timestamps)}개의 음성 구간 감지 완료")

    # STEP 3. 무음(Non-speech) 구간 계산 (음성 구간의 반전)

    report_progress(16, "무음 구간 타임스탬프 계산 중...")
    print("[3/5] 무음 구간 타임스탬프 계산 중...")

    # 영상의 총 길이를 먼저 구함
    total_duration = get_video_duration(INPUT_FILE)
    silence_timestamps = []
    current_time = 0.0

    # VAD가 찾아낸 '대사가 있는 구간'들을 하나씩 꺼내보면서 그 사이사이의 빈틈(무음)을 찾음
    for speech in speech_timestamps:
        start_speech = speech['start']  # 대사가 시작되는 시간
        end_speech = speech['end']      # 대사가 끝나는 시간

        # 이전 대사가 끝난 시간(current_time)보다 다음 대사가 늦게 시작한다면, 그 사이가 무음 구간
        if start_speech > current_time:
            silence_timestamps.append({'start': current_time, 'end': start_speech})

        # 탐색 위치를 방금 끝난 대사의 종료 시간으로 업데이트
        current_time = end_speech

    # 영상 맨 마지막에 남은 꼬리 부분도 무음 구간으로 처리
    if current_time < total_duration:
        silence_timestamps.append({'start': current_time, 'end': total_duration})

    # STEP 4. FFmpeg로 무음 구간 원본 영상에서 잘라내기 및 장면 분석

    # Pass 0: 전체 비디오(원본) 대상 글로벌 장면 전환 분석 (딱 1회)
    report_progress(18, "전체 비디오에서 글로벌 장면 전환 분석 중...")
    print(" -> [글로벌 분석] 전체 비디오 대상 글로벌 장면 감지 수행 중...")
    global_scene_times = detect_scene_changes(
        INPUT_FILE,
        threshold=SCENE_THRESHOLD,
        min_scene_duration=MIN_SCENE_DURATION,
    )
    print(f" -> 글로벌 분석 완료 (총 {len(global_scene_times)}개의 장면 전환점 감지됨)")

    report_progress(20, f"총 {len(silence_timestamps)}개 무음 구간 분할 및 장면 분석 중...")
    print(f"[4/5] 총 {len(silence_timestamps)}개의 무음 구간을 FFmpeg로 분할 및 분석합니다...")

    clip_count = 0
    silence_summaries = []

    # Pass 1: 무음 구간 오디오 추출 및 장면 전환 분석
    for silence in silence_timestamps:
        start = silence['start']
        end = silence['end']
        duration = end - start  # 잘라낼 영상의 길이 계산

        # 무음 구간이 설정한 최소 길이보다 짧으면 무시하고 넘어감
        if duration < MIN_SILENCE_DURATION:
            continue

        clip_count += 1
        print(f"\n무음구간 {clip_count:03d} 분석 중... (구간: {start:.2f}초 ~ {end:.2f}초, 길이: {duration:.2f}초)")

        # 무음구간 전후 15초 구간 음원 추출 로직 (before / after 분리)
        before_start = max(0.0, start - CONTEXT_WINDOW)
        before_end = start
        before_duration = max(0.0, before_end - before_start)
        before_audio_file = os.path.join(CONTEXT_AUDIO_DIR, f"silence_{clip_count:03d}_before.wav")

        after_start = end
        after_end = min(total_duration, end + CONTEXT_WINDOW)
        after_duration = max(0.0, after_end - after_start)
        after_audio_file = os.path.join(CONTEXT_AUDIO_DIR, f"silence_{clip_count:03d}_after.wav")

        if before_duration > 0:
            subprocess.run([
                "ffmpeg", "-y",
                "-i", TEMP_WAV,
                "-ss", str(before_start),
                "-to", str(before_end),
                "-ac", "1",
                "-ar", "16000",
                before_audio_file
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            print(
                f"   -> 이전 문맥 음원 추출 완료: {before_audio_file} "
                f"({before_start:.2f}초 ~ {before_end:.2f}초, 길이: {before_duration:.2f}초)"
            )
        else:
            print("   -> 이전 문맥 음원 없음 (영상 시작 구간과 맞닿아 있음)")

        if after_duration > 0:
            subprocess.run([
                "ffmpeg", "-y",
                "-i", TEMP_WAV,
                "-ss", str(after_start),
                "-to", str(after_end),
                "-ac", "1",
                "-ar", "16000",
                after_audio_file
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            print(
                f"   -> 이후 문맥 음원 추출 완료: {after_audio_file} "
                f"({after_start:.2f}초 ~ {after_end:.2f}초, 길이: {after_duration:.2f}초)"
            )
        else:
            print("   -> 이후 문맥 음원 없음 (영상 끝 구간과 맞닿아 있음)")

        # --- 장면 전환(컷) 분석 및 프레임/샷 분할 (글로벌 컷 분할 및 메모리 필터링) ---
        scene_times = [t - start for t in global_scene_times if start <= t <= end]

        # 장면전환 간격 < 5초인 것들을 scene 단위로 묶기
        scenes = group_cuts_into_scenes(scene_times, start, end)

        silence_summaries.append({
            'index': clip_count,
            'start': start,
            'end': end,
            'scene_times': scene_times,
            'scenes': scenes,
            'before_audio_file': before_audio_file if before_duration > 0 else None,
            'before_time_offset': before_start if before_duration > 0 else None,
            'after_audio_file': after_audio_file if after_duration > 0 else None,
            'after_time_offset': after_start if after_duration > 0 else None,
        })

    # 모드 결정 및 토큰 계산
    total_images = 0
    total_video_duration = 0.0

    for summary in silence_summaries:
        scenes = summary.get('scenes', [])
        for i, scene_transitions in enumerate(scenes):
            total_images += len(scene_transitions) * 2  # 컷당 2개의 이미지
            
            first_cut = scene_transitions[0]
            if i + 1 < len(scenes):
                window_end = scenes[i + 1][0]
            else:
                window_end = summary['end']
            
            total_video_duration += (window_end - first_cut)

    # 토큰 비용 계산
    image_tokens = total_images * 1120
    video_tokens = total_video_duration * 140  # 2fps * 70 tokens/frame = 140 tokens/sec

    # SMARTADV_CLIP_MODE 환경변수 획득
    clip_mode = os.getenv("SMARTADV_CLIP_MODE", "AUTO")
    print(f"\n[비용 분석 및 작동 모드 결정] (설정된 모드: {clip_mode})")
    print(f" - 총 이미지 예상 수: {total_images} 장 (예상 토큰: {image_tokens:,})")
    print(f" - 총 비디오 예상 재생 시간: {total_video_duration:.2f} 초 (예상 토큰: {video_tokens:,.0f})")

    if clip_mode == "FORCE_IMAGE":
        llm_mode = "IMAGE"
        print(" -> [강제 설정] FORCE_IMAGE 모드에 의해 항상 IMAGE 모드로 동작합니다.")
    elif clip_mode == "FORCE_VIDEO":
        llm_mode = "VIDEO"
        print(" -> [강제 설정] FORCE_VIDEO 모드에 의해 항상 VIDEO 모드로 동작합니다.")
    else:
        # AUTO 모드
        if total_images > 0 and image_tokens > video_tokens:
            llm_mode = "VIDEO"
            print(f" -> 이미지 비용({image_tokens:,} 토큰)이 비디오 비용({video_tokens:,.0f} 토큰)보다 비싸므로 VIDEO 모드로 전환합니다.")
        else:
            llm_mode = "IMAGE"
            print(f" -> 이미지 비용({image_tokens:,} 토큰)이 더 효율적이거나 비디오가 필요 없으므로 IMAGE 모드를 유지합니다.")

    # llm_mode.txt 에 저장
    mode_file = os.path.join(OUTPUT_DIR, "llm_mode.txt")
    with open(mode_file, "w", encoding="utf-8") as f:
        f.write(llm_mode)
    print(f" -> 작동 모드 저장 완료: {mode_file} -> {llm_mode}")

    # Pass 2: 미디어(이미지 혹은 비디오 클립) 추출
    for summary in silence_summaries:
        clip_count = summary['index']
        scenes = summary.get('scenes', [])
        start = summary['start']
        end = summary['end']

        if not scenes:
            print(f"\n무음구간 {clip_count:03d}: 장면 전환 없음.")
            continue

        total_transitions = sum(len(s) for s in scenes)
        
        if llm_mode == "VIDEO":
            print(f"\n무음구간 {clip_count:03d}: {total_transitions}번의 장면 전환 → {len(scenes)}개 scene 비디오 추출 시작...")
            for scene_idx, scene_transitions in enumerate(scenes, start=1):
                first_cut = scene_transitions[0]
                if scene_idx < len(scenes):
                    window_end = scenes[scene_idx][0]
                else:
                    window_end = end

                # 비디오 슬라이싱 480p 온더플라이 리사이징 추출
                # clip의 해상도는 480p로 하되, 가로세로 비율 유지.
                # 세로를 480으로 하고, 가로는 원본 비율을 유지하도록 -2로 설정.
                vid_out = os.path.join(OUTPUT_DIR, f"silence{clip_count:03d}_scene{scene_idx:03d}.mp4")
                print(f"   -> scene{scene_idx:03d} 비디오 추출 중 ({first_cut:.2f}초 ~ {window_end:.2f}초, 길이: {window_end - first_cut:.2f}초) -> {vid_out}")
                
                subprocess.run([
                    "ffmpeg", "-y",
                    "-ss", str(first_cut),
                    "-to", str(window_end),
                    "-i", INPUT_FILE,
                    "-vf", "scale=-2:480",
                    "-c:v", "libx264",
                    "-preset", "ultrafast",
                    "-an",
                    vid_out
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            print(f"\n무음구간 {clip_count:03d}: {total_transitions}번의 장면 전환 → {len(scenes)}개 scene 이미지 추출 시작...")
            for scene_idx, scene_transitions in enumerate(scenes, start=1):
                img_seq = 0
                for transition_time in scene_transitions:
                    before_time = max(0.0, transition_time - 0.1)
                    after_time = transition_time + SCENE_GAP

                    # 직전 프레임 추출 (원본 비디오 고품질 참조)
                    img_seq += 1
                    img_before = os.path.join(OUTPUT_DIR, f"silence{clip_count:03d}_scene{scene_idx:03d}_cut{img_seq:02d}.jpg")
                    subprocess.run([
                        "ffmpeg", "-y", "-ss", str(before_time), "-i", INPUT_FILE,
                        "-vframes", "1", "-q:v", "2", img_before
                    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

                    # 직후 프레임 추출 (원본 비디오 고품질 참조)
                    img_seq += 1
                    img_after = os.path.join(OUTPUT_DIR, f"silence{clip_count:03d}_scene{scene_idx:03d}_cut{img_seq:02d}.jpg")
                    subprocess.run([
                        "ffmpeg", "-y", "-ss", str(after_time), "-i", INPUT_FILE,
                        "-vframes", "1", "-q:v", "2", img_after
                    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # STEP 5. Modal GPU — 모든 context audio 클립 병렬 STT

    report_progress(28, "Modal GPU에서 병렬 음성 인식 전사 중...")
    print("[5/5] Modal GPU에서 한국어 음성 전사 중...")

    # STT를 돌릴 (summary_index, side_key, audio_path) 목록 수집
    stt_tasks = []
    for i, summary in enumerate(silence_summaries):
        for side_key in ("before", "after"):
            audio_file = summary.get(f"{side_key}_audio_file")
            time_offset = summary.get(f"{side_key}_time_offset")
            if audio_file and time_offset is not None and os.path.exists(audio_file):
                stt_tasks.append((i, side_key, audio_file))

    # silence_summaries에 STT 결과 키 초기화
    for summary in silence_summaries:
        summary['before_stt_segments'] = []
        summary['after_stt_segments'] = []

    if stt_tasks:
        print(f"   -> {len(stt_tasks)}개 오디오 클립을 Modal에서 병렬 전사합니다...")
        audio_bytes_list = [Path(task[2]).read_bytes() for task in stt_tasks]

        # .map() : 각 클립마다 Modal이 별도 GPU 컨테이너를 띄워 병렬 처리
        stt_results = list(run_stt.map(audio_bytes_list))

        # 결과를 silence_summaries에 채워 넣기
        for task, result in zip(stt_tasks, stt_results):
            summary_idx, side_key, _ = task
            silence_summaries[summary_idx][f'{side_key}_stt_segments'] = result or []
    else:
        print("   -> 전사할 오디오 클립이 없습니다.")

    write_silence_summary(silence_summaries)
    write_stt_summary(silence_summaries)

    # 임시 오디오 삭제하여 용량 확보
    if os.path.exists(TEMP_WAV):
        os.remove(TEMP_WAV)

    report_progress(33, "전처리 엔진 완료")
    print("\n모든 작업이 완료되었습니다")

    # [모니터링 종료 및 결과 출력]
    end_time = time.perf_counter()
    cpu_loads = psutil.cpu_percent(percpu=True)

    print("\n" + "=" * 40)
    print("[시스템 성능 프로파일링 결과]")
    print("=" * 40)
    print(f" 총 실행 시간 : {end_time - start_time:.3f} 초")
    print(f"코어별 평균 CPU 점유율:")
    for i, load in enumerate(cpu_loads):
        print(f"   - Core {i:02d}: {load:5.1f}%")
    print("=" * 40)


# 이 파이썬 파일을 직접 실행했을 때만 main() 함수가 작동하도록 하는 파이썬의 표준적인 관용구
if __name__ == "__main__":
    main()
