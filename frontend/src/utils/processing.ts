import { STATUS_TEXT, STEP_INDEX_BY_STATUS, STEP_NAMES } from '../constants';
import type { JobState, ProcessingStep } from '../types';

/**
 * 진행률만 있을 때의 단계 추정.
 *
 * 백엔드가 status 를 주면 그쪽이 언제나 우선한다. 이 함수는 status 를
 * 아직 못 받은 첫 폴링 직전에만 쓰인다.
 */
export function stepIndexFromProgress(pct: number): number {
  if (pct < 20) return 0;
  if (pct < 45) return 1;
  if (pct < 85) return 2;
  return 3;
}

/** 4단계 중 몇 번째인지. status 를 먼저 보고, 없으면 진행률로 어림잡는다. */
export function stepIndex(status: JobState | null, progress: number): number {
  if (status && status in STEP_INDEX_BY_STATUS) return STEP_INDEX_BY_STATUS[status];
  return stepIndexFromProgress(progress);
}

/**
 * 지금 무슨 일이 벌어지는지 한 줄로.
 *
 * 백엔드의 statusDetail 이 더 자세하면 그것을 그대로 쓴다 — 서버가 아는 것을
 * 화면에서 굳이 뭉개지 않는다.
 */
export function processingHeadline(
  status: JobState | null,
  progress: number,
  statusDetail?: string | null,
): string {
  if (statusDetail && statusDetail.trim()) return statusDetail.trim();
  if (status) return STATUS_TEXT[status];
  return `${STEP_NAMES[stepIndexFromProgress(progress)]} 중`;
}

/** 4단계 각각의 완료·진행·대기 상태. */
export function processingSteps(current: number): ProcessingStep[] {
  return STEP_NAMES.map((name, i) => {
    if (i < current) return { name, state: '완료' as const, mark: '✓' };
    if (i === current) return { name, state: '진행 중' as const, mark: '▶' };
    return { name, state: '대기 중' as const, mark: '·' };
  });
}

/** 작업이 더 이상 움직이지 않는 상태인지. */
export function isTerminal(status: JobState | null): boolean {
  return status === 'DONE' || status === 'FAILED' || status === 'CANCELLED';
}
