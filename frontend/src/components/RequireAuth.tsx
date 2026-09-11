import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthProvider';

/**
 * 로그인한 사용자에게만 열리는 화면.
 *
 * 저장된 토큰을 확인하는 동안에는 로그인 화면으로 보내지 않는다 — 새로고침
 * 한 번에 로그인 화면이 잠깐 스쳐 지나가면 어디에 있는지 알기 어렵다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { token, restoring } = useAuth();
  const location = useLocation();

  if (restoring) {
    return (
      <div role="status" aria-live="polite" className="st-center">
        <p className="st-body">로그인 정보를 확인하고 있습니다.</p>
      </div>
    );
  }

  // 어디로 가려던 참이었는지 남겨 두고, 로그인하면 그리로 되돌린다.
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return <>{children}</>;
}
