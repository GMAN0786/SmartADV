import { ApiError } from '../api/client';
import type {
  ArchiveEntry,
  JobState,
  JobStatus,
  ResultResponse,
  VideoResponse,
} from '../types';
import { DEMO_ARCHIVE, DEMO_SCRIPT_CSV, DEMO_USER } from './data';
import { demoTrackUrl } from './track';

export { DEMO_USER };

/**
 * 체험용 가짜 서버.
 *
 * 실제 백엔드와 같은 모양의 값을 돌려주되, 시간은 흐르는 척한다. 생성 작업은
 * 시작한 시각을 기억해 두고 지난 시간으로 진행률을 계산하므로, 다른 화면에
 * 다녀오거나 새로고침해도 작업이 이어진다.
 */

/* ── 기억해 두는 것 ──────────────────────────────────────────────────── */

interface DemoJob {
  videoId: number;
  title: string;
  startedAt: number;
}

const JOBS_KEY = 'scenetalk_demo_jobs';
const ARCHIVE_KEY = 'scenetalk_demo_archive';

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장이 막혀 있어도 이번 화면까지는 그대로 돈다. */
  }
}

/* ── 생성 작업의 시간표 ──────────────────────────────────────────────── */

/**
 * 상태가 바뀌는 지점. 눈으로 4단계가 모두 지나가는 것을 볼 수 있도록
 * 전체 14초로 잡았다. [경과 초, 상태, 그 지점의 진행률]
 */
const TIMELINE: [number, JobState, number][] = [
  [0, 'PENDING', 0],
  [2, 'PREPROCESSING', 10],
  [5, 'SCRIPT_GENERATING', 42],
  [9.5, 'TTS_GENERATING', 82],
  [12.5, 'MERGING', 95],
  [14, 'DONE', 100],
];

const STATUS_DETAILS: Partial<Record<JobState, string>> = {
  PENDING: '작업 대기 중',
  PREPROCESSING: '장면 전환과 무음 구간을 찾는 중',
  SCRIPT_GENERATING: '장면을 읽고 해설 문장을 쓰는 중',
  TTS_GENERATING: '해설 문장을 음성으로 바꾸는 중',
  MERGING: '해설 음성을 영상에 얹는 중',
};

/** 경과 시간으로 지금 상태와 진행률을 계산한다. */
function progressAt(elapsedSeconds: number): { status: JobState; progress: number } {
  for (let i = TIMELINE.length - 1; i >= 0; i -= 1) {
    const [at, status, base] = TIMELINE[i];
    if (elapsedSeconds < at) continue;

    const next = TIMELINE[i + 1];
    if (!next) return { status, progress: base };

    // 두 지점 사이를 고르게 채워 막대가 끊기지 않고 흐르게 한다.
    const span = next[0] - at;
    const ratio = span > 0 ? Math.min(1, (elapsedSeconds - at) / span) : 1;
    return { status, progress: Math.round(base + (next[2] - base) * ratio) };
  }
  return { status: 'PENDING', progress: 0 };
}

/* ── 인증 ───────────────────────────────────────────────────────────── */

export function login(): Promise<{ token: string; user: typeof DEMO_USER }> {
  return delay({ token: 'demo-token', user: DEMO_USER });
}

export function me(): Promise<typeof DEMO_USER> {
  return delay(DEMO_USER);
}

/* ── 영상 등록 ──────────────────────────────────────────────────────── */

function startJob(title: string): VideoResponse {
  // 미리 들어 있는 보관함 항목(1001~1003)과 겹치지 않는 범위에서 고른다.
  const videoId = 100000 + (Date.now() % 900000);
  const jobs = readStore<DemoJob[]>(JOBS_KEY, []);
  jobs.push({ videoId, title, startedAt: Date.now() });
  writeStore(JOBS_KEY, jobs.slice(-10));

  return {
    id: videoId,
    originalFileName: title,
    s3Url: `demo/${videoId}.mp4`,
    fileSize: null,
    createdAt: new Date().toISOString(),
  };
}

/** 업로드 진행률까지 흉내 낸다. 중단 버튼도 실제로 듣는다. */
export function upload(
  file: File,
  onProgress: (percent: number) => void,
): { promise: Promise<VideoResponse>; abort: () => void } {
  let timer = 0;
  let aborted = false;

  const promise = new Promise<VideoResponse>((resolve) => {
    let percent = 0;
    timer = window.setInterval(() => {
      if (aborted) return;
      percent = Math.min(100, percent + 7);
      onProgress(percent);
      if (percent >= 100) {
        window.clearInterval(timer);
        resolve(startJob(file.name));
      }
    }, 90);
  });

  return {
    promise,
    abort: () => {
      aborted = true;
      window.clearInterval(timer);
    },
  };
}

