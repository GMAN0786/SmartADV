# 장면 톡!

영상에 화면해설(Audio Description)을 만들어 붙이는 접근성 서비스의 웹 프런트엔드.
`design_to_code` 의 앱 시안을 그대로 옮겨 오고, 여기에 백엔드 연동을 붙였다.
같은 코드가 나중에 Capacitor 로 감싸져 하이브리드 앱이 된다.

## 바로 둘러보기 — 체험 모드

서버도 구글 로그인도 없이 화면 흐름 전체를 눈으로 확인할 수 있다.

```bash
npm install
npm run demo              # → http://localhost:5173
```

"체험 시작하기"를 누르면 로그인 없이 들어간다. 업로드 · 생성 4단계 · 완료 · 재생 ·
보관함이 전부 실제처럼 돈다. 생성은 14초 만에 끝나도록 시간표를 줄여 두었다.

이미 `npm run dev` 로 띄워 두었다면 주소 끝에 `?demo` 를 붙여도 켜진다.
`?live` 를 붙이면 실제 서버로 돌아간다. 체험 중에는 어느 화면에나 띠가 하나 붙어
지금 보는 것이 실제 결과가 아님을 알린다.

체험 모드에서 가짜인 것과 진짜인 것

| | |
|---|---|
| 가짜 | 로그인, 서버 응답, 생성 시간 |
| 진짜 | 화면·조작·접근성 전부, 라우팅, 해설 대본 파서, 오디오 재생과 구간 동기화 |

해설 대본은 파이프라인(`LLM.py`)이 내놓는 CSV 형식 그대로 넣어 두었고, 재생 화면의
구간 목록은 그것을 실제로 파싱해서 만든다. 오디오는 브라우저에서 만든 8분 30초
트랙으로, 구간이 시작될 때마다 짧게 울리므로 재생 막대·해설 강조·소리가 함께
맞물리는 것을 확인할 수 있다.

## 실제 서버와 함께 실행

```bash
cp .env.example .env      # 구글 클라이언트 ID 등을 채운다
npm run dev               # 개발 서버 (기본 5173, /api 는 8080 으로 프록시)
npm run build             # 타입 검사 + 프로덕션 번들 → build/
npm run smoke             # 브라우저 없이 화면 7개 렌더 + 라우팅·대본 파서 검사 (29건)
npm run typecheck
```

백엔드는 `../backend` 에서 `./mvnw spring-boot:run` 으로 띄운다.
다른 주소를 쓰려면 `VITE_API_PROXY_TARGET` 을 바꾼다.

## 구조

```
src/
  types.ts                    화면·백엔드 응답 타입
  constants.ts                단계 이름, 오류 문구, 설정 선택지, 저장소 키
  api/
    client.ts                 fetch 한 자리 · 토큰 · ApiError/NetworkError · 미디어 주소
    endpoints.ts              인증 · 업로드 · 작업 · 보관함 호출
  store/
    AnnouncerProvider.tsx     say() 와 화면 밖 aria-live 영역
    AuthProvider.tsx          토큰·프로필, 구글 로그인, 저장된 세션 확인
    SettingsProvider.tsx      테마·글자 배율·해설 설정 (기기에 저장)
    ArchiveProvider.tsx       보관함 목록
    pendingJob.ts             진행 중인 작업 기록 (홈에서 이어보기)
  demo/
    mode.ts                   체험 모드가 켜져 있는지
    backend.ts                가짜 서버 — 실제 백엔드와 같은 모양으로 답한다
    data.ts                   체험용 사용자·보관함·해설 대본(CSV)
    track.ts                  8분 30초짜리 오디오를 브라우저에서 만든다
  hooks/
    useResult.ts              결과 + 미디어 주소 + 해설 구간
  components/
    AppShell.tsx              탐색 + 화면 + 테마/배율이 걸리는 뿌리
    Navigation.tsx            사이드 레일 / 하단 탭바 (NavLink)
    RequireAuth.tsx           로그인해야 열리는 화면
    Modal.tsx ConfirmDialog.tsx ErrorAlert.tsx
    UploadAction.tsx Thumbnail.tsx BackButton.tsx icons.tsx
  screens/                    Login · Home · Url · Processing · Done · Player · Archive · Settings
  utils/
    format.ts                 시간·크기·배속 표기
    cues.ts                   해설 대본 → 구간 목록
    processing.ts             작업 상태 → 4단계
    errors.ts                 던져진 오류 → 안내 문구
  styles/
    tokens.css                테마 색 + --k 배율에 묶인 타입 스케일
    app.css                   앱 스타일 (시안 원본 + 웹 연동분)
    global.css                리셋
smoke/                        브라우저 없이 도는 렌더 검사
```

