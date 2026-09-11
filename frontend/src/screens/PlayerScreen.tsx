import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { BackButton } from '../components/BackButton';
import { ErrorAlert } from '../components/ErrorAlert';
import { Thumbnail } from '../components/Thumbnail';
import { ForwardIcon, PauseIcon, PlayIcon, RewindIcon } from '../components/icons';
import { SEEK_STEP, SPEED_OPTIONS, VOLUME_LEVELS } from '../constants';
import { useResult } from '../hooks/useResult';
import { useAnnouncer } from '../store/AnnouncerProvider';
import { useHaptic, useSettings } from '../store/SettingsProvider';
import { activeCueIndex } from '../utils/cues';
import { clamp, cycle, formatSpeed, formatTime, formatTimeKo, parseRate } from '../utils/format';

/**
 * 재생.
 *
 * 좁은 화면에서는 영상 위, 해설 목록 아래로 쌓이고 폭이 650px 남짓을 넘으면
 * 두 단으로 갈라진다 — 미디어 질의 없이 flex-basis 만으로 접히므로 어떤
 * 창 크기에서도 같은 규칙이 산다.
 *
 * 시안과 달리 실제 미디어를 재생한다. 재생 위치는 타이머가 아니라 미디어
 * 요소가 알려 주는 값이고, 해설 구간은 대본에 시각이 붙어 있을 때만 나온다.
 */