export function submitUrl(url: string): Promise<VideoResponse> {
  return delay(startJob(titleFromUrl(url)));
}

/* ── 작업 ───────────────────────────────────────────────────────────── */

export function job(videoId: number): Promise<JobStatus> {
  const found = readStore<DemoJob[]>(JOBS_KEY, []).find((entry) => entry.videoId === videoId);

  // 보관함에 이미 있는 항목은 오래전에 끝난 작업이다.
  if (!found) {
    if (archiveList().some((item) => item.videoId === videoId)) {
      return delay(makeJob(videoId, 'DONE', 100));
    }
    return Promise.reject(new ApiError(404, { error: '작업을 찾을 수 없습니다.' }));
  }

  const { status, progress } = progressAt((Date.now() - found.startedAt) / 1000);
  if (status === 'DONE') rememberFinished(found);

  return delay(makeJob(videoId, status, progress));
}

export function cancel(videoId: number): Promise<unknown> {
  const jobs = readStore<DemoJob[]>(JOBS_KEY, []).filter((entry) => entry.videoId !== videoId);
  writeStore(JOBS_KEY, jobs);
  return delay({ message: '작업을 취소했습니다.' });
}

/* ── 결과 ───────────────────────────────────────────────────────────── */

export function result(videoId: number): Promise<ResultResponse> {
  const known =
    archiveList().find((item) => item.videoId === videoId) ??
    readStore<DemoJob[]>(JOBS_KEY, []).find((entry) => entry.videoId === videoId);

  if (!known) return Promise.reject(new ApiError(404, { error: '결과를 찾을 수 없습니다.' }));

  return delay({
    id: videoId,
    jobId: videoId,
    userId: DEMO_USER.id,
    scriptText: DEMO_SCRIPT_CSV,
    // 브라우저에서 만든 8분 30초짜리 트랙. 구간마다 짧게 울린다.
    narrationAudioPath: demoTrackUrl(),
    mergedVideoPath: null,
    createdAt: new Date().toISOString(),
  });
}

/* ── 보관함 ─────────────────────────────────────────────────────────── */

export function archive(): Promise<ArchiveEntry[]> {
  return delay(archiveList());
}

/* ── 안쪽 도우미 ────────────────────────────────────────────────────── */

function archiveList(): ArchiveEntry[] {
  return readStore<ArchiveEntry[]>(ARCHIVE_KEY, DEMO_ARCHIVE);
}

/** 끝난 작업을 보관함 맨 위로 올린다. 같은 것을 두 번 넣지 않는다. */
function rememberFinished(entry: DemoJob): void {
  const items = archiveList();
  if (items.some((item) => item.videoId === entry.videoId)) return;

  const stamp = new Date(entry.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  items.unshift({
    id: String(entry.videoId),
    videoId: entry.videoId,
    title: entry.title,
    type: 'file',
    fileName: null,
    audioFileName: `demo/${entry.videoId}.wav`,
    audioSize: '11MB',
    date: `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}:${pad(stamp.getSeconds())}`,
  });
  writeStore(ARCHIVE_KEY, items);
}

function makeJob(videoId: number, status: JobState, progress: number): JobStatus {
  return {
    id: videoId,
    videoId,
    userId: DEMO_USER.id,
    status,
    progress,
    statusDetail: STATUS_DETAILS[status] ?? null,
    errorMessage: null,
    startedAt: new Date().toISOString(),
    finishedAt: status === 'DONE' ? new Date().toISOString() : null,
    // 대기 중일 때만 줄이 있는 것처럼 보인다.
    queuePosition: status === 'PENDING' ? 1 : 0,
    estimatedWaitTimeSeconds: status === 'PENDING' ? 45 : 0,
  };
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get('v') ?? parsed.pathname.replace('/', '');
    return id ? `유튜브 영상 ${id}` : '유튜브 영상';
  } catch {
    return '유튜브 영상';
  }
}

/** 실제 서버처럼 잠깐 뜸을 들인다. 로딩 상태가 화면에 제대로 나오는지도 함께 확인된다. */
function delay<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), ms));
}