## 주소 하나에 화면 하나

시안은 `screen` 상태 하나로 화면을 갈랐다. 웹에서는 새로고침·뒤로 가기·링크 공유가
전부 주소를 거치므로 라우터로 올렸다.

| 주소 | 화면 |
|---|---|
| `/login` | 구글 로그인 |
| `/home` | 업로드 · URL · 최근 영상 |
| `/url` | 유튜브 주소 붙여넣기 + 미리보기 |
| `/processing/:videoId` | 생성 진행 (실제 폴링) |
| `/done/:videoId` | 완성 안내 |
| `/player/:videoId` | 재생 + 해설 구간 |
| `/archive` | 보관함 (재생 · 음성 저장) |
| `/settings` | 접근성 설정 · 계정 |

체험 모드는 `?demo` 를 붙여 켜고, 그 뒤로는 탭 세션에 남아 화면을 옮겨도 유지된다.

`/player/:videoId` 처럼 대상이 주소에 실려 있어 어느 화면이든 링크로 바로 들어올 수 있다.

## 설계에서 지킨 것

**반응형은 미디어 질의가 아니라 컨테이너 질의로 판단한다.**
`.st-app` 이 `container-type: inline-size` 를 걸고 `@container app (min-width: 768px)` 에서
하단 탭바가 사이드 레일로 바뀐다. 창이 아니라 앱이 실제로 받은 폭을 보므로,
Capacitor 로 감싼 뒤 화면 안에 다른 배치가 생겨도 규칙이 그대로 산다.

**크기는 배율 하나에 묶여 있다.**
설정의 "글자 크기"가 `--k` 를 1.0~2.0 으로 움직이고, 타입 스케일과 최소 터치 영역이
모두 `calc(… * var(--k))` 로 따라 늘어난다. 200% 에서도 글자만 커져 잘리는 일이 없다.

**상태 변화는 반드시 말로도 전해진다.**
`say()` 가 화면 밖 `aria-live` 영역에 문장을 남긴다. 업로드 시작, 진행률 25·50·75%,
완료, 재생 위치 이동, 설정 변경이 모두 여기로 지나간다.

**상태는 색 말고 다른 단서를 하나 더 갖는다.**
현재 탭은 테두리 + `●` 글머리, 스위치는 켜짐/꺼짐 **글자** 배지, 재생 중인 해설 구간은
면 색 + 테두리 + 굵기 + `▶` 표시, 서버 여유가 부족한 막대는 무늬가 더해진다.

**만들 수 없는 것을 만들 수 있는 척하지 않는다.**
해설이 이미 영상에 합쳐져 있으면 켜고 끄는 스위치 대신 그 사실을 적는다.
해설 대본에 시각이 없으면 구간 목록을 지어내지 않고 없다고 말한다.

## 쓰지 않는 백엔드 자리

아래는 백엔드에 남아 있지만 화면에서 부르지 않는다. 지워도 되고, 나중에 다시
쓸 수도 있어 그대로 두었다.

- `GET /api/jobs/congestion` — 서버 상태 카드를 걷어내면서 부르는 곳이 없어졌다.
  `GET /api/jobs/{videoId}` 응답에도 CPU·메모리·저장 공간 값이 실려 오지만 읽지 않는다.
  대기열 위치만 진행 화면의 "앞에 N개" 한 줄에 쓴다.
- `POST /api/archive/{id}/like` 와 `Result.liked` — 좋아요를 걷어내면서 부르는 곳이 없어졌다.
  `GET /api/archive` 응답의 `liked` 도 화면이 읽지 않는다.

## 백엔드와 맞물리는 곳

| 화면 | 호출 |
|---|---|
| 로그인 | `POST /api/auth/google` · `GET /api/auth/me` · `POST /api/auth/logout` |
| 홈 | `POST /api/videos/upload` (XHR, 진행률) |
| URL | `POST /api/videos/youtube` |
| 진행 | `GET /api/jobs/{videoId}` 1.5초 주기 · `DELETE /api/jobs/{videoId}/cancel` |
| 완료 · 재생 | `GET /api/results/video/{videoId}` · `GET /api/storage/stream?url=` |
| 보관함 | `GET /api/archive` |

