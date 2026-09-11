import { DEMO_CUE_TIMES, DEMO_DURATION } from './data';

/** 8 kHz · 8비트 모노. 체험용이라 음질보다 크기를 줄이는 쪽을 골랐다. */
const SAMPLE_RATE = 8000;

/** 구간이 시작될 때 울리는 짧은 표시음. */
const BEEP_HZ = 660;
const BEEP_SECONDS = 0.18;

let cached: string | null = null;

/**
 * 체험용 오디오 트랙을 만든다.
 *
 * 파일을 저장소에 넣는 대신 브라우저에서 바로 만들어 blob 주소로 넘긴다.
 * 8분 30초 동안 조용하다가 해설 구간이 시작될 때마다 짧게 울린다 —
 * 재생 막대가 흐르며 해설 목록의 강조가 함께 옮겨 가는 것을 눈과 귀로
 * 동시에 확인할 수 있다.
 */
export function demoTrackUrl(): string {
  if (cached) return cached;

  const samples = Math.round(DEMO_DURATION * SAMPLE_RATE);
  const header = 44;
  const buffer = new ArrayBuffer(header + samples);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt 청크 길이
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 모노
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE, true); // 초당 바이트
  view.setUint16(32, 1, true); // 표본 하나의 크기
  view.setUint16(34, 8, true); // 비트 수
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples, true);

  // 8비트 부호 없는 PCM 의 무음은 0 이 아니라 가운데 값 128 이다.
  bytes.fill(128, header);

  const beepLength = Math.round(BEEP_SECONDS * SAMPLE_RATE);
  for (const at of DEMO_CUE_TIMES) {
    const start = Math.round(at * SAMPLE_RATE);
    for (let i = 0; i < beepLength && start + i < samples; i += 1) {
      // 끝으로 갈수록 잦아들게 해서 딸깍 소리를 없앤다.
      const fade = 1 - i / beepLength;
      const value = Math.sin((2 * Math.PI * BEEP_HZ * i) / SAMPLE_RATE) * 40 * fade;
      bytes[header + start + i] = 128 + Math.round(value);
    }
  }

  cached = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return cached;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}
