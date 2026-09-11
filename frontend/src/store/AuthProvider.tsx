import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, clearToken, getToken, setToken } from '../api/client';
import { fetchMe, loginAsDemoUser, loginWithGoogle, logout as logoutRequest } from '../api/endpoints';
import { STORAGE_KEYS } from '../constants';
import type { UserProfile } from '../types';

interface AuthValue {
  user: UserProfile | null;
  token: string | null;
  /** 저장된 토큰을 서버에 확인하는 동안 true. 이때는 로그인 화면으로 보내지 않는다. */
  restoring: boolean;
  signInWithGoogle: (credential: string) => Promise<void>;
  /** 체험 모드에서 구글을 거치지 않고 들어가는 길. */
  signInAsDemoUser: () => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readStoredUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<UserProfile | null>(() => readStoredUser());
  const [restoring, setRestoring] = useState<boolean>(() => getToken() !== null);

  const signOut = useCallback(() => {
    // 서버 쪽 세션 정리는 실패해도 흐름을 막지 않는다. 기기에서는 이미 지워졌다.
    if (getToken()) void logoutRequest().catch(() => undefined);
    clearToken();
    setTokenState(null);
    setUser(null);
  }, []);

  // 저장된 토큰이 아직 살아 있는지 서버에 한 번 물어본다.
  useEffect(() => {
    if (!restoring) return;
    let cancelled = false;

    void (async () => {
      try {
        const profile = await fetchMe();
        if (cancelled) return;
        setUser(profile);
        try {
          localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
        } catch {
          /* 저장이 막혀 있어도 이번 세션은 그대로 쓴다. */
        }
      } catch (error) {
        // 네트워크 문제라면 토큰을 버리지 않는다 — 잠시 후 다시 살아날 수 있다.
        if (!cancelled && error instanceof ApiError) signOut();
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [restoring, signOut]);

  /** 로그인 결과를 기기와 상태에 함께 적는다. 구글이든 체험이든 같은 자리를 지난다. */
  const accept = useCallback((issued: string, profile: UserProfile) => {
    setToken(issued);
    try {
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(profile));
    } catch {
      /* 위와 같다. */
    }
    setTokenState(issued);
    setUser(profile);
    setRestoring(false);
  }, []);

  const signInWithGoogle = useCallback(
    async (credential: string) => {
      const { token: issued, user: profile } = await loginWithGoogle(credential);
      accept(issued, profile);
    },
    [accept],
  );

  const signInAsDemoUser = useCallback(async () => {
    const { token: issued, user: profile } = await loginAsDemoUser();
    accept(issued, profile);
  }, [accept]);

  const value = useMemo<AuthValue>(
    () => ({ user, token, restoring, signInWithGoogle, signInAsDemoUser, signOut }),
    [user, token, restoring, signInWithGoogle, signInAsDemoUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 는 <AuthProvider> 안에서만 쓸 수 있습니다.');
  return value;
}
