/**
 * 체험 모드.
 *
 * 서버도 구글 로그인도 없이 화면 흐름 전체를 눈으로 확인하기 위한 장치다.
 * 켜져 있으면 `api/endpoints.ts` 가 실제 호출 대신 `demo/backend.ts` 를 부른다.
 *
 * 켜는 법
 * - `npm run demo` — VITE_DEMO=1 로 개발 서버를 띄운다
 * - 주소에 `?demo` 를 붙인다 — 그 탭에서만 켜지고 새로고침해도 유지된다
 * - 주소에 `?live` 를 붙이면 다시 실제 서버로 돌아간다
 */

const FLAG_KEY = 'scenetalk_demo';

function detect(): boolean {
  if (import.meta.env.VITE_DEMO === '1') return true;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('demo')) {
      sessionStorage.setItem(FLAG_KEY, '1');
      return true;
    }
    if (params.has('live')) {
      sessionStorage.removeItem(FLAG_KEY);
      return false;
    }
    return sessionStorage.getItem(FLAG_KEY) === '1';
  } catch {
    // 저장을 막아 둔 브라우저에서는 주소만 보고 판단한다.
    return typeof window !== 'undefined' && window.location.search.includes('demo');
  }
}

/** 앱이 뜰 때 한 번만 정해진다. 도중에 바뀌지 않는다. */
export const DEMO = detect();
