import { ApiError, NetworkError } from '../api/client';
import { UploadError } from '../api/endpoints';
import type { ErrorKey } from '../types';

/** 던져진 오류를 화면이 안내할 종류 하나로 좁힌다. */
export function toErrorKey(error: unknown, fallback: ErrorKey = 'gen'): ErrorKey {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof ApiError) return error.errorKey;

  if (error instanceof UploadError) {
    if (error.status === 0) return 'network';
    if (error.status === 401 || error.status === 403) return 'auth';
    if (error.status === 429) return 'limit';
    return 'upload';
  }

  return fallback;
}

/** 서버가 함께 보내 준 설명. 기본 안내보다 구체적일 때만 화면에 쓴다. */
export function toErrorDetail(error: unknown): string | null {
  if (error instanceof ApiError || error instanceof UploadError) {
    const raw = error.payload.message ?? error.payload.error;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    // `usage_limit` 같은 기계용 코드는 사용자에게 그대로 보여 주지 않는다.
    return /^[a-z_]+$/.test(raw.trim()) ? null : raw.trim();
  }
  return null;
}

/**
 * 사용량 제한에 걸렸을 때 다음에 만들 수 있는 시각.
 *
 * 백엔드가 `nextAvailableTime` 을 함께 주므로, "언제 다시 오면 되는지"까지
 * 안내할 수 있다.
 */
export function nextAvailableText(error: unknown): string | null {
  const payload =
    error instanceof ApiError || error instanceof UploadError ? error.payload : null;
  const raw = payload?.nextAvailableTime;
  if (typeof raw !== 'string') return null;

  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return null;

  return at.toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
