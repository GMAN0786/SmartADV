import { NavLink, useLocation } from 'react-router-dom';
import { useAnnouncer } from '../store/AnnouncerProvider';

interface NavItem {
  to: string;
  label: string;
  /** 아이콘 대신 쓰는 글자 기호. 저시력 사용자에게 확대해도 뭉개지지 않는다. */
  glyph: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: '홈', glyph: '⌂' },
  { to: '/archive', label: '보관함', glyph: '▤' },
  { to: '/settings', label: '설정', glyph: '≡' },
];

/** 탐색이 걸리는 경로. 재생·생성처럼 흐름 안에 있는 화면에서는 탭을 감춘다. */
export const NAV_PATHS = NAV_ITEMS.map((item) => item.to);

function ariaLabel(item: NavItem, index: number, current: boolean): string {
  return `${item.label}, 탭${current ? ', 선택됨' : ''}, ${NAV_ITEMS.length}개 중 ${index + 1}번째`;
}

/**
 * 탐색 항목 하나.
 *
 * 현재 위치를 직접 계산해서 이름에 "선택됨"을 넣는다. NavLink 가 붙여 주는
 * `aria-current="page"` 만으로는 읽어 주지 않는 리더가 있어 둘 다 남긴다.
 */
function NavItems({ className, labelClassName }: { className: string; labelClassName: string }) {
  const { say } = useAnnouncer();
  const { pathname } = useLocation();

  return (
    <>
      {NAV_ITEMS.map((item, index) => {
        const current = pathname === item.to;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => {
              if (!current) say(`${item.label} 화면으로 이동했습니다.`);
            }}
            aria-label={ariaLabel(item, index, current)}
            className={className}
          >
            <span aria-hidden="true" className="st-nav-glyph">
              {item.glyph}
            </span>
            <span className={labelClassName}>{current ? `● ${item.label}` : item.label}</span>
          </NavLink>
        );
      })}
    </>
  );
}

/**
 * 768px 이상에서 나타나는 사이드 레일.
 *
 * 레일과 탭바는 CSS 컨테이너 질의로 갈린다. 감춰진 쪽은 display:none 이라
 * 접근성 트리에서도 빠지므로 같은 이름의 nav 가 둘 읽히는 일은 없다.
 */
export function NavRail() {
  return (
    <nav aria-label="주요 화면" className="st-rail">
      <div className="st-rail__brand">장면 톡!</div>
      <NavItems className="st-rail__item" labelClassName="st-rail__label" />
    </nav>
  );
}

/** 768px 미만에서 화면 아래에 붙는 탭바. */
export function TabBar() {
  return (
    <nav aria-label="주요 화면" className="st-tabs">
      <NavItems className="st-tab" labelClassName="st-tab__label" />
    </nav>
  );
}
