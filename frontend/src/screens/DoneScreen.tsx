import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { ErrorAlert } from '../components/ErrorAlert';
import { CheckIcon } from '../components/icons';
import { Thumbnail } from '../components/Thumbnail';
import { useResult } from '../hooks/useResult';
import { useAnnouncer } from '../store/AnnouncerProvider';

/**
 * 화면해설 완성.
 *
 * 다음에 할 일이 하나(재생하기)로 분명하게 보이도록 주 동작만 크게 세우고,
 * 내려받기·공유는 그 아래 같은 무게로 나란히 둔다.
 */
export function DoneScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { videoId: rawId } = useParams();
  const { say } = useAnnouncer();

  const videoId = Number(rawId);
  const title = (location.state as { title?: string } | null)?.title ?? '영상';
  const { audioSrc, cues, loading, error } = useResult(videoId);

  const [shareNote, setShareNote] = useState<string | null>(null);

  const download = () => {
    if (!audioSrc) return;
    const link = document.createElement('a');
    link.href = audioSrc;
    link.download = `${title.replace(/[\\/:*?"<>|]/g, '_')}-화면해설.wav`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    say('해설 음성을 내려받습니다.');
  };

  /** 기기가 공유 시트를 지원하면 그것을, 아니면 주소를 클립보드에 담는다. */
  const share = async () => {
    const url = `${window.location.origin}/player/${videoId}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        say('공유했습니다.');
        return;
      } catch {
        /* 사용자가 닫았을 수 있다. 아래 복사로 넘어간다. */
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareNote('재생 화면 주소를 복사했습니다.');
      say('재생 화면 주소를 복사했습니다.');
    } catch {
      setShareNote(`주소를 직접 복사해주세요: ${url}`);
      say('주소를 복사하지 못했습니다. 화면의 주소를 직접 복사해주세요.', true);
    }
  };

  return (
    <div
      role="main"
      aria-label="화면해설 완성 화면"
      className="st-screen st-screen--narrow"
      style={{ gap: 16 }}
    >
      <div className="st-done-head">
        <span aria-hidden="true" className="st-done-check">
          <CheckIcon size={28} />
        </span>
        <h1 className="st-title st-title--sm">화면해설이 완성되었습니다</h1>
      </div>

      {error && (
        <ErrorAlert
          error={error}
          detail="결과를 읽지 못했습니다. 보관함에서 다시 열어보세요."
          onRetry={() => navigate('/archive')}
          retryLabel="보관함 열기"
        />
      )}

      <div className="st-card">
        <Thumbnail variant="cover" caption="영상 썸네일" />
        <div className="st-card__title">{title}</div>
        <div className="st-card__meta">
          {loading
            ? '결과를 불러오는 중입니다.'
            : cues.length > 0
              ? `화면해설 ${cues.length}개 구간`
              : '화면해설 음성이 준비되었습니다.'}
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate(`/player/${videoId}`, { state: { title } })}
        aria-label="재생하기, 화면해설이 포함된 영상을 재생합니다"
        className="st-btn st-btn--primary st-btn--block st-btn--hero"
      >
        재생하기
      </button>

      <div className="st-row" style={{ gap: 10 }}>
        <button
          type="button"
          onClick={download}
          disabled={!audioSrc}
          aria-label="저장하기, 해설 음성을 기기에 파일로 내려받습니다"
          className="st-btn st-btn--muted"
          style={{ flex: '1 1 200px' }}
        >
          저장하기
        </button>
        <button
          type="button"
          onClick={() => void share()}
          className="st-btn st-btn--muted"
          style={{ flex: '1 1 200px' }}
        >
          공유하기
        </button>
      </div>

      {shareNote && (
        <div role="status" className="st-note">
          {shareNote}
        </div>
      )}

      <BackButton onClick={() => navigate('/home')} destination="홈 화면으로 돌아갑니다" block />
    </div>
  );
}
