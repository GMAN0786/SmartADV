import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ErrorAlert } from '../components/ErrorAlert';
import { DEMO } from '../demo/mode';
import { useAnnouncer } from '../store/AnnouncerProvider';
import { useAuth } from '../store/AuthProvider';

/** 구글 Identity Services 가 window 에 붙여 주는 것 중 우리가 쓰는 부분만. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
      renderButton: (
        parent: HTMLElement,
        options: { theme: string; size: string; width: number; locale: string; text: string },
      ) => void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

/** 구글 스크립트가 늦게 붙을 수 있어 잠깐 기다린다(ms). */
const SCRIPT_WAIT_MS = 8000;
const SCRIPT_POLL_MS = 120;

/**
 * 로그인.
 *
 * 실제 서비스에서는 구글이 그려 주는 버튼을 그대로 쓴다 — 우리가 흉내 낸
 * 버튼은 구글의 접근성 처리와 지역화를 잃는다. 체험 모드에서는 구글을 아예
 * 거치지 않고 버튼 하나로 들어간다.
 */
export function LoginScreen() {
  const { token, signInWithGoogle, signInAsDemoUser } = useAuth();
  const { say } = useAnnouncer();
  const location = useLocation();
  const buttonRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable' | 'failed'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/home';

  const handleCredential = useCallback(
    async (credential: string) => {
      setMessage(null);
      try {
        await signInWithGoogle(credential);
        say('로그인했습니다. 홈 화면으로 이동합니다.');
      } catch (error) {
        setStatus('failed');
        setMessage(error instanceof Error ? error.message : null);
        say('로그인하지 못했습니다. 다시 시도해주세요.', true);
      }
    },
    [signInWithGoogle, say],
  );

  useEffect(() => {
    if (token || DEMO) return;

    if (!CLIENT_ID) {
      setStatus('unavailable');
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    const timer = window.setInterval(() => {
      if (cancelled) return;

      if (!window.google) {
        if (Date.now() - startedAt > SCRIPT_WAIT_MS) {
          window.clearInterval(timer);
          setStatus('unavailable');
        }
        return;
      }

      window.clearInterval(timer);
      if (!buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => void handleCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 300,
        locale: 'ko',
        text: 'signin_with',
      });
      setStatus('ready');
    }, SCRIPT_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, handleCredential]);

  if (token) return <Navigate to={from} replace />;

  return (
    <div role="main" aria-label="로그인 화면" className="st-login">
      <h1 className="st-login__brand">장면 톡!</h1>
      <p className="st-login__tagline">
        영상에 화면해설을 자동으로 만들어 붙입니다. 만든 해설은 보관함에 쌓여 언제든 다시 볼 수 있습니다.
      </p>

      {DEMO ? (
        <>
          <button
            type="button"
            onClick={() => {
              void signInAsDemoUser().then(() => say('체험 모드로 들어갑니다. 홈 화면.'));
            }}
            aria-label="체험 시작하기, 로그인 없이 화면 흐름을 둘러봅니다"
            className="st-btn st-btn--primary st-btn--block st-btn--hero"
            style={{ maxWidth: 340 }}
          >
            체험 시작하기
          </button>
          <p className="st-login__note">
            체험 모드입니다. 로그인도 서버도 없이 업로드 · 생성 · 재생 · 보관함 흐름을 그대로 따라가
            볼 수 있습니다. 보이는 영상과 해설은 실제 결과가 아닙니다.
          </p>
        </>
      ) : (
        <>
          {status === 'failed' && (
            <ErrorAlert error="auth" detail={message} onRetry={() => setStatus('ready')} retryLabel="다시 시도" />
          )}

          {status === 'unavailable' && (
            <ErrorAlert
              error="network"
              detail={
                CLIENT_ID
                  ? '구글 로그인을 불러오지 못했습니다. 네트워크 연결을 확인한 후 새로고침해주세요.'
                  : '구글 로그인이 설정되어 있지 않습니다. 주소 끝에 ?demo 를 붙이면 로그인 없이 둘러볼 수 있습니다.'
              }
              onRetry={() => window.location.reload()}
              retryLabel="새로고침"
            />
          )}

          {/* 구글이 이 안에 자기 버튼을 그린다. 준비되기 전에는 자리만 지킨다. */}
          <div className="st-login__google" ref={buttonRef} />

          {status === 'loading' && (
            <p role="status" aria-live="polite" className="st-body">
              구글 로그인을 준비하고 있습니다.
            </p>
          )}

          <p className="st-login__note">
            로그인하면 만든 화면해설이 계정에 저장됩니다. 계정 정보는 영상 처리와 보관함 표시에만 씁니다.
          </p>

          <a href="?demo" className="st-btn st-btn--ghost" style={{ textDecoration: 'none' }}>
            로그인 없이 둘러보기
          </a>
        </>
      )}
    </div>
  );
}
