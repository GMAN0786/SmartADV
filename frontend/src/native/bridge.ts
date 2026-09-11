/**
 * 하이브리드 앱에서만 도는 얇은 다리.
 *
 * 웹에서는 아무것도 하지 않는다. Capacitor 패키지를 파일 맨 위에서 들여오지
 * 않고 함수 안에서 늦게 부르는 이유는 두 가지다 — 웹 번들에 네이티브 코드가
 * 딸려 들어가지 않게 하려는 것이고, 브라우저 없이 도는 스모크 테스트가
 * 이 파일을 지나가도 아무 일도 일어나지 않게 하려는 것이다.
 */

type Theme = 'dark' | 'light' | 'hc';

/** 안드로이드 앱 안인가. 네이티브 껍데기가 번들보다 먼저 넣어 두는 전역으로 판단한다. */
export function isNativeApp(): boolean {
  try {
    const bridge = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return bridge?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** 앱이 처음 뜰 때 한 번. 스플래시를 걷고, 기기 뒤로 가기를 화면 뒤로 가기로 잇는다. */
export function startNativeBridge(): void {
  if (!isNativeApp()) return;

  void (async () => {
    try {
      const [{ SplashScreen }, { App }] = await Promise.all([
        import('@capacitor/splash-screen'),
        import('@capacitor/app'),
      ]);

      await SplashScreen.hide();

      await App.addListener('backButton', ({ canGoBack }) => {
        // 첫 화면에서 다시 뒤로 가면 앱을 닫는다. 그 밖에는 한 화면씩 되돌아간다.
        if (canGoBack && window.history.length > 1) window.history.back();
        else void App.exitApp();
      });
    } catch {
      /* 다리가 없어도 화면은 그대로 돈다. */
    }
  })();
}

/** 상태 표시줄 글자색을 앱 테마에 맞춘다. 밝은 테마에서 흰 글자가 되지 않도록. */
export function syncNativeStatusBar(theme: Theme): void {
  if (!isNativeApp()) return;

  void (async () => {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark });
      await StatusBar.setBackgroundColor({ color: theme === 'light' ? '#ffffff' : '#000000' });
    } catch {
      /* 지원하지 않는 기기에서는 조용히 넘어간다. */
    }
  })();
}
