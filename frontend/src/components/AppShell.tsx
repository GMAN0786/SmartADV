import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { DEMO } from '../demo/mode';
import { syncNativeStatusBar } from '../native/bridge';
import { useAuth } from '../store/AuthProvider';
import { useSettings } from '../store/SettingsProvider';
import { NAV_PATHS, NavRail, TabBar } from './Navigation';
import '../styles/tokens.css';
import '../styles/app.css';

/** 경로 → 문서 제목. 브라우저 탭과 방문 기록에서 화면이 구분된다. */
const TITLES: { match: RegExp; title: string }[] = [
  { match: /^\/home/, title: '홈' },
  { match: /^\/url/, title: 'URL로 가져오기' },
  { match: /^\/processing/, title: '화면해설 생성 중' },
  { match: /^\/done/, title: '화면해설 완성' },
  { match: /^\/player/, title: '재생' },
  { match: /^\/archive/, title: '보관함' },
  { match: /^\/settings/, title: '접근성 설정' },
  { match: /^\/login/, title: '로그인' },
];

/**
 * 앱 셸.
 *
 * 탐색(레일/탭바) · 현재 화면 · 테마와 글자 배율을 한자리에 모은다.
 * 배율은 뿌리에 CSS 변수로 걸려 글자와 최소 터치 영역에 함께 곱해진다.
 */
export function AppShell() {
  const { resolvedTheme, scale, reduceMotion } = useSettings();
  const { token } = useAuth();
  const { pathname } = useLocation();

  // 로그인 전에는 갈 수 있는 화면이 없으므로 탐색 자체를 내보내지 않는다.
  const showNav = Boolean(token) && pathname !== '/login';
  const showTabs = showNav && NAV_PATHS.includes(pathname);

  useEffect(() => {
    const found = TITLES.find((entry) => entry.match.test(pathname));
    document.title = found ? `${found.title} · 장면 톡!` : '장면 톡! — 영상에 화면해설 만들기';
  }, [pathname]);

  // 브라우저 UI(주소창·스크롤바)와 앱의 상태 표시줄도 앱 테마를 따라가게 한다.
  useEffect(() => {
    document.documentElement.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark';
    syncNativeStatusBar(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <div
      lang="ko"
      data-theme={resolvedTheme}
      data-reduce-motion={reduceMotion}
      className="st-app"
      style={{ '--k': scale } as CSSProperties}
    >
      <a href="#st-main" className="st-skip">
        본문으로 건너뛰기
      </a>

      {showNav && <NavRail />}

      <div className="st-content" id="st-main">
        {/* 화면에 보이는 것이 실제 결과가 아님을 어느 화면에서든 알 수 있게 한다. */}
        {DEMO && (
          <p className="st-demo-bar">
            <span aria-hidden="true">◆</span> 체험 모드 · 서버에 연결되어 있지 않습니다. 보이는 영상과 해설은
            실제 결과가 아닙니다.
          </p>
        )}

        <Outlet />
        {showTabs && <TabBar />}
      </div>
    </div>
  );
}
