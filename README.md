# 장면 톡! (SCENE TALK!)

영상의 **대사 없는 구간**을 찾아, 그 사이에 무슨 일이 벌어지는지 말로 설명해 주는
화면해설(Audio Description)을 자동으로 만들어 원본에 얹는다.

시각장애인이 영상을 볼 때 막히는 지점은 소리가 없는 곳이 아니라 **소리만으로는
알 수 없는 곳**이다. 사람이 직접 쓰는 화면해설은 품질이 좋지만 편당 비용과 시간이
커서 대부분의 영상에는 붙지 않는다. 이 프로젝트는 그 간격을 자동화로 메운다.

| | |
|---|---|
| 팀 | AJNA — 이유준(팀장) · 이강민 · 박지훈 |
| 결과물 | 해설이 합성된 영상(`input_with_ad.mp4`) · 해설 음성(`.m4a`) · 해설 대본(CSV) |
| 형태 | 웹 서비스, 같은 번들을 Capacitor 로 감싼 안드로이드 앱 |

## 지금 어디까지 되어 있나

전처리 → 대본 생성 → 음성 합성 → 영상 믹싱까지 **한 번에 돌아간다.** 웹에서 영상을
올리면 진행률이 단계별로 갱신되고, 끝나면 재생 화면에서 바로 들을 수 있다.

모델은 아직 **외부 API로 돈다.** 자체 모델을 파인튜닝하기 전까지는 API를 쓰고,
준비되면 파이프라인 코드를 고치지 않고 환경변수만 바꿔 옮겨탈 수 있게 해 두었다.

| 하는 일 | 지금 | 나중에 |
|---|---|---|
| 장면을 보고 해설 대본 쓰기 (VLM) | Gemini API | OpenAI 호환 서버 (vLLM · Ollama · llama.cpp · LM Studio) |
| 해설 문장을 음성으로 (TTS) | Edge TTS | OpenAI 호환 음성 서버 |
| 앞뒤 대사 받아 적기 (STT) | Modal GPU 의 whisper | 이 컴퓨터의 faster-whisper |

무음 구간 찾기(Silero VAD), 장면전환 검출, 오디오 믹싱(ffmpeg)은 원래부터 로컬에서
돈다. 바깥으로 나가는 것은 위 셋뿐이다. → [docs/PROVIDERS.md](docs/PROVIDERS.md)

## 서버 없이 먼저 둘러보기

백엔드도 API 키도 구글 로그인도 없이 화면 흐름 전체를 눌러 볼 수 있다.

```bash
cd frontend
npm install
npm run demo          # → http://localhost:5173
```

"체험 시작하기"를 누르면 업로드 · 생성 4단계 · 완료 · 재생 · 보관함이 전부 실제처럼
돈다(생성은 14초로 줄여 두었다). 가짜인 것은 로그인 · 서버 응답 · 소요 시간뿐이고,
화면 · 조작 · 접근성 · 라우팅 · 해설 대본 파서 · 오디오 구간 동기화는 진짜다.

## 전체 실행

### 필요한 것

