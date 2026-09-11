import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { startNativeBridge } from './native/bridge';
import { AnnouncerProvider } from './store/AnnouncerProvider';
import { ArchiveProvider } from './store/ArchiveProvider';
import { AuthProvider } from './store/AuthProvider';
import { SettingsProvider } from './store/SettingsProvider';
import './styles/global.css';

/**
 * 웹에서는 진짜 경로를, 하이브리드 앱에서는 해시 경로를 쓴다.
 *
 * Capacitor 는 번들을 `file://` 또는 로컬 서버에서 열기 때문에 서버 쪽
 * 새로고침 대응이 없다. 해시 라우터면 어느 화면에서 앱을 다시 열어도
 * 그 화면이 그대로 살아난다. 빌드 때 VITE_ROUTER=hash 로 갈린다.
 */
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

// 하이브리드 앱일 때만 스플래시·뒤로 가기를 잇는다. 웹에서는 아무 일도 없다.
startNativeBridge();

const container = document.getElementById('root');
if (!container) throw new Error('#root 를 찾을 수 없습니다.');

createRoot(container).render(
  <StrictMode>
    <Router>
      <AnnouncerProvider>
        <SettingsProvider>
          <AuthProvider>
            <ArchiveProvider>
              <App />
            </ArchiveProvider>
          </AuthProvider>
        </SettingsProvider>
      </AnnouncerProvider>
    </Router>
  </StrictMode>,
);
