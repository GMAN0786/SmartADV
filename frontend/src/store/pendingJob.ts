import { STORAGE_KEYS } from '../constants';
import type { PendingJob } from '../types';

/**
 * 진행 중인 작업을 기기에 적어 둔다.
 *
 * "앱을 닫아도 작업은 계속됩니다"라고 안내하는 이상, 다시 열었을 때
 * 그 작업으로 돌아갈 길이 있어야 한다. 홈 화면이 이 값을 읽어 안내한다.
 */
export function readPendingJob(): PendingJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pendingJob);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingJob;
    return typeof parsed?.videoId === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

export function writePendingJob(job: PendingJob): void {
  try {
    localStorage.setItem(STORAGE_KEYS.pendingJob, JSON.stringify(job));
  } catch {
    /* 저장이 막혀 있으면 이어보기만 못 할 뿐, 작업은 서버에서 그대로 돈다. */
  }
}

export function clearPendingJob(videoId?: number): void {
  try {
    if (videoId !== undefined) {
      const current = readPendingJob();
      if (current && current.videoId !== videoId) return;
    }
    localStorage.removeItem(STORAGE_KEYS.pendingJob);
  } catch {
    /* 위와 같다. */
  }
}
