# 모델 갈아 끼우기

지금은 API 로 돌고, 로컬 모델이 제대로 돌기 시작하면 **환경변수만 바꿔** 옮겨
탄다. 파이프라인 코드(`engine.py` · `LLM.py` · `TTS.py`)는 어느 모델을 쓰는지
모르게 만들어 두었다 — `providers/` 를 거쳐 일꾼을 받아 쓸 뿐이다.

## 지금 어디서 무엇을 부르고 있나

| 하는 일 | 기본값 | 로컬로 바꾸면 |
| --- | --- | --- |
| 장면을 보고 해설 대본 쓰기 (VLM) | Gemini API | OpenAI 호환 서버 (vLLM · Ollama · llama.cpp · LM Studio) |
| 해설 문장을 음성으로 (TTS) | Edge TTS | OpenAI 호환 음성 서버 (Kokoro-FastAPI · openedai-speech 등) |
| 앞뒤 대사 받아 적기 (STT) | Modal GPU 의 whisper | 이 컴퓨터의 faster-whisper |

무음 구간 찾기(Silero VAD), 장면전환 검출, 오디오 믹싱(ffmpeg)은 원래부터 이
컴퓨터에서 돈다. 바깥에 나가는 것은 위 세 개뿐이다.

## 어떻게 바꾸나

`.env` 에 한 줄씩. 셋은 서로 독립이라 **하나씩** 옮겨탈 수 있다 — 대본만 먼저
로컬로 돌리고 음성은 Edge 를 계속 써도 된다.

```bash
VLM_PROVIDER=gemini   # gemini | local   (기본 gemini)
TTS_PROVIDER=edge     # edge   | local   (기본 edge)
STT_PROVIDER=modal    # modal  | local   (기본 modal)
```

아무것도 적지 않으면 지금까지와 똑같이 돈다.

### 로컬 VLM (대본 생성)

```bash
VLM_PROVIDER=local
LOCAL_VLM_BASE_URL=http://localhost:8000/v1     # vLLM
# LOCAL_VLM_BASE_URL=http://localhost:11434/v1  # Ollama
# LOCAL_VLM_BASE_URL=http://localhost:1234/v1   # LM Studio
LOCAL_VLM_MODEL=Qwen2.5-VL-7B-Instruct          # 띄워 둔 모델 이름
LOCAL_VLM_API_KEY=                              # vLLM 을 --api-key 로 띄웠다면
LOCAL_VLM_TIMEOUT_SECONDS=900
LOCAL_VLM_MAX_TOKENS=8192
LOCAL_VLM_MAX_IMAGES_PER_SCENE=0                # 0 = 제한 없음
```

**이미지가 많으면 컨텍스트가 먼저 터진다.** Gemini 는 Files API 에 올려 참조로
넘기지만 로컬 모델은 base64 로 프롬프트에 실어야 해서, 긴 영상에서는 한 요청에
이미지 수백 장이 들어갈 수 있다. 그럴 때 `LOCAL_VLM_MAX_IMAGES_PER_SCENE` 로
scene 당 장수를 줄인다. 솎아낼 때 **처음과 끝 키프레임은 반드시 남긴다** —
장면의 시작과 끝이 빠지면 해설이 엉뚱해지기 때문이다.

프롬프트와 이미지 배치 순서는 Gemini 쪽과 **똑같다**. `[scene 라벨 → 그 scene 의
이미지들]` 을 번갈아 놓기 때문에, 프롬프트를 손대지 않고 모델만 갈아 끼울 수 있다.

### 로컬 TTS (해설 음성)

```bash
TTS_PROVIDER=local
LOCAL_TTS_BASE_URL=http://localhost:8880/v1
LOCAL_TTS_MODEL=tts-1
LOCAL_TTS_VOICE=af_heart          # 서버가 가진 목소리 이름
LOCAL_TTS_FORMAT=wav              # mp3 로 내놓아도 뒤에서 wav 로 맞춘다
LOCAL_TTS_SUPPORTS_SPEED=1        # 배속을 못 받는 서버면 0
```

배속을 못 받아도 괜찮다. 창(window) 안에 문장을 밀어 넣는 마지막 조절은 어차피
뒤에서 `ffmpeg atempo` 가 한 번 더 한다.

### 로컬 STT (앞뒤 대사)

```bash
STT_PROVIDER=local
LOCAL_STT_MODEL=small             # tiny · base · small · medium · large-v3
LOCAL_STT_DEVICE=auto             # auto · cpu · cuda
LOCAL_STT_COMPUTE_TYPE=auto       # faster-whisper 전용: int8 · float16 ...
```

