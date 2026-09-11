import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { RequireAuth } from './components/RequireAuth';
import { ArchiveScreen } from './screens/ArchiveScreen';
import { DoneScreen } from './screens/DoneScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LoginScreen } from './screens/LoginScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { UrlScreen } from './screens/UrlScreen';

/**
 * 화면 하나가 주소 하나.
 *
 * 시안은 `screen` 상태 하나로 화면을 갈랐지만, 웹에서는 새로고침·뒤로 가기·
 * 링크 공유가 모두 주소를 통해 이뤄진다. 작업 진행과 재생처럼 대상이 있는
 * 화면은 videoId 를 주소에 실어 어디서든 그 화면으로 바로 들어올 수 있다.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/login" element={<LoginScreen />} />

        <Route
          path="/home"
          element={
            <RequireAuth>
              <HomeScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/url"
          element={
            <RequireAuth>
              <UrlScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/processing/:videoId"
          element={
            <RequireAuth>
              <ProcessingScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/done/:videoId"
          element={
            <RequireAuth>
              <DoneScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/player/:videoId"
          element={
            <RequireAuth>
              <PlayerScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/archive"
          element={
            <RequireAuth>
              <ArchiveScreen />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <SettingsScreen />
            </RequireAuth>
          }
        />

        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
