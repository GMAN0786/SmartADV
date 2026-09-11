import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { uploadVideo } from '../api/endpoints';
import { ErrorAlert } from '../components/ErrorAlert';
import { LinkIcon } from '../components/icons';
import { Thumbnail } from '../components/Thumbnail';
import { UploadAction } from '../components/UploadAction';
import { useAnnouncer } from '../store/AnnouncerProvider';
import { useArchive } from '../store/ArchiveProvider';
import { useHaptic } from '../store/SettingsProvider';
import { clearPendingJob, readPendingJob, writePendingJob } from '../store/pendingJob';
import type { ErrorKey, PendingJob } from '../types';
import { formatBytes, formatDate } from '../utils/format';
import { nextAvailableText, toErrorDetail, toErrorKey } from '../utils/errors';

/** 홈에 함께 보여줄 최근 영상 개수. */
const RECENT_COUNT = 2;

/**
 * 홈.
 *
 * 화면해설을 만들기 시작하는 두 갈래(파일 업로드 · URL)와 최근 영상 목록.
 * 오류가 나면 흐름을 끊지 않고 이 화면 맨 위에 안내가 얹힌다.
 */
export function HomeScreen() {
  const navigate = useNavigate();
  const { say } = useAnnouncer();
  const { items } = useArchive();
  const vibrate = useHaptic();

  const [progress, setProgress] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<{ key: ErrorKey; detail: string | null } | null>(null);
  const [pending, setPending] = useState<PendingJob | null>(() => readPendingJob());

  const abortRef = useRef<(() => void) | null>(null);
  const uploading = progress !== null;

  // 화면을 떠나면 올리던 파일도 함께 멈춘다. 서버에 반쪽짜리 파일을 남기지 않는다.
  useEffect(() => {
    return () => abortRef.current?.();
  }, []);

  const startUpload = (file: File) => {
    setError(null);
    setFileName(file.name);
    setProgress(0);
    say(`${file.name}, ${formatBytes(file.size)} 올리는 중입니다.`);

    const { promise, abort } = uploadVideo(file, setProgress);
    abortRef.current = abort;

    void promise
      .then((video) => {
        abortRef.current = null;
        const job: PendingJob = { videoId: video.id, title: file.name, startedAt: Date.now() };
        writePendingJob(job);
        vibrate();
        navigate(`/processing/${video.id}`, { state: { title: file.name } });
      })
      .catch((cause) => {
        abortRef.current = null;
        setProgress(null);
        if (cause instanceof DOMException && cause.name === 'AbortError') return;

        const key = toErrorKey(cause, 'upload');
        const nextAt = nextAvailableText(cause);
        const detail = nextAt
          ? `다음 생성 가능 시각은 ${nextAt} 입니다.`
          : toErrorDetail(cause);
        setError({ key, detail });
        say('영상을 올리지 못했습니다. 화면 위 안내를 확인해주세요.', true);
      });
  };

  const recent = items.filter((item) => item.videoId !== null).slice(0, RECENT_COUNT);

  return (
    <div role="main" aria-label="홈 화면" className="st-screen">
      {error && (
        <ErrorAlert
          error={error.key}
          detail={error.detail}
          onRetry={() => setError(null)}
          retryLabel="안내 닫기"
        />
      )}

      {/* 만들던 작업이 있으면 먼저 그리로 돌아갈 길을 낸다. */}
      {pending && !uploading && (
        <div className="st-note">
          <div style={{ marginBottom: 10 }}>
            <b>{pending.title}</b> 의 화면해설을 만들고 있었습니다.
          </div>
          <div className="st-row" style={{ gap: 10 }}>
            <Link
              to={`/processing/${pending.videoId}`}
              className="st-btn st-btn--primary"
              style={{ flex: '1 1 180px', textDecoration: 'none' }}
            >
              진행 상황 보기
            </Link>
            <button
              type="button"
              onClick={() => {
                clearPendingJob(pending.videoId);
                setPending(null);
                say('진행 중이던 작업 안내를 닫았습니다.');
              }}
              className="st-btn st-btn--ghost"
              style={{ flex: '1 1 140px' }}
            >
              안내 닫기
            </button>
          </div>
        </div>
      )}

      {uploading ? (
        <div className="st-upload">
          <div className="st-upload__head">
            <span>영상 올리는 중 · {progress}%</span>
            <span className="st-upload__name">{fileName}</span>
          </div>
          <div
            role="progressbar"
            aria-label="영상 업로드 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`영상 업로드, ${progress}퍼센트`}
            className="st-progress"
          >
            <div className="st-progress__fill" style={{ width: `${progress}%` }} />
          </div>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.();
              abortRef.current = null;
              setProgress(null);
              say('업로드를 중단했습니다.');
            }}
            className="st-btn st-btn--ghost st-btn--block"
          >
            업로드 중단
          </button>
        </div>
      ) : (
        <div className="st-row">
          <UploadAction onFile={startUpload} />

          <Link
            to="/url"
            aria-label="URL로 가져오기, 유튜브 영상 링크를 붙여넣습니다"
            className="st-action"
            style={{ textDecoration: 'none' }}
          >
            <LinkIcon size={34} />
            <span className="st-action__text">
              <span className="st-action__title">URL로 가져오기</span>
              <span className="st-action__hint">유튜브 영상 링크를 붙여넣습니다.</span>
            </span>
          </Link>
        </div>
      )}

      <h2 className="st-heading" style={{ marginTop: 4 }}>
        최근 영상
      </h2>

      {recent.length === 0 ? (
        <p className="st-body">
          아직 만든 화면해설이 없습니다. 위에서 영상을 올리거나 링크를 붙여넣어 시작해보세요.
        </p>
      ) : (
        <ul className="st-grid st-list">
          {recent.map((item) => (
            <li key={item.id}>
              <Link
                to={`/player/${item.videoId}`}
                aria-label={`${item.title}, ${formatDate(item.date)}, 링크. 화면해설과 함께 재생합니다.`}
                className="st-video-item"
                style={{ textDecoration: 'none' }}
              >
                <Thumbnail caption="썸네일" />
                <span className="st-video-item__text">
                  <span className="st-video-item__title">{item.title}</span>
                  <span className="st-video-item__meta">{formatDate(item.date)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
