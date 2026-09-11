import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 하이브리드 앱 설정.
 *
 * 웹에서 만든 번들(build/)을 그대로 안드로이드 WebView 에 싣는다. 화면 코드는
 * 하나뿐이고, 웹이냐 앱이냐는 라우터 종류(VITE_ROUTER)와 API 주소
 * (VITE_API_BASE_URL)로만 갈린다.
 */

/**
 * 개발 서버를 바라보게 할 주소. `npm run live:android` 이 넣어 준다.
 * 비어 있으면 앱 안에 넣어 둔 build/ 를 쓴다 — 배포 빌드는 언제나 이쪽이다.
 */
const liveUrl = process.env.CAP_LIVE_URL;

const config: CapacitorConfig = {
  appId: 'com.scenetalk.app',
  appName: '장면 톡!',
  webDir: 'build',

  // 웹에서 `npm run demo` 를 띄워 놓고 보는 것과 같은 방식. 코드를 고치면
  // 폰/에뮬레이터 화면이 바로 다시 그려진다. 개발 서버는 평문 http 라
  // cleartext 를 함께 열어 주어야 안드로이드가 막지 않는다.
  ...(liveUrl ? { server: { url: liveUrl, cleartext: true } } : {}),

  android: {
    // 앱 안에서 평문 http 서버를 부르지 않는다. 개발 중 사내 http 백엔드를
    // 붙일 때만 잠깐 true 로 바꾼다(android/.../network_security_config 도 함께).
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      // 첫 화면이 그려질 때까지만 잠깐. 하얗게 번쩍이지 않도록 앱 배경색과 맞춘다.
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#000000',
      showSpinner: false,
    },
  },
};

export default config;
