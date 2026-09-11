/** 초를 `m:ss`로. 재생 시간 표시에 쓴다. */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 초를 `n분 n초`로. 스크린 리더는 `2:14`를 시각으로 읽지 못하므로
 * aria-label·발화문에는 반드시 이 형식을 쓴다.
 */
export function formatTimeKo(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 목록에서 현재 값의 다음 값을 돌려준다. 끝에 닿으면 처음으로 감는다. */
export function cycle<T>(options: readonly T[], current: T): T {
  const index = options.indexOf(current);
  return options[(index + 1) % options.length];
}

/** 배속을 `1.25배`처럼. 불필요한 0은 떼어낸다. */
export function formatSpeed(speed: number): string {
  return `${String(speed)}배`;
}

/** 설정의 `1.3배` 같은 표기에서 숫자만 꺼낸다. 못 읽으면 1배. */
export function parseRate(label: string): number {
  const value = Number.parseFloat(label);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 남은 대기 시간을 사람이 읽는 말로. 0 이하면 바로 시작한다는 뜻이다. */
export function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '즉시 시작';
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}분 ${s % 60}초` : `${s}초`;
}

/** 바이트를 사람이 읽는 크기로. */
export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '크기 알 수 없음';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`;
}

/** 0.1 단위로 반올림. 0.1을 거듭 더할 때 쌓이는 부동소수점 오차를 잘라낸다. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 백엔드가 주는 `yyyy-MM-dd HH:mm:ss` 또는 ISO 문자열을 우리말 날짜로. */
export function formatDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}
