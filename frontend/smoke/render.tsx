/**
 * 화면 렌더 스모크 테스트.
 *
 * 브라우저 없이 화면 8개를 한 번씩 그려 보고, 던져지는 오류가 없는지와 각
 * 화면이 자기 이름을 제대로 내놓는지 확인한다. 이어서 라우팅 규칙(로그인
 * 없이 들어오면 로그인 화면)과 대본 파서를 검사한다. `npm run smoke` 로 돈다.
 */
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '../src/App';
import { AppShell } from '../src/components/AppShell';
import { ArchiveScreen } from '../src/screens/ArchiveScreen';
import { DoneScreen } from '../src/screens/DoneScreen';
import { HomeScreen } from '../src/screens/HomeScreen';
import { LoginScreen } from '../src/screens/LoginScreen';
import { PlayerScreen } from '../src/screens/PlayerScreen';
import { ProcessingScreen } from '../src/screens/ProcessingScreen';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { UrlScreen } from '../src/screens/UrlScreen';
import { AnnouncerProvider } from '../src/store/AnnouncerProvider';
import { ArchiveProvider } from '../src/store/ArchiveProvider';
import { AuthProvider } from '../src/store/AuthProvider';
import { SettingsProvider } from '../src/store/SettingsProvider';
import { STORAGE_KEYS } from '../src/constants';
import { DEMO_CUE_TIMES, DEMO_SCRIPT_CSV } from '../src/demo/data';
import { parseCues } from '../src/utils/cues';

/* ── 브라우저 흉내 ───────────────────────────────────────────────────── */

const store = new Map<string, string>();

const localStorageStub = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
} as Storage;

const windowStub = {
  localStorage: localStorageStub,
  matchMedia: () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
  location: { origin: 'http://localhost', search: '', reload: () => undefined },
  setInterval: () => 0,
  clearInterval: () => undefined,
  setTimeout: () => 0,
  clearTimeout: () => undefined,
};

/** 노드가 이미 정의해 둔 전역(navigator 등)은 defineProperty 로 덮어써야 한다. */
function defineGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

defineGlobal('window', windowStub);
defineGlobal('localStorage', localStorageStub);
defineGlobal('navigator', { clipboard: {}, vibrate: () => true });
defineGlobal('document', { documentElement: { style: {} }, title: '' });
defineGlobal('fetch', () => Promise.reject(new Error('스모크 테스트에서는 네트워크를 쓰지 않습니다.')));

/* ── 검사 도구 ───────────────────────────────────────────────────────── */

let failures = 0;

function check(name: string, passed: boolean, detail?: string) {
  console.log(`${passed ? '✓' : '✗'} ${name}`);
  if (!passed) {
    if (detail) console.error(`   ${detail}`);
    failures += 1;
  }
}

function providers(children: ReactNode) {
  return (
    <AnnouncerProvider>
      <SettingsProvider>
        <AuthProvider>
          <ArchiveProvider>{children}</ArchiveProvider>
        </AuthProvider>
      </SettingsProvider>
    </AnnouncerProvider>
  );
}

function render(path: string, routePath: string, element: ReactNode): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      {providers(
        <Routes>
          <Route element={<AppShell />}>
            <Route path={routePath} element={element} />
          </Route>
        </Routes>,
      )}
    </MemoryRouter>,
  );
}

/* ── 1. 화면마다 한 번씩 그려 본다 ──────────────────────────────────── */

// 셸이 탐색을 내보내려면 로그인 상태여야 한다.
store.set(STORAGE_KEYS.token, 'smoke-token');
store.set(
  STORAGE_KEYS.user,
  JSON.stringify({ id: 1, email: 'a@b.c', name: '스모크', picture: '', role: 'USER' }),
);

const SCREENS: { name: string; path: string; routePath: string; element: ReactNode; expect: string[] }[] = [
  { name: '홈', path: '/home', routePath: '/home', element: <HomeScreen />, expect: ['홈 화면', '영상 파일 업로드', 'URL로 가져오기'] },
  { name: 'URL 가져오기', path: '/url', routePath: '/url', element: <UrlScreen />, expect: ['영상 URL 가져오기 화면', '붙여넣기'] },
  { name: '생성 진행', path: '/processing/12', routePath: '/processing/:videoId', element: <ProcessingScreen />, expect: ['화면해설 생성 중 화면', '작업 취소', '영상 준비'] },
  { name: '완료', path: '/done/12', routePath: '/done/:videoId', element: <DoneScreen />, expect: ['화면해설 완성 화면', '재생하기'] },
  { name: '재생', path: '/player/12', routePath: '/player/:videoId', element: <PlayerScreen />, expect: ['재생 화면', '전체 해설', '10초 이전'] },
  { name: '보관함', path: '/archive', routePath: '/archive', element: <ArchiveScreen />, expect: ['보관함 화면'] },
  { name: '설정', path: '/settings', routePath: '/settings', element: <SettingsScreen />, expect: ['접근성 설정 화면', '고대비 모드', '글자 크기'] },
];

for (const screen of SCREENS) {
  try {
    const html = render(screen.path, screen.routePath, screen.element);
    const missing = screen.expect.filter((needle) => !html.includes(needle));
    check(`화면 · ${screen.name}`, missing.length === 0, `찾지 못한 것: ${missing.join(', ')}`);
  } catch (error) {
    check(`화면 · ${screen.name}`, false, (error as Error).message);
  }
}

/* ── 2. 탐색이 화면에 따라 갈리는지 ─────────────────────────────────── */