- **ffmpeg** — 오디오 추출 · 장면전환 검출 · 키프레임 추출 · 최종 믹싱에 전부 쓴다
- **Python 3.11 ~ 3.14** + [Poetry](https://python-poetry.org/)
- **JDK 17+** (백엔드)
- **Node 20+** (프런트엔드)
- **Gemini API 키**, **Modal 계정** (기본 설정으로 돌릴 때)

### 설치

```bash
poetry install                    # 파이프라인
poetry install --with local       # + 로컬 STT(faster-whisper)까지 쓸 때만

cd frontend && npm install
```

`.env` 를 저장소 루트에 만든다 (→ [환경변수](#환경변수)).

### Modal STT 워커 배포

기본 설정(`STT_PROVIDER=modal`)은 Modal 의 T4 GPU 에서 whisper 를 돌린다. 한 번만
배포해 두면 된다.

```bash
modal deploy modal_workers.py
```

로컬 whisper 로 돌릴 거면 이 단계는 건너뛰고 `STT_PROVIDER=local` 로 둔다.

### 띄우기

터미널 두 개.

```bash
# 백엔드 (8080)
cd backend && ./mvnw spring-boot:run

# 프런트엔드 (5173, /api 는 8080 으로 프록시)
cd frontend && npm run dev
```

`http://localhost:5173` 에서 영상을 올리면 백엔드가 파이썬 파이프라인을 비동기로
띄우고, 진행률이 1.5초마다 갱신된다.

### 파이프라인만 따로 돌리기

웹을 거치지 않고 손으로 돌려 볼 때.

```bash
export SMARTADV_INPUT=input.mp4
export SMARTADV_OUTPUT=output_clips

poetry run python engine.py     # 전처리  (1~33%)
poetry run python LLM.py        # 대본    (34~66%)
poetry run python TTS.py        # 음성·믹싱 (67~99%)
```

세 단계는 `SMARTADV_OUTPUT` 안의 파일로만 이어진다. 중간에 멈췄다가 뒤쪽만 다시
돌려도 된다.

## 영상이 해설이 되기까지

### 1. 전처리 — `engine.py`

```
원본 영상
  └─ ffmpeg             16kHz 모노 wav 로 추출 (VAD 가 가장 잘 읽는 형식)
  └─ Silero VAD         대사 구간 탐지 (-25dB 이하는 무시)
  └─ 구간 반전          대사 사이의 빈틈 = 무대사 구간
  └─ 5초 미만 버림      해설을 넣을 수 없는 구간은 제외
       │
       ├─ 전후 15초 오디오 분리 → STT 전사 → 앞뒤 대사 확보
       └─ ffmpeg scene detect → 장면전환 시각 → 전환 앞뒤 키프레임 jpg 추출
```

무대사 구간 안에서도 장면이 여러 번 바뀌면 한 문장으로 설명할 수 없다. 그래서 전환
간격이 가까운 컷들을 **scene** 으로 묶어, 구간을 `silence → scene → cut` 3단으로
쪼갠다. 해설은 scene 단위로 하나씩 쓰인다.

**남는 것** — `silence_summary.txt`(구간·scene 구조), `stt_summary.txt`(앞뒤 대사),
`silenceNNN_sceneNNN_cutNN.jpg`(키프레임)

주요 기준값은 `engine.py` 상단 상수로 모여 있다 — 무음 최소 길이 5초, 장면전환
민감도 0.25, scene 최소 길이 3초, 문맥 오디오 15초.

### 2. 해설 대본 — `LLM.py`

전처리 산출물을 하나의 프롬프트로 엮어 VLM 에 보낸다. scene 라벨과 그 scene 의
키프레임을 **번갈아** 배치하므로, 어떤 이미지가 어느 장면 것인지 모델이 헷갈리지
않는다.

해설이 구간을 넘치면 원본 대사와 겹친다. 그래서 scene 마다 **읽을 수 있는 최대
음절수**를 미리 계산해(초당 4음절 기준, 여유 0.5초) 프롬프트에 박아 넣는다. 앞뒤
대사는 행동을 추론하는 참고용으로만 주고 출력에 쓰지 못하게 하며, 감정 해석과
추측성 표현은 금지한다.

**남는 것** — `ad_script.csv`

```csv
silence_id,scene_id,window_start,window_end,text
1,1,00:01:23:400,00:01:31:000,남자가 문을 열고 들어와 주위를 살핀다
```

`ad_raw.txt`(모델 원본 응답)와 `ad_script.txt`(사람이 읽기 쉬운 형태)도 함께 남는다.

### 3. 음성 합성과 믹싱 — `TTS.py`

대본 한 줄이 음성 파일 하나가 된다. 만들어 본 길이가 구간을 넘으면 ffmpeg `atempo`
로 **최대 1.3배까지만** 압축한다 — 그 이상 빨라지면 알아듣기 어렵다.

해설을 원본 위에 그냥 얹으면 대사와 효과음에 묻힌다. `sidechaincompress` 로
**해설이 나오는 동안만 원본 음량을 동적으로 낮춰**(Audio Ducking) 자연스럽게 섞는다.

**남는 것** — `input_with_ad.mp4`(해설이 합성된 영상), `input_with_ad_audio.m4a`(해설
음성만), `tts_timeline.csv`(구간별 실제 배속·길이 기록)

## 모델 갈아끼우기

`.env` 에 한 줄씩. 셋은 서로 독립이라 **하나씩** 옮겨탈 수 있다 — 대본만 먼저 로컬로
돌리고 음성은 Edge 를 계속 써도 된다.

```bash
VLM_PROVIDER=gemini   # gemini | local
TTS_PROVIDER=edge     # edge   | local
STT_PROVIDER=modal    # modal  | local
```

파이프라인 코드(`engine.py` · `LLM.py` · `TTS.py`)는 어느 모델을 쓰는지 모른다.
`providers/` 를 거쳐 일꾼을 받아 쓸 뿐이다. `providers/base.py` 가 주고받는 값에
특정 SDK 타입이 하나도 없어서 — 글자 · 파일 경로 · 초뿐이라 — provider 를 바꿔도
파이프라인이 눈치채지 못한다.

바꾸기 전에 확인하는 방법 두 가지.

```bash
python -m providers.check       # 띄워 둔 서버가 실제로 대답하는지 (몇 초)
python providers/selftest.py    # 갈아끼우기 자체가 되는지 — 모델도 API 키도 없이 돈다
```

`selftest.py` 는 가짜 OpenAI 호환 서버를 띄우고 `LLM.py` 를 통째로 돌려
`ad_script.csv` 가 나오는지 본다. 파이프라인 코드는 손대지 않은 진짜이고 가짜인 것은
대답하는 모델뿐이다.

자세한 설정값과 주의점은 → [docs/PROVIDERS.md](docs/PROVIDERS.md)

## 저장소 구조

```
engine.py              전처리 — VAD · 무음 구간 · 장면전환 · 키프레임 · STT
LLM.py                 해설 대본 — 프롬프트 구성 · VLM 호출 · CSV 정규화
TTS.py                 음성 합성 · Audio Ducking · 최종 믹싱
modal_workers.py       Modal GPU whisper 워커 (modal deploy 로 올린다)

providers/             모델을 부르는 자리를 한 군데로 모은 곳
  base.py                주고받는 모양 — SDK 타입이 없다
  vlm_gemini.py          지금 쓰는 것 — Files API 업로드, 503/429 재시도
  vlm_local.py           OpenAI 호환 /chat/completions, 이미지는 base64
  tts_edge.py            지금 쓰는 것
  tts_local.py           OpenAI 호환 /audio/speech
  stt_modal.py           지금 쓰는 것
  stt_local.py           faster-whisper (없으면 openai-whisper)
  check.py               띄워 둔 서버가 대답하는지
  selftest.py            갈아끼우기가 되는지 (모델 없이)

backend/               Spring Boot 4 — REST API · 비동기 워커 · JPA · S3
frontend/              React 19 + Vite — 웹 화면, Capacitor 로 안드로이드 앱
docs/                  문서
past_trials/           초기 시행착오 기록 (현재 파이프라인에서 쓰지 않음)
Plan_csv/AJNA_WBS.xlsx 프로젝트 WBS
nginx_default.conf     배포용 리버스 프록시 설정
```

백엔드는 파이썬을 `ProcessBuilder` 로 직접 띄우고, 파이프라인이 stdout 에 찍는
`PROGRESS:퍼센트:메시지` 줄을 파싱해 작업 진행률로 반영한다. 저장소는 AWS S3 를
쓰고, 키가 없으면 로컬 폴더(`mock-s3-storage/`)로 대신한다. DB 는 기본 H2
인메모리이고 환경변수로 MySQL 로 바꿀 수 있다.

## 환경변수

저장소 루트 `.env` (파이프라인이 `load_dotenv()` 로 읽는다).

```bash
# ── 모델 선택 ────────────────────────────
VLM_PROVIDER=gemini
TTS_PROVIDER=edge
STT_PROVIDER=modal

# ── API (기본 조합) ──────────────────────
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3-flash-preview
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=
```

로컬 모델로 갈아탈 때 쓰는 값(`LOCAL_VLM_BASE_URL` 등)은
[docs/PROVIDERS.md](docs/PROVIDERS.md) 에 정리해 두었다.

백엔드 쪽(DB · S3 · CORS · 엔진 경로)은 `backend/src/main/resources/application.yml`
의 기본값을 환경변수로 덮어쓴다. 프런트엔드는 `frontend/.env.example` 을 복사해 쓴다.

> systemd 로 백엔드를 띄우면 셸 환경변수가 전달되지 않는다. 셸 `export` 가 아니라
> **루트 `.env` 파일**을 기준으로 두는 편이 안전하다.

## API

| | |
|---|---|
| `POST /api/videos/upload` | 영상 업로드 (multipart) → Video 생성 · 파이프라인 비동기 시작 |
| `POST /api/videos/youtube` | 유튜브 주소로 받아오기 (yt-dlp) |
| `GET /api/jobs/{videoId}` | 작업 상태 · 진행률 폴링 (1.5초 주기) |
| `DELETE /api/jobs/{videoId}/cancel` | 진행 중인 작업 취소 |
| `GET /api/results/video/{videoId}` | 결과 — 대본 · 해설 음성 · 합성 영상 경로 |
| `GET /api/storage/stream?url=` | 미디어 스트리밍 |
| `GET /api/archive` | 보관함 목록 |
| `POST /api/auth/google` · `GET /api/auth/me` · `POST /api/auth/logout` | 인증 |

상세 명세는 → [docs/BACKEND.md](docs/BACKEND.md)

## 아직 안 된 것

솔직하게 적어 둔다. 모르고 부딪치는 것보다 낫다.

- **자체 모델** — 파인튜닝(QLoRA), 학습 데이터셋, 평가 지표가 아직 없다. 지금은 API
  로만 돈다.
- **로컬 VLM 실측** — 가짜 서버로 왕복은 확인했지만, 실제 로컬 모델이 CSV 형식을
  얼마나 잘 지키는지는 띄워 봐야 안다. 헤더가 틀리면 지금은 그대로 실패한다.
- **Scene 단위 병렬 호출** — 지금은 영상 전체를 한 요청으로 보낸다. 긴 영상일수록
  대본 생성 시간이 선형으로 늘어난다.
- **생성 이력** — 어느 모델 · 어느 프롬프트로 만든 결과인지 결과물에 남지 않는다.
  모델을 바꿨을 때 좋아졌는지 비교할 근거가 없다.
- **iOS** — `cap add ios` 는 macOS · Xcode 가 필요하다.
- **앱에서 구글 로그인** — 웹용 GIS 스크립트를 쓰므로 네이티브 플러그인이 필요하다.
  체험 모드 앱은 로그인을 지나치므로 지금 당장은 막히지 않는다.
- **앱에서 "음성 저장"** — 안드로이드 WebView 가 `<a download>` 를 무시한다.
  Filesystem + Share 플러그인이 필요하다.

## 문서

| | |
|---|---|
| [docs/PROVIDERS.md](docs/PROVIDERS.md) | 모델 갈아끼우기 — 환경변수 · 로컬 서버 설정 · 확인 방법 |
| [docs/BACKEND.md](docs/BACKEND.md) | 백엔드 API 명세 |
| [docs/HOWTO.md](docs/HOWTO.md) | 프런트–백엔드 연동 구조와 실행 |
| [frontend/README.md](frontend/README.md) | 웹 화면 구조 · 접근성 규칙 · 안드로이드 빌드 |