export function PlayerScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { videoId: rawId } = useParams();
  const { say } = useAnnouncer();
  const vibrate = useHaptic();
  const { narration } = useSettings();

  const videoId = Number(rawId);
  const title = (location.state as { title?: string } | null)?.title ?? '영상';
  const { videoSrc, audioSrc, cues, loading, error } = useResult(videoId);

  const mediaRef = useRef<HTMLVideoElement & HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  /*
   * 재생기는 불러오기가 끝난 뒤에야 화면에 붙는다. ref 만 두면 "붙었다"는 사실이
   * 다시 그리기를 부르지 않아서, 이벤트를 달아 두는 아래 effect 가 빈손으로
   * 지나가 버릴 수 있다. 그러면 소리는 나는데 화면의 시간·재생 표시가 0 에
   * 멈춘다. 엘리먼트를 상태로도 들고 있으면 붙는 순간이 정확히 잡힌다.
   */
  const [mediaNode, setMediaNode] = useState<(HTMLVideoElement & HTMLAudioElement) | null>(null);
  const attachMedia = useCallback((node: (HTMLVideoElement & HTMLAudioElement) | null) => {
    mediaRef.current = node;
    setMediaNode(node);
  }, []);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mediaFailed, setMediaFailed] = useState(false);

  /** 합쳐진 영상이 있으면 그것을, 없으면 해설 음성만 재생한다. */
  const src = videoSrc ?? audioSrc;
  const isVideo = Boolean(videoSrc);
  /** 해설이 이미 영상에 섞여 있는지. 이 경우 켜고 끌 수 있는 대상이 아니다. */
  const narrationBakedIn = isVideo;

  const activeCue = useMemo(() => activeCueIndex(cues, time), [cues, time]);

  // 미디어가 알려 주는 값만 신뢰한다. 우리가 세는 시간과 실제 재생이 어긋나지 않는다.
  useEffect(() => {
    const media = mediaNode;
    if (!media) return;

    const onTime = () => setTime(media.currentTime);
    const onDuration = () => setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      say('재생이 끝났습니다.');
    };
    const onError = () => {
      setMediaFailed(true);
      say('영상을 재생할 수 없습니다.', true);
    };

    media.addEventListener('timeupdate', onTime);
    media.addEventListener('loadedmetadata', onDuration);
    media.addEventListener('durationchange', onDuration);
    media.addEventListener('play', onPlay);
    media.addEventListener('pause', onPause);
    media.addEventListener('ended', onEnded);
    media.addEventListener('error', onError);

    return () => {
      media.removeEventListener('timeupdate', onTime);
      media.removeEventListener('loadedmetadata', onDuration);
      media.removeEventListener('durationchange', onDuration);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('error', onError);
    };
  }, [mediaNode, say]);

  // 설정의 해설 음량·속도는 해설 음성만 재생할 때 그대로 적용된다.
  useEffect(() => {
    const media = mediaNode;
    if (!media) return;

    if (!isVideo) {
      media.volume = VOLUME_LEVELS[narration.volume] ?? 1;
      media.playbackRate = speed * parseRate(narration.rate);
    } else {
      media.playbackRate = speed;
    }
  }, [mediaNode, speed, isVideo, narration.volume, narration.rate]);

  const seekTo = useCallback(
    (next: number, spoken?: string) => {
      const media = mediaRef.current;
      const limit = duration || 0;
      const target = clamp(next, 0, limit);
      if (media) media.currentTime = target;
      setTime(target);
      say(spoken ?? `재생 위치, ${formatTimeKo(target)} / 전체 ${formatTimeKo(limit)}.`);
    },
    [duration, say],
  );

  const seekBy = (delta: number) => {
    const target = clamp(time + delta, 0, duration || 0);
    seekTo(target, `${Math.abs(delta)}초 ${delta >= 0 ? '이후' : '이전'}. ${formatTimeKo(target)}.`);
  };

  const togglePlay = () => {
    const media = mediaRef.current;
    if (!media) return;
    vibrate();
    if (media.paused) void media.play().catch(() => setMediaFailed(true));
    else media.pause();
  };

  const handleSeekKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? SEEK_STEP
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -SEEK_STEP
          : 0;

    if (delta !== 0) {
      event.preventDefault();
      seekBy(delta);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      seekTo(duration);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      togglePlay();
    }
  };

  // 막대를 직접 눌러도 그 지점으로 옮겨간다. 손 포인터가 약속한 동작을 지킨다.
  const handleSeekClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || !duration) return;
    seekTo(((event.clientX - rect.left) / rect.width) * duration);
  };

  const toggleFullscreen = () => {
    const target = mediaRef.current ?? stageRef.current;
    if (!target) return;

    if (document.fullscreenElement) {
      void document.exitFullscreen();
      say('전체 화면을 끝냈습니다.');
    } else {
      void target.requestFullscreen?.().catch(() => undefined);
      say('전체 화면으로 전환했습니다.');
    }
  };

  const cycleSpeed = () => {
    const next = cycle(SPEED_OPTIONS, speed);
    setSpeed(next);
    say(`재생 속도, ${formatSpeed(next)}.`);
  };

  const ratio = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div role="main" aria-label="재생 화면" className="st-screen st-player">
      <BackButton onClick={() => navigate('/archive')} destination="보관함으로 돌아갑니다" />

      {error && (
        <ErrorAlert
          error={error}
          detail="이 영상의 결과를 읽지 못했습니다. 보관함에서 다시 열어보세요."
          onRetry={() => navigate('/archive')}
          retryLabel="보관함 열기"
        />
      )}

      {mediaFailed && (
        <ErrorAlert
          error="storage"
          detail="미디어를 불러오지 못했습니다. 잠시 후 다시 시도해주세요."
          onRetry={() => {
            setMediaFailed(false);
            mediaRef.current?.load();
          }}
        />
      )}

      <div className="st-player__columns">
        <div className="st-player__stage" ref={stageRef}>
          {loading && <div className="st-media-frame" aria-hidden="true" />}

          {!loading && src && isVideo && (
            <video
              ref={attachMedia}
              src={src}
              className="st-media"
              preload="metadata"
              playsInline
              controls={false}
              aria-label={`${title} 영상`}
            />
          )}

          {/*
           * 해설 음성만 있는 결과.
           *
           * 브라우저 기본 재생기를 얹지 않고 시안의 "영상 화면" 자리를 그대로
           * 두고, 아래의 재생 막대와 조작 버튼이 이 오디오를 움직인다 —
           * 조작하는 곳이 두 군데로 갈리지 않는다.
           */}
          {!loading && src && !isVideo && (
            <>
              <Thumbnail variant="stage" caption="해설 음성" />
              <audio ref={attachMedia} src={src} preload="metadata" className="st-sr-only" />
            </>
          )}

          {!loading && !src && !error && (
            <div className="st-note">이 영상에는 재생할 수 있는 파일이 없습니다.</div>
          )}

          <div className="st-player__title">{title}</div>

          <div className="st-stack" style={{ gap: 8 }}>
            <div
              role="slider"
              tabIndex={0}
              onKeyDown={handleSeekKey}
              onClick={handleSeekClick}
              aria-label="재생 위치"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(time)}
              aria-valuetext={`재생 위치, ${formatTimeKo(time)} / 전체 ${formatTimeKo(duration)}, 조절 가능`}
              className="st-seek"
            >
              <span className="st-seek__track">
                <span className="st-seek__fill" style={{ width: `${ratio}%` }} />
              </span>
            </div>
            <div className="st-seek__times">
              <span>{formatTime(time)}</span>
              <span className="st-seek__total">{formatTime(duration)}</span>
            </div>
          </div>

          <div className="st-transport">
            <button
              type="button"
              onClick={() => seekBy(-SEEK_STEP)}
              disabled={!src}
              aria-label="10초 이전으로 이동, 버튼"
              className="st-transport__btn"
            >
              <RewindIcon size={26} />
              10초 이전
            </button>

            <button
              type="button"
              onClick={togglePlay}
              disabled={!src}
              aria-label={playing ? '일시정지, 버튼' : '재생, 버튼'}
              aria-pressed={playing}
              className="st-transport__btn st-transport__btn--play"
            >
              {playing ? <PauseIcon size={24} /> : <PlayIcon size={24} />}
              <span>{playing ? '일시정지' : '재생'}</span>
            </button>

            <button
              type="button"
              onClick={() => seekBy(SEEK_STEP)}
              disabled={!src}
              aria-label="10초 이후로 이동, 버튼"
              className="st-transport__btn"
            >
              <ForwardIcon size={26} />
              10초 이후
            </button>
          </div>

          <div className="st-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <button
              type="button"
              onClick={cycleSpeed}
              disabled={!src}
              aria-label={`재생 속도, 현재 ${formatSpeed(speed)}, 버튼`}
              className="st-btn"
              style={{ flex: 1, fontSize: 'var(--fs-300)' }}
            >
              재생 속도 {formatSpeed(speed)}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              disabled={!isVideo}
              aria-label="전체 화면으로 보기, 버튼"
              className="st-btn"
              style={{ flex: 1, fontSize: 'var(--fs-300)' }}
            >
              전체 화면
            </button>
          </div>

          {/* 해설이 영상에 이미 섞여 있으면 켜고 끌 수 있는 척하지 않는다. */}
          <div className="st-toggle-row" style={{ cursor: 'default' }}>
            <span aria-hidden="true" className="st-toggle-row__mark">
              {narrationBakedIn ? '✓' : '♪'}
            </span>
            <span className="st-toggle-row__text">
              <span className="st-toggle-row__name">화면해설</span>
              <span className="st-toggle-row__state">
                {narrationBakedIn
                  ? '켜짐 · 해설이 영상에 함께 담겨 있습니다'
                  : `켜짐 · 해설 음성 ${cues.length > 0 ? `${cues.length}개 구간` : ''}을 재생합니다`.replace(' 을', '을')}
              </span>
            </span>
          </div>
        </div>

        <div className="st-player__aside">
          <h2 className="st-heading" style={{ fontSize: 'var(--fs-600)' }}>
            전체 해설
          </h2>

          {cues.length === 0 ? (
            <p className="st-body">
              {loading
                ? '해설 대본을 불러오는 중입니다.'
                : '이 영상에는 구간별 해설 목록이 아직 없습니다. 해설은 재생되는 음성으로 들을 수 있습니다.'}
            </p>
          ) : (
            <>
              <div className="st-video-item__meta">해설 문장을 선택하면 그 장면으로 이동합니다.</div>

              {/* 재생이 흐르며 바뀌는 현재 해설. 목록을 훑지 않아도 지금 장면을 알 수 있다. */}
              <div aria-live="polite" aria-atomic="true" className="st-live">
                {activeCue >= 0 ? `현재 해설 · ${cues[activeCue].text}` : '아직 해설 구간에 닿지 않았습니다.'}
              </div>

              <ul aria-label={`화면해설 전체 목록, ${cues.length}개 구간`} className="st-cue-list st-list">
                {cues.map((cue, index) => {
                  const current = index === activeCue;
                  return (
                    <li key={`${cue.at}-${index}`}>
                      <button
                        type="button"
                        onClick={() => seekTo(cue.at, `${formatTimeKo(cue.at)}로 이동했습니다. ${cue.text}`)}
                        aria-current={current ? 'true' : undefined}
                        aria-label={`${formatTimeKo(cue.at)}, ${cue.text}${current ? ', 현재 재생 중인 해설' : ''}, 버튼. 선택하면 이 장면으로 이동합니다.`}
                        className="st-cue"
                      >
                        <span className="st-cue__time">{formatTime(cue.at)}</span>
                        <span className="st-cue__text">{cue.text}</span>
                        <span aria-hidden="true" className="st-cue__mark">
                          {current ? '▶' : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
