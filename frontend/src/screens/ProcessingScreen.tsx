import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { cancelJob, fetchJob } from '../api/endpoints';
import { BackButton } from '../components/BackButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorAlert } from '../components/ErrorAlert';
import { JOB_POLL_MS, STEP_NAMES } from '../constants';
import { useAnnouncer } from '../store/AnnouncerProvider';
import { useArchive } from '../store/ArchiveProvider';
import { useHaptic } from '../store/SettingsProvider';
import { clearPendingJob } from '../store/pendingJob';
import type { ErrorKey, JobState } from '../types';
import { toErrorKey } from '../utils/errors';
import { formatWait } from '../utils/format';
import { isTerminal, processingHeadline, processingSteps, stepIndex } from '../utils/processing';

/** 발화로 알릴 진행률 지점. */
const MILESTONES = [25, 50, 75];

/**
 * 화면해설 생성 중.
 *
 * 진행 상황을 막대(시각) · 단계 목록(글자) · aria-live(소리) 세 갈래로 전한다.
 * 이 화면을 떠나도 작업은 서버에서 계속 돈다 — 그만두는 길은 "작업 취소"
 * 버튼 하나뿐이고, 그 사실을 화면에서도 소리로도 알린다.
 */
export function ProcessingScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { videoId: rawId } = useParams();
  const { say } = useAnnouncer();
  const { reload } = useArchive();
  const vibrate = useHaptic();

  const videoId = Number(rawId);
  const title = (location.state as { title?: string } | null)?.title ?? '영상';

  const [status, setStatus] = useState<JobState | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [loadError, setLoadError] = useState<ErrorKey | null>(null);
  const [askingCancel, setAskingCancel] = useState(false);

  const milestoneRef = useRef(0);
  const finishedRef = useRef(false);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    clearPendingJob(videoId);
    void reload();
    vibrate([16, 60, 16]);
    say(`화면해설이 완성되었습니다. ${title}. 재생하기, 버튼.`);
    navigate(`/done/${videoId}`, { replace: true, state: { title } });
  }, [videoId, title, navigate, reload, say, vibrate]);

  // 작업 상태를 주기적으로 물어본다. 끝난 상태를 받으면 폴링을 멈춘다.
  useEffect(() => {
    if (!Number.isFinite(videoId)) {
      setLoadError('notfound');
      return;
    }

    const controller = new AbortController();
    let timer = 0;
    let stopped = false;

    const poll = async () => {
      try {
        const job = await fetchJob(videoId, controller.signal);
        if (stopped) return;

        const next = job.progress ?? 0;
        setStatus(job.status);
        setProgress(next);
        setStatusDetail(job.statusDetail);
        setErrorMessage(job.errorMessage);
        setQueuePosition(job.queuePosition ?? 0);
        setWaitSeconds(job.estimatedWaitTimeSeconds ?? 0);
        setLoadError(null);

        MILESTONES.forEach((mark) => {
          if (milestoneRef.current < mark && next >= mark) {
            say(`${processingHeadline(job.status, next)}. ${mark}퍼센트.`);
          }
        });
        milestoneRef.current = Math.max(milestoneRef.current, next);

        if (isTerminal(job.status)) {
          stopped = true;
          window.clearInterval(timer);
          if (job.status === 'DONE') {
            finish();
          } else {
            clearPendingJob(videoId);
            say(
              job.status === 'FAILED'
                ? '화면해설을 만들지 못했습니다. 다시 시도할 수 있습니다.'
                : '작업이 취소되었습니다.',
              true,
            );
          }
        }
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        if (!stopped) setLoadError(toErrorKey(cause, 'network'));
      }
    };

    void poll();
    timer = window.setInterval(() => void poll(), JOB_POLL_MS);

    return () => {
      stopped = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [videoId, say, finish]);

  const confirmCancel = async () => {
    setAskingCancel(false);
    try {
      await cancelJob(videoId);
    } catch {
      /* 이미 끝났을 수도 있다. 어느 쪽이든 사용자는 홈으로 돌아간다. */
    }
    clearPendingJob(videoId);
    say('작업을 취소했습니다. 홈 화면.');
    navigate('/home', { replace: true });
  };

  const current = stepIndex(status, progress);
  const headline = processingHeadline(status, progress, statusDetail);
  const steps = processingSteps(current);
  const failed = status === 'FAILED';
  const cancelled = status === 'CANCELLED';
  const running = !isTerminal(status);

  return (
    <div
      role="main"
      aria-label="화면해설 생성 중 화면"
      className="st-screen st-screen--wide"
      style={{ gap: 18 }}
    >
      <h1 className="st-title">{failed || cancelled ? '작업이 멈췄습니다' : '화면해설을 만들고 있어요'}</h1>
      <p className="st-video-item__meta">{title}</p>

      {loadError && running && (
        <ErrorAlert
          error={loadError}
          detail="작업 상태를 읽지 못했습니다. 연결이 돌아오면 자동으로 이어집니다."
        />
      )}

      {failed && (
        <ErrorAlert
          error="gen"
          detail={errorMessage}
          onRetry={() => navigate('/home', { replace: true })}
          retryLabel="홈에서 다시 시작"
        />
      )}

      {cancelled && (
        <div className="st-note">
          이 작업은 취소되었습니다. 홈에서 새 영상으로 다시 시작할 수 있습니다.
        </div>
      )}

      {running && (
        <>
          <div aria-live="polite" className="st-proc-status">
            <div className="st-proc-status__head">
              {headline} · {progress}%
            </div>
            <div className="st-proc-status__sub">
              4단계 중 {current + 1}번째 · {STEP_NAMES[current]}
              {status === 'PENDING' && queuePosition > 0
                ? ` · 앞에 ${queuePosition}개, 예상 ${formatWait(waitSeconds)}`
                : ''}
            </div>
          </div>

          <div
            role="progressbar"
            aria-label="화면해설 생성 진행률"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`${headline}, ${progress}퍼센트`}
            className="st-progress"
          >
            <div className="st-progress__fill" style={{ width: `${progress}%` }} />
          </div>

          <ol className="st-steps">
            {steps.map((step, index) => (
              <li
                key={step.name}
                aria-label={`${index + 1}단계 ${step.name}, ${step.state}`}
                className="st-step"
              >
                <span aria-hidden="true" className="st-step__mark">
                  {step.mark}
                </span>
                <span className="st-step__text">
                  <span className="st-step__name">{step.name}</span>
                  <span className="st-step__state">{step.state}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="st-body" style={{ marginTop: 4 }}>
            이 화면을 닫아도 작업은 계속됩니다. 홈 화면에서 다시 들어올 수 있습니다.
          </p>

          <button
            type="button"
            onClick={() => {
              setAskingCancel(true);
              say('작업을 취소할까요? 대화상자. 작업 취소하기, 버튼.');
            }}
            className="st-btn st-btn--ghost st-btn--block"
          >
            작업 취소
          </button>
        </>
      )}

      <BackButton
        onClick={() => navigate('/home')}
        destination={running ? '홈 화면으로 돌아갑니다. 작업은 계속됩니다' : '홈 화면으로 돌아갑니다'}
        block
      />

      {askingCancel && (
        <ConfirmDialog
          label="작업 취소 확인"
          title="작업을 취소할까요?"
          text="지금 취소하면 지금까지 만든 화면해설이 사라집니다."
          confirmLabel="작업 취소하기"
          dismissLabel="계속 만들기"
          onConfirm={() => void confirmCancel()}
          onDismiss={() => {
            setAskingCancel(false);
            say(`계속 만듭니다. ${headline}.`);
          }}
        />
      )}
    </div>
  );
}