const homeHtml = render('/home', '/home', <HomeScreen />);
check('탐색 · 홈에는 탭바가 있다', homeHtml.includes('st-tabs'));

const playerHtml = render('/player/12', '/player/:videoId', <PlayerScreen />);
check('탐색 · 재생 화면에는 탭바가 없다', !playerHtml.includes('st-tabs'));
check('탐색 · 사이드 레일은 항상 있다', playerHtml.includes('st-rail'));
check('브랜드 · 레일에 장면 톡! 이 있다', playerHtml.includes('장면 톡!'));

// 이미 로그인했다면 로그인 화면에 머무르지 않는다.
const loggedInLogin = render('/login', '/login', <LoginScreen />);
check('탐색 · 로그인한 사용자는 /login 에 머물지 않는다', !loggedInLogin.includes('로그인 화면'));

/* ── 3. 걷어낸 기능이 다시 새어 들어오지 않는지 ─────────────────────── */

const archiveHtml = render('/archive', '/archive', <ArchiveScreen />);
check('걷어냄 · 보관함에 좋아요가 없다', !archiveHtml.includes('좋아요'));
check(
  '걷어냄 · 어느 화면에도 서버 상태가 없다',
  ![homeHtml, playerHtml, archiveHtml].some(
    (html) => html.includes('서버 상태') || html.includes('st-metrics') || html.includes('CPU'),
  ),
);

/* ── 4. 로그인하지 않으면 보호된 화면에 못 들어간다 ─────────────────── */

store.clear();

/*
 * renderToString 은 한 번만 그리므로 <Navigate> 가 실제로 옮겨 간 결과까지는
 * 보이지 않는다. 대신 "보호된 화면의 내용이 나오지 않는다"를 확인한다 —
 * 로그인 없이 내용이 새는 것이야말로 막아야 할 일이다.
 */
const PROTECTED: { path: string; leak: string }[] = [
  { path: '/home', leak: '홈 화면' },
  { path: '/archive', leak: '보관함 화면' },
  { path: '/settings', leak: '접근성 설정 화면' },
  { path: '/player/12', leak: '재생 화면' },
];

for (const { path, leak } of PROTECTED) {
  const html = renderToString(
    <MemoryRouter initialEntries={[path]}>{providers(<App />)}</MemoryRouter>,
  );
  check(`보호 · 로그인 없이 ${path} 내용이 새지 않는다`, !html.includes(leak));
}

// 로그인 화면 자체는 토큰 없이도 열려야 한다.
const loginHtml = renderToString(
  <MemoryRouter initialEntries={['/login']}>{providers(<App />)}</MemoryRouter>,
);
check('보호 · /login 은 토큰 없이 열린다', loginHtml.includes('로그인 화면'));
check('보호 · 로그인 전에는 탐색이 보이지 않는다', !loginHtml.includes('st-rail'));
check('브랜드 · 로그인 화면이 장면 톡! 을 내건다', loginHtml.includes('장면 톡!'));

/* ── 5. 대본 파서 ───────────────────────────────────────────────────── */

const CUE_CASES: { name: string; input: string; count: number; firstAt: number }[] = [
  {
    name: '파이프라인 CSV',
    input: [
      'silence_id,scene_id,window_start,window_end,text',
      '1,1,00:00:12:500,00:00:15:000,"골목 입구, 간판이 흔들린다"',
      '2,2,00:01:04:000,00:01:07:000,계단을 오른다',
    ].join('\n'),
    count: 2,
    firstAt: 12.5,
  },
  { name: '시각이 붙은 줄', input: '[0:12] 골목 입구\n[1:04] 계단을 오른다', count: 2, firstAt: 12 },
  { name: 'JSON 배열', input: '[{"at": 12, "text": "골목 입구"}]', count: 1, firstAt: 12 },
];

for (const testCase of CUE_CASES) {
  const cues = parseCues(testCase.input);
  const ok = cues.length === testCase.count && Math.abs((cues[0]?.at ?? -1) - testCase.firstAt) < 0.01;
  check(
    `대본 파서 · ${testCase.name}`,
    ok,
    `기대 ${testCase.count}개/${testCase.firstAt}초, 받은 ${cues.length}개/${cues[0]?.at}초`,
  );
}

// 시각이 없는 안내 문구는 구간이 아니다 — 재생 화면이 "구간 없음"으로 안내해야 한다.
check(
  '대본 파서 · 시각 없는 문구는 구간 0개',
  parseCues('자동 추출된 화면 해설 스크립트 기반 생성 결과물입니다.').length === 0,
);
check('대본 파서 · 빈 대본은 구간 0개', parseCues(null).length === 0);

/* ── 6. 체험용 대본이 실제로 구간 목록이 되는지 ─────────────────────── */

const demoCues = parseCues(DEMO_SCRIPT_CSV);
check(`체험 대본 · 구간 ${DEMO_CUE_TIMES.length}개로 풀린다`, demoCues.length === DEMO_CUE_TIMES.length);
check(
  '체험 대본 · 시작 시각이 그대로 살아난다',
  demoCues.every((cue, i) => Math.abs(cue.at - DEMO_CUE_TIMES[i]) < 0.01),
);
check(
  '체험 대본 · 쉼표가 든 문장이 잘리지 않는다',
  demoCues[0]?.text === '골목 입구, 낡은 철제 간판이 바람에 흔들린다.',
  `받은 문장: ${demoCues[0]?.text}`,
);

console.log(failures === 0 ? '\n전부 통과했습니다.' : `\n${failures}건 실패했습니다.`);
process.exit(failures === 0 ? 0 : 1);
