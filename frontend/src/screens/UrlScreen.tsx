import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { submitYoutubeUrl } from '../api/endpoints';
import { BackButton } from '../components/BackButton';
import { ErrorAlert } from '../components/ErrorAlert';
import { ErrorCircleIcon } from '../components/icons';
import { Thumbnail } from '../components/Thumbnail';
import { useAnnouncer } from '../store/AnnouncerProvider';
import { useHaptic } from '../store/SettingsProvider';
import { writePendingJob } from '../store/pendingJob';
import type { ErrorKey, UrlState } from '../types';
import { nextAvailableText, toErrorDetail, toErrorKey } from '../utils/errors';

interface Preview {
  title: string;
  thumbnail: string | null;
}

/** 백엔드가 받는 형태와 같은 규칙. 여기서 먼저 걸러 헛걸음을 줄인다. */
function isYoutubeUrl(value: string): boolean {
  return value.includes('youtube.com/watch') || value.includes('youtu.be/');
}

/**
 * 영상 URL 가져오기.
 *
 * 붙여넣기 버튼을 따로 둔 것은 길게 눌러 메뉴를 여는 조작이 스위치·스크린
 * 리더 사용자에게 어렵기 때문이다. 미리보기를 먼저 보여 주어 엉뚱한 영상으로
 * 몇 분짜리 작업을 시작하는 일을 막는다.
 */
export function UrlScreen() {
  const navigate = useNavigate();
  const { say } = useAnnouncer();
  const vibrate = useHaptic();

  const [url, setUrl] = useState('');
  const [state, setState] = useState<UrlState>('idle');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ key: ErrorKey; detail: string | null } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // 주소를 다 적고 잠깐 멈추면 그때 미리보기를 읽는다. 글자마다 부르지 않는다.
  useEffect(() => {
    const trimmed = url.trim();

    if (!trimmed) {
      setState('idle');
      setPreview(null);
      return;
    }

    if (!isYoutubeUrl(trimmed)) {
      setState('invalid');
      setPreview(null);
      return;
    }

    setState('checking');
    const controller = new AbortController();

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(trimmed)}&format=json`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error('oembed');

          const data = (await response.json()) as { title?: string; thumbnail_url?: string };
          setPreview({ title: data.title ?? trimmed, thumbnail: data.thumbnail_url ?? null });
          setState('ok');
          say(`${data.title ?? '영상'} 을(를) 찾았습니다. 화면해설 만들기, 버튼.`);
        } catch (cause) {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          // 미리보기를 못 읽어도 주소 자체는 유효할 수 있다. 진행은 막지 않는다.
          setPreview(null);
          setState('ok');
        }
      })();
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [url, say]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        say('클립보드가 비어 있습니다.');
        return;
      }
      setUrl(text.trim());
      inputRef.current?.focus();
      say('주소를 붙여넣었습니다.');
    } catch {
      inputRef.current?.focus();
      say('붙여넣기 권한이 없습니다. 입력란에 직접 붙여넣어 주세요.', true);
    }
  };

  const submit = async () => {
    const trimmed = url.trim();
    if (!isYoutubeUrl(trimmed) || submitting) return;

    setSubmitting(true);
    setError(null);
    say('화면해설 만들기를 시작합니다.');

    try {
      const video = await submitYoutubeUrl(trimmed);
      const title = preview?.title ?? trimmed;
      writePendingJob({ videoId: video.id, title, startedAt: Date.now() });
      vibrate();
      navigate(`/processing/${video.id}`, { state: { title } });
    } catch (cause) {
      setSubmitting(false);
      const nextAt = nextAvailableText(cause);
      setError({
        key: toErrorKey(cause, 'gen'),
        detail: nextAt ? `다음 생성 가능 시각은 ${nextAt} 입니다.` : toErrorDetail(cause),
      });
      say('시작하지 못했습니다. 화면 위 안내를 확인해주세요.', true);
    }
  };

  return (
    <div role="main" aria-label="영상 URL 가져오기 화면" className="st-screen st-screen--narrow">
      <BackButton onClick={() => navigate('/home')} destination="홈으로 돌아갑니다" />

      <h1 className="st-title">영상 URL 가져오기</h1>

      {error && <ErrorAlert error={error.key} detail={error.detail} />}

      <label htmlFor="st-url-field" className="st-label">
        영상 주소
      </label>
      <input
        id="st-url-field"
        ref={inputRef}
        type="url"
        inputMode="url"
        autoComplete="url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && state === 'ok') void submit();
        }}
        aria-describedby="st-url-help"
        aria-invalid={state === 'invalid'}
        placeholder="https://www.youtube.com/watch?v="
        className="st-input"
      />
      <div id="st-url-help" className="st-body">
        유튜브 영상 페이지 주소를 붙여넣어 주세요.
      </div>

      <button
        type="button"
        onClick={() => void paste()}
        aria-label="붙여넣기, 클립보드의 주소를 입력란에 붙여넣습니다"
        className="st-btn st-btn--muted st-btn--block"
      >
        붙여넣기
      </button>

      {state === 'invalid' && (
        <div role="alert" className="st-alert">
          <ErrorCircleIcon size={26} className="st-alert__icon" />
          <div className="st-alert__text">
            지원하지 않는 URL입니다. 현재는 유튜브 영상 주소만 받습니다.
          </div>
        </div>
      )}

      <div aria-live="polite" className="st-sr-only">
        {state === 'checking' ? '영상 정보를 확인하고 있습니다.' : ''}
      </div>

      {state === 'ok' && (
        <div className="st-stack" style={{ gap: 14 }}>
          <div className="st-preview">
            <Thumbnail variant="wide" caption="썸네일" src={preview?.thumbnail} />
            <span className="st-video-item__text">
              <span className="st-video-item__title">{preview?.title ?? '유튜브 영상'}</span>
              <span className="st-video-item__meta">
                {preview ? '이 영상으로 화면해설을 만듭니다.' : '영상 정보를 읽지 못했지만 진행할 수 있습니다.'}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="st-btn st-btn--primary st-btn--block st-btn--tall"
          >
            {submitting ? '시작하는 중…' : '화면해설 만들기'}
          </button>
        </div>
      )}
    </div>
  );
}
