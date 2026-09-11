/* 앱 안에서 오가는 값들의 모양. 백엔드가 돌려주는 것과 화면이 쓰는 것을 함께 둔다. */

/** 설정에서 고를 수 있는 테마. `system`은 OS 설정에 따라 dark/light 로 풀린다. */
export type ThemeKey = 'system' | 'dark' | 'light' | 'hc';

/** URL 입력란의 검증 상태. */
export type UrlState = 'idle' | 'checking' | 'ok' | 'invalid';

/** 사용자에게 안내하는 오류 종류. */
export type ErrorKey =
  | 'upload'
  | 'network'
  | 'gen'
  | 'storage'
  | 'limit'
  | 'auth'
  | 'notfound';

/** 화면해설 한 구간. */
export interface Cue {
  /** 시작 시각(초). */
  at: number;
  /** 끝 시각(초). 대본에 없으면 비어 있다. */
  until?: number;
  text: string;
}

/** 화면해설 음성 설정. 아직 서버에 보내지 않고 기기에만 저장한다. */
export interface NarrationSettings {
  voice: string;
  volume: string;
  rate: string;
  detail: string;
}

/** 생성 진행 단계. */
export interface ProcessingStep {
  name: string;
  state: '완료' | '진행 중' | '대기 중';
  mark: string;
}

/* ── 백엔드 응답 ─────────────────────────────────────────────────────── */

/** `GET /api/auth/me`, `POST /api/auth/google` 의 user. */
export interface UserProfile {
  id: number;
  email: string;
  name: string;
  picture: string;
  role: string;
}

/** `POST /api/videos/upload`, `POST /api/videos/youtube`. */
export interface VideoResponse {
  id: number;
  originalFileName: string;
  s3Url: string;
  fileSize: number | null;
  createdAt: string;
}

/** 백엔드 `AnalysisJob.status` 가 가질 수 있는 값. */
export type JobState =
  | 'PENDING'
  | 'PREPROCESSING'
  | 'SCRIPT_GENERATING'
  | 'TTS_GENERATING'
  | 'MERGING'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

/** `GET /api/jobs/{videoId}`. */
export interface JobStatus {
  id: number;
  videoId: number;
  userId: number;
  status: JobState;
  progress: number | null;
  statusDetail: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** 대기열에서 앞에 있는 작업 수. 아직 시작되지 않았을 때만 뜻이 있다. */
  queuePosition: number;
  estimatedWaitTimeSeconds: number;
}

/** `GET /api/results/video/{videoId}`. */
export interface ResultResponse {
  id: number;
  jobId: number;
  userId: number;
  /** 해설 대본 원문. 시각 정보가 들어 있으면 구간 목록으로 풀어 쓴다. */
  scriptText: string | null;
  narrationAudioPath: string | null;
  mergedVideoPath: string | null;
  createdAt: string;
}

/** `GET /api/archive` 의 항목 하나. */
export interface ArchiveEntry {
  /** Result 의 id. 좋아요 토글에 쓴다. */
  id: string;
  /** Video 의 id. 재생·결과 조회에 쓴다. */
  videoId: number | null;
  title: string;
  type: 'url' | 'file';
  /** 합성된 영상 경로. */
  fileName: string | null;
  /** 해설 음성 경로. */
  audioFileName: string | null;
  audioSize: string;
  date: string;
}

/** 진행 중인 작업을 기기에 적어 두고 홈에서 이어보게 한다. */
export interface PendingJob {
  videoId: number;
  title: string;
  startedAt: number;
}
