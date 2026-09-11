import type { ErrorKey, JobState, ThemeKey } from './types';

/** 사이드 레일 탐색으로 바뀌는 경계 너비(px). app.css 의 컨테이너 질의와 같은 값. */
export const RAIL_MIN_WIDTH = 768;

/** 앞/뒤로 건너뛰는 간격(초). */
export const SEEK_STEP = 10;

/** 작업 상태를 물어보는 주기(ms). */
export const JOB_POLL_MS = 1500;

export const THEME_NAMES: Record<ThemeKey, string> = {
  system: '시스템 설정 따르기',
  dark: '다크 모드',
  light: '라이트 모드',
  hc: '고대비 모드',
};

export const THEME_ORDER: ThemeKey[] = ['system', 'dark', 'light', 'hc'];

/** 생성 과정을 사용자에게 보여줄 4단계. 백엔드 상태를 이 넷으로 접어서 보여준다. */
export const STEP_NAMES = ['영상 준비', '장면 분석', '화면해설 생성', '오디오 적용'] as const;

/**
 * 백엔드 status → 4단계 중 몇 번째인지.
 *
 * MERGING 은 오디오를 영상에 얹는 마지막 단계라 '오디오 적용'과 같은 칸에 둔다.
 */
export const STEP_INDEX_BY_STATUS: Record<JobState, number> = {
  PENDING: 0,
  PREPROCESSING: 1,
  SCRIPT_GENERATING: 2,
  TTS_GENERATING: 3,
  MERGING: 3,
  DONE: 3,
  FAILED: 0,
  CANCELLED: 0,
};

/** 작업 상태를 한 줄로 옮긴 말. 화면과 발화에 같은 문장을 쓴다. */
export const STATUS_TEXT: Record<JobState, string> = {
  PENDING: '작업 대기 중',
  PREPROCESSING: '영상 분석 및 장면 감지 중',
  SCRIPT_GENERATING: '해설 대본 작성 중',
  TTS_GENERATING: '해설 음성 합성 중',
  MERGING: '해설 음성을 영상에 얹는 중',
  DONE: '완료',
  FAILED: '작업 실패',
  CANCELLED: '작업이 취소되었습니다',
};

/** 오류 키 → [제목, 해결 방법]. 모든 문구가 다음 행동을 알려준다. */
export const ERRORS: Record<ErrorKey, readonly [string, string]> = {
  upload: ['영상을 불러오지 못했습니다.', '파일 형식을 확인한 후 다시 시도해주세요. MP4, MOV를 지원합니다.'],
  network: ['네트워크에 연결되어 있지 않습니다.', '네트워크 연결을 확인한 후 다시 시도해주세요.'],
  gen: ['화면해설을 만들지 못했습니다.', '잠시 후 다시 시도하거나 다른 영상으로 진행해주세요.'],
  storage: ['저장 공간에 접근할 수 없습니다.', '잠시 후 다시 시도해주세요. 서버 저장 공간이 가득 찼을 수 있습니다.'],
  limit: ['아직 새 화면해설을 만들 수 없습니다.', '일반 사용자는 생성 성공 후 3시간에 한 번 만들 수 있습니다.'],
  auth: ['로그인이 필요합니다.', '다시 로그인한 후 이어서 진행해주세요.'],
  notfound: ['영상을 찾을 수 없습니다.', '보관함에서 다시 선택해주세요.'],
};

/** 업로드가 가능한 파일 형식. input 의 accept 와 안내 문구가 같은 값을 본다. */
export const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/quicktime,video/x-matroska,video/webm';
export const ACCEPTED_VIDEO_LABEL = 'MP4, MOV, MKV, WEBM';

/** 설정 화면에서 눌러 순환시키는 값들. */
export const VOICE_OPTIONS = ['여성 1', '여성 2', '남성 1'];
export const VOLUME_OPTIONS = ['작게', '보통', '크게'];
export const RATE_OPTIONS = ['0.8배', '1.0배', '1.3배', '1.6배'];
export const DETAIL_OPTIONS = ['간결하게', '기본', '자세하게'];

/** 재생 화면의 배속 순환 목록. */
export const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5];

/** 해설 음량 선택지 → 실제 오디오 볼륨. */
export const VOLUME_LEVELS: Record<string, number> = {
  작게: 0.4,
  보통: 0.75,
  크게: 1,
};

/** 글자 크기 배율 범위와 증감 폭. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 2;
export const SCALE_STEP = 0.1;

/** 기기에 남기는 값들의 열쇠. */
export const STORAGE_KEYS = {
  token: 'scenetalk_token',
  user: 'scenetalk_user',
  settings: 'scenetalk_settings',
  pendingJob: 'scenetalk_pending_job',
} as const;