```bash
poetry install --with local       # faster-whisper 설치
```

`faster-whisper` 가 없으면 `openai-whisper` 로 넘어간다. 로컬 쪽이 Modal 보다
유리한 점이 하나 있다 — **모델을 한 번만 올려 두고 모든 클립에 다시 쓴다.**
Modal 은 클립마다 컨테이너가 새로 떠서 매번 모델을 올린다. 대신 클립을 동시에
처리하지는 못하므로, 클립이 아주 많으면 벽시계 시간은 Modal 이 빠를 수 있다.

## 바꾸기 전에 확인

```bash
python -m providers.check          # 셋 다 실제로 대답하는지
python -m providers.check vlm      # 하나만 (vlm · tts · stt)
```

띄워 둔 서버에 짧은 요청을 한 번씩 보내 본다. 파이프라인을 통째로 돌리기 전에
"서버가 떠 있나 · 모델 이름이 맞나 · 목소리 이름이 맞나" 를 몇 초 만에 거른다.

## 갈아 끼우기 자체가 되는지 확인

```bash
python providers/selftest.py
```

모델도 API 키도 없이 돈다. OpenAI 호환 서버를 가짜로 하나 띄우고 진짜 HTTP 왕복을
시킨다. `poetry install` 도 ffmpeg 도 없는 컴퓨터에서 돈다 — 필요한 것은 파이썬뿐이다.

마지막 항목이 특히 중요하다. **`LLM.py` 를 통째로 돌린다** — 전처리가 남기는 것과
같은 모양의 입력(`silence_summary.txt` · `stt_summary.txt` · 키프레임)을 만들어 두고,
`VLM_PROVIDER=local` 로 바꾼 뒤 `ad_script.csv` 가 제대로 나오는지 본다. 파이프라인
코드는 손대지 않은 진짜이고 가짜인 것은 대답하는 모델뿐이라, "provider 만 갈아 껴도
대본이 나온다"가 여기서 증명된다.

## 구조

```
providers/
  __init__.py     get_vlm() · get_tts() · get_stt() — 환경변수로 고른다
  base.py         주고받는 모양. 글자 · 파일 경로 · 초뿐이고 특정 SDK 자료구조가 없다
  vlm_gemini.py   지금 쓰는 것 — Files API 업로드, 503/429 재시도
  vlm_local.py    OpenAI 호환 /chat/completions, 이미지는 base64
  tts_edge.py     지금 쓰는 것
  tts_local.py    OpenAI 호환 /audio/speech
  stt_modal.py    지금 쓰는 것 — modal_workers.py 에 배포한 whisper
  stt_local.py    이 컴퓨터의 faster-whisper (없으면 openai-whisper)
  check.py        띄워 둔 서버가 대답하는지
  selftest.py     갈아 끼우기 자체가 되는지 (모델 없이)
```

핵심은 `base.py` 다. 주고받는 값에 `google.genai` 타입이 하나도 없기 때문에
provider 를 바꿔도 파이프라인이 눈치채지 못한다.

## 바뀐 것 — 결과 파일 이름

로컬 모델이 쓴 대본이 `gemini_ad_script.csv` 에 담기면 헷갈리므로 이름을 중립으로
바꿨다.

| 전 | 후 |
| --- | --- |
| `gemini_ad_raw.txt` | `ad_raw.txt` |
| `gemini_ad_script.csv` | `ad_script.csv` |
| `gemini_ad_script.txt` | `ad_script.txt` |

`TTS.py` 는 옛 이름도 계속 읽는다. 이름을 바꾸기 전에 만들어 둔 작업 폴더가
그대로 살아 있어도 문제없다.

## 아직 남은 것

- **로컬 VLM 실측** — 가짜 서버로 왕복은 확인했지만, 실제 모델이 CSV 형식을
  얼마나 잘 지키는지는 모델을 띄워 봐야 안다. `normalize_csv_text()` 가 코드블록과
  `silence001` 같은 접두사는 걷어내지만, 헤더 자체가 틀리면 그대로 실패한다.
  로컬 모델이 형식을 자주 어기면 그때 프롬프트를 손보거나 재시도 규칙을 넣는다.
- **이미지 리사이즈** — 지금은 원본 그대로 base64 로 싣는다. 컨텍스트가 모자라면
  장수를 줄이는 것(`LOCAL_VLM_MAX_IMAGES_PER_SCENE`) 말고 해상도를 줄이는 길도
  있는데, 그건 Pillow 의존성이 필요해서 넣지 않았다.