### 해설 구간 목록

백엔드 `Result.scriptText` 는 지금 한 줄짜리 안내 문구다. 파이프라인(`LLM.py`)이
만드는 실제 대본은 `silence_id,scene_id,window_start,window_end,text` CSV 이고,
`utils/cues.ts` 의 `parseCues` 가 그 형식(및 `[0:12] 문장`, JSON 배열)을 읽는다.
CSV 가 그대로 저장되기 시작하면 재생 화면의 구간 목록이 바로 살아난다.
그 전까지는 구간이 0개이므로 화면이 "구간 목록이 아직 없습니다"라고 안내한다.

## 체험 모드가 갈리는 지점

백엔드로 나가는 길은 전부 `api/endpoints.ts` 하나를 지난다. 체험 모드는 그 파일에서만
갈린다 — 화면 쪽 코드는 어느 쪽에 붙어 있는지 모른다.

```ts
export function fetchJob(videoId: number, signal?: AbortSignal): Promise<JobStatus> {
  if (DEMO) return demo.job(videoId);
  return api<JobStatus>(`/api/jobs/${videoId}`, { signal });
}
```

덕분에 체험 모드로 확인한 화면 동작이 실제 서버에서도 그대로 성립한다.
분기가 화면마다 흩어져 있으면 "체험에서는 되는데 실제로는 안 되는" 곳이 생긴다.

## 하이브리드 앱 — 안드로이드

웹 번들 하나를 그대로 Capacitor 로 감싼다. 화면 코드는 한 벌뿐이고, 웹이냐
앱이냐는 **라우터 종류**와 **API 주소** 두 가지로만 갈린다.

```bash
npm run build:app:demo     # 체험 모드 앱 번들 (.env.app-demo)
npm run build:app          # 실서버 앱 번들   (.env.app — VITE_API_BASE_URL 필요)

npm run sync:android       # 위 빌드 + android/ 로 복사
npm run sync:android:demo
npm run open:android       # 안드로이드 스튜디오로 열기
```

APK 를 명령줄에서 바로 굽는다면:

```bash
cd android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### 웹과 다르게 두는 것

| 항목 | 웹 | 앱 |
| --- | --- | --- |
| 라우터 | `BrowserRouter` | `HashRouter` (`VITE_ROUTER=hash`) |
| API | Vite 프록시 `/api` | `VITE_API_BASE_URL` 절대 주소 |
| 뒤로 가기 | 브라우저 | 기기 버튼 → `history.back()`, 첫 화면이면 종료 |
| 상태 표시줄 | `color-scheme` | Capacitor StatusBar 가 테마를 따라간다 |

앱에서만 도는 코드는 `src/native/bridge.ts` 한 파일에 모여 있다. Capacitor 패키지를
파일 맨 위가 아니라 함수 안에서 늦게 들여오므로, 웹 번들에도 스모크 테스트에도
네이티브 코드가 딸려 들어가지 않는다.

### 만들어 둔 것

- `capacitor.config.ts` — `appId: com.scenetalk.app`, `webDir: build`, 검은 스플래시
- `android/` — minSdk 24, compileSdk 36, `VIBRATE` 권한(진동 피드백용) 추가
- `.env.app` / `.env.app-demo` — 앱 빌드용 설정 두 벌

### 아직 남은 것

- **구글 로그인** — 웹용 GIS 스크립트를 쓰므로 앱에서는 네이티브 로그인 플러그인이
  필요하다. 체험 모드 앱에서는 로그인을 지나치므로 지금 당장은 막히지 않는다.
- **"음성 저장"** — `<a download>` 는 안드로이드 WebView 가 그냥 무시한다. 앱에서
  파일을 남기려면 Filesystem + Share 플러그인을 태워야 한다.
- **평문 http 백엔드** — 안드로이드가 막는다. 실서버는 https 여야 하고, 사내 http
  서버를 붙여 볼 때만 `allowMixedContent` 와 network security config 를 함께 연다.
- **iOS** — macOS 와 Xcode 가 있어야 `npx cap add ios` 가 된다. 이 컴퓨터에서는 안 된다.
