import { STORAGE_KEYS } from '../constants';
import * as demo from '../demo/backend';
import { DEMO } from '../demo/mode';
import type {
  ArchiveEntry,
  JobStatus,
  ResultResponse,
  UserProfile,
  VideoResponse,
} from '../types';
import { API_BASE, api } from './client';

/*
 * 백엔드로 나가는 길은 전부 이 파일을 지난다.
 *
 * 체험 모드(`demo/mode.ts`)가 켜져 있으면 같은 함수가 가짜 서버를 부른다.
 * 화면 쪽 코드는 어느 쪽인지 알 필요가 없다 — 돌려주는 값의 모양이 같다.
 */

/* ── 인증 ───────────────────────────────────────────────────────────── */

export interface LoginResponse {
  token: string;
  user: UserProfile;
}

/** 구글 Identity Services 가 준 credential 을 세션 토큰으로 바꾼다. */
export function loginWithGoogle(credential: string): Promise<LoginResponse> {
  if (DEMO) return demo.login();
  return api<LoginResponse>('/api/auth/google', {
    method: 'POST',
    body: { credential },
    anonymous: true,
  });
}

/** 체험 모드에서 구글을 거치지 않고 바로 들어가는 길. */
export function loginAsDemoUser(): Promise<LoginResponse> {
  return demo.login();
}

export function fetchMe(): Promise<UserProfile> {
  if (DEMO) return demo.me();
  return api<UserProfile>('/api/auth/me');
}

export function logout(): Promise<unknown> {
  if (DEMO) return Promise.resolve({});
  return api('/api/auth/logout', { method: 'POST' });
}

/* ── 영상 등록 ──────────────────────────────────────────────────────── */

/**
 * 파일 업로드.
 *
 * 진행률을 알려면 fetch 로는 부족해 XHR 을 쓴다. 업로드는 몇 분이 걸릴 수
 * 있고, 그동안 아무 표시가 없으면 멈춘 것과 구분되지 않는다.
 */
export function uploadVideo(
  file: File,
  onProgress: (percent: number) => void,
): { promise: Promise<VideoResponse>; abort: () => void } {
  if (DEMO) return demo.upload(file, onProgress);

  const xhr = new XMLHttpRequest();

  const promise = new Promise<VideoResponse>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);

    xhr.open('POST', `${API_BASE}/api/videos/upload`, true);

    const token = localStorage.getItem(STORAGE_KEYS.token);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(xhr.responseText) as Record<string, unknown>;
      } catch {
        payload = { message: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) resolve(payload as unknown as VideoResponse);
      else reject(new UploadError(xhr.status, payload));
    };

    xhr.onerror = () => reject(new UploadError(0, { error: 'network' }));
    xhr.onabort = () => reject(new DOMException('업로드가 중단되었습니다.', 'AbortError'));

    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}

/** XHR 로 올린 업로드가 실패했을 때. ApiError 와 같은 모양으로 다룬다. */
export class UploadError extends Error {
  readonly status: number;
  readonly payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload.message ?? payload.error ?? '영상을 올리지 못했습니다.'));
    this.name = 'UploadError';
    this.status = status;
    this.payload = payload;
  }
}

export function submitYoutubeUrl(url: string): Promise<VideoResponse> {
  if (DEMO) return demo.submitUrl(url);
  return api<VideoResponse>('/api/videos/youtube', { method: 'POST', body: { url } });
}

/* ── 작업 ───────────────────────────────────────────────────────────── */

export function fetchJob(videoId: number, signal?: AbortSignal): Promise<JobStatus> {
  if (DEMO) return demo.job(videoId);
  return api<JobStatus>(`/api/jobs/${videoId}`, { signal });
}

export function cancelJob(videoId: number): Promise<unknown> {
  if (DEMO) return demo.cancel(videoId);
  return api(`/api/jobs/${videoId}/cancel`, { method: 'DELETE' });
}

export function fetchResult(videoId: number, signal?: AbortSignal): Promise<ResultResponse> {
  if (DEMO) return demo.result(videoId);
  return api<ResultResponse>(`/api/results/video/${videoId}`, { signal });
}

/* ── 보관함 ─────────────────────────────────────────────────────────── */

export function fetchArchive(signal?: AbortSignal): Promise<ArchiveEntry[]> {
  if (DEMO) return demo.archive();
  return api<ArchiveEntry[]>('/api/archive', { signal });
}
