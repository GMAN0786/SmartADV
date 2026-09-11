import { Link, useNavigate } from 'react-router-dom';
import { mediaUrl } from '../api/client';
import { Thumbnail } from '../components/Thumbnail';
import { useArchive } from '../store/ArchiveProvider';
import type { ArchiveEntry } from '../types';
import { formatDate } from '../utils/format';

/** 보관함. 만들어 둔 화면해설 영상을 다시 찾아 재생한다. */
export function ArchiveScreen() {
  const navigate = useNavigate();
  const { items, loading, error, reload } = useArchive();

  return (
    <div role="main" aria-label="보관함 화면" className="st-screen" style={{ gap: 16 }}>
      <h1 className="st-title">보관함</h1>

      {error && (
        <div role="alert" className="st-note">
          <div style={{ marginBottom: 10 }}>{error}</div>
          <button type="button" onClick={() => void reload()} className="st-btn st-btn--muted">
            다시 불러오기
          </button>
        </div>
      )}

      {loading && items.length === 0 && (
        <p role="status" aria-live="polite" className="st-body">
          보관함을 불러오는 중입니다.
        </p>
      )}

      {!loading && items.length === 0 ? (
        <div className="st-empty">
          <div className="st-empty__title">아직 만든 화면해설 영상이 없습니다.</div>
          <div className="st-body">영상을 추가하면 이곳에서 다시 볼 수 있습니다.</div>
          <button type="button" onClick={() => navigate('/home')} className="st-btn st-btn--primary">
            영상 추가하기
          </button>
        </div>
      ) : (
        <ul aria-label={`보관함 목록, ${items.length}개`} className="st-grid st-list" style={{ gap: 12 }}>
          {items.map((item) => (
            <ArchiveCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchiveCard({ item }: { item: ArchiveEntry }) {
  const audioHref = mediaUrl(item.audioFileName);
  const playable = item.videoId !== null;

  return (
    <li className="st-archive-card">
      <div className="st-archive-card__head">
        <Thumbnail />
        <span className="st-video-item__text">
          <span className="st-video-item__title">{item.title}</span>
          <span className="st-video-item__meta">
            {formatDate(item.date)} · {item.type === 'url' ? '링크로 가져옴' : '올린 파일'} · {item.audioSize}
          </span>
          <span className="st-archive-card__status">
            <span aria-hidden="true">{playable ? '✓' : '!'}</span>
            <span>{playable ? '화면해설 완료' : '재생할 수 없음'}</span>
          </span>
        </span>
      </div>

      <div className="st-archive-card__actions">
        {playable ? (
          <Link
            to={`/player/${item.videoId}`}
            state={{ title: item.title }}
            aria-label={`${item.title} 재생하기, 링크. ${formatDate(item.date)}, 화면해설 완료`}
            className="st-btn st-btn--primary"
            style={{ borderRadius: 'var(--r-md)', textDecoration: 'none' }}
          >
            재생하기
          </Link>
        ) : (
          <span className="st-body">재생 정보를 찾을 수 없습니다.</span>
        )}

        {audioHref && (
          <a
            href={audioHref}
            download
            aria-label={`${item.title} 해설 음성 내려받기, ${item.audioSize}`}
            className="st-icon-btn"
            style={{ textDecoration: 'none' }}
          >
            <span aria-hidden="true">↓</span>
            <span>음성 저장</span>
          </a>
        )}
      </div>
    </li>
  );
}
