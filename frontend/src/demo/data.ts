import type { ArchiveEntry, UserProfile } from '../types';

/** 체험용 영상 전체 길이(초) = 8분 30초. 시안의 예시 영상과 같은 길이다. */
export const DEMO_DURATION = 510;

export const DEMO_USER: UserProfile = {
  id: 1,
  email: 'demo@scene-talk.local',
  name: '체험 사용자',
  picture: '',
  role: 'USER',
};

/**
 * 체험용 해설 대본.
 *
 * 파이프라인(`LLM.py`)이 내놓는 형식 그대로 —
 * `silence_id,scene_id,window_start,window_end,text` CSV 다.
 * 재생 화면의 구간 목록은 이 문자열을 `parseCues` 로 풀어서 만든다.
 * 즉 체험 모드가 파서까지 함께 확인해 준다.
 */
export const DEMO_SCRIPT_CSV = buildScriptCsv([
  [0, '골목 입구, 낡은 철제 간판이 바람에 흔들린다.'],
  [14, '카메라가 좁은 계단을 천천히 오른다.'],
  [31, '담벼락에 그려진 벽화가 화면을 가득 채운다.'],
  [52, '고양이 한 마리가 화분 사이에서 걸어 나온다.'],
  [78, '햇빛이 골목 바닥에 긴 그림자를 만든다.'],
  [104, '노란 대문 앞에서 걸음이 멈춘다.'],
  [134, '좁은 골목 끝에서 노란 간판의 가게 문이 열린다.'],
  [166, '가게 안, 김이 오르는 국솥이 보인다.'],
  [198, '주인이 손을 흔들며 인사한다.'],
  [231, '창밖으로 지나가는 자전거가 스친다.'],
  [266, '탁자 위에 놓인 그릇에서 김이 피어오른다.'],
  [301, '해가 기울며 골목이 주황빛으로 물든다.'],
  [340, '아이들이 골목을 뛰어 지나간다.'],
  [382, '가게 불빛이 하나둘 켜진다.'],
  [421, '멀리 언덕 위 집들이 실루엣으로 보인다.'],
  [463, '카메라가 골목을 되돌아 내려온다.'],
  [495, '화면이 서서히 어두워진다.'],
]);

/** 보관함에 미리 들어 있는 항목. 시안의 예시 세 개를 그대로 쓴다. */
export const DEMO_ARCHIVE: ArchiveEntry[] = [
  {
    id: '1001',
    videoId: 1001,
    title: '서울 골목 산책 브이로그',
    type: 'file',
    fileName: null,
    audioFileName: 'demo/seoul-walk.wav',
    audioSize: '12MB',
    date: '2026-08-07 14:20:00',
  },
  {
    id: '1002',
    videoId: 1002,
    title: '요리 레시피 - 김치찌개',
    type: 'url',
    fileName: null,
    audioFileName: 'demo/kimchi-stew.wav',
    audioSize: '7MB',
    date: '2026-08-05 09:12:00',
  },
  {
    id: '1003',
    videoId: 1003,
    title: '전시회 안내 영상',
    type: 'file',
    fileName: null,
    audioFileName: 'demo/exhibition.wav',
    audioSize: '4MB',
    date: '2026-08-02 18:40:00',
  },
];

/** 초를 파이프라인이 쓰는 `HH:MM:SS:mmm` 표기로. */
function timecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, width = 2) => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(ms, 3)}`;
}

function buildScriptCsv(rows: [number, string][]): string {
  const header = 'silence_id,scene_id,window_start,window_end,text';
  const lines = rows.map(([at, text], index) => {
    const end = Math.min(DEMO_DURATION, (rows[index + 1]?.[0] ?? DEMO_DURATION) - 1);
    // 본문에 쉼표가 있으므로 CSV 규칙대로 따옴표로 감싼다.
    return `${index + 1},${index + 1},${timecode(at)},${timecode(end)},"${text}"`;
  });
  return [header, ...lines].join('\n');
}

/** 체험용 해설 구간의 시작 시각들. 미리듣기 트랙의 표시음 위치로도 쓴다. */
export const DEMO_CUE_TIMES = DEMO_SCRIPT_CSV.split('\n')
  .slice(1)
  .map((line) => {
    const [, , start] = line.split(',');
    const [h, m, s, ms] = start.split(':').map(Number);
    return h * 3600 + m * 60 + s + ms / 1000;
  });
