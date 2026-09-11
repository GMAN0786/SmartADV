import { STORAGE_KEYS } from '../constants';
import type { ErrorKey } from '../types';

/** 백엔드 기본 주소. 웹에서는 비워 두고 Vite 프록시를 타고, 앱에서는 절대 주소를 넣는다. */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

/** 서버가 400 이상으로 답했을 때. status 와 본문을 그대로 들고 있는다. */
export class ApiError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>, message?: string) {
    super(message ?? String(payload.message ?? payload.error ?? `요청이 실패했습니다 (${status})`));
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }

  /** 화면이 보여줄 오류 종류로 옮긴다. */
  get errorKey(): ErrorKey {
    if (this.status === 401 || this.status === 403) return 'auth';
    if (this.status === 404) return 'notfound';
    if (this.status === 429) return 'limit';
    if (this.status === 507 || this.payload.error === 'storage') return 'storage';
    return 'gen';
  }
}

/** 네트워크가 끊겨 요청 자체가 나가지 못했을 때. */
export class NetworkError extends Error {
  /** 원래 던져진 오류. 로그를 볼 때 무엇이 끊겼는지 알려 준다. */
  readonly reason: unknown;

  constructor(reason?: unknown) {
    super('네트워크에 연결되어 있지 않습니다.');
    this.name = 'NetworkError';
    this.reason = reason;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.token);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.token, token);
  } catch {
    /* 저장을 막아 둔 브라우저에서도 이번 세션은 이어갈 수 있게 조용히 넘긴다. */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
  } catch {
    /* 위와 같다. */
  }
}

/** 로그인 토큰이 있으면 Authorization 을 붙인 헤더. */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getToken();
  return {
    ...(extra ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** 로그인 토큰을 붙이지 않는다. 로그인 요청 자체에만 쓴다. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

/**
 * 백엔드 호출 한 자리.
 *
 * 성공하면 파싱된 본문을, 실패하면 ApiError 또는 NetworkError 를 던진다.
 * 화면은 `catch` 한 오류의 `errorKey` 만 보고 안내 문구를 고른다.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, anonymous, headers, ...rest } = options;

  const isForm = body instanceof FormData;
  const requestHeaders: Record<string, string> = {
    ...(isForm || body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(anonymous ? {} : authHeaders()),
    ...((headers as Record<string, string>) ?? {}),
  };

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError(cause);
  }

  const payload = await readBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, payload as Record<string, unknown>);
  }

  return payload as T;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/**
 * 저장소 경로를 브라우저가 바로 읽을 수 있는 주소로.
 *
 * 백엔드가 절대 주소(S3 등)를 주면 그대로 쓰고, 내부 경로를 주면
 * 스트리밍 엔드포인트를 거친다.
 */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  // 이미 브라우저가 바로 열 수 있는 주소(외부 URL, 체험 모드의 blob)는 그대로 둔다.
  if (/^(https?|blob|data):/i.test(path)) return path;
  return `${API_BASE}/api/storage/stream?url=${encodeURIComponent(path)}`;
}
