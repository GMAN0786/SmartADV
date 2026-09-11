import type { Cue } from '../types';

/** 주어진 재생 위치에서 들리고 있는 해설 구간의 인덱스. 아직이면 -1. */
export function activeCueIndex(cues: Cue[], time: number): number {
  let index = -1;
  for (let i = 0; i < cues.length; i += 1) {
    if (time >= cues[i].at) index = i;
    else break;
  }
  return index;
}

/**
 * 시각 문자열을 초로.
 *
 * 파이프라인이 쓰는 `HH:MM:SS:mmm` 을 비롯해 `HH:MM:SS.mmm`, `MM:SS` 까지 받는다.
 * 읽을 수 없으면 null — 부르는 쪽이 그 줄을 건너뛴다.
 */
export function parseTimecode(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  // 밀리초 구분자가 `:` 인 형태(HH:MM:SS:mmm)를 `.` 으로 통일한다.
  const normalized = text.replace(',', '.').replace(/^(\d+:\d{2}:\d{2}):(\d{1,3})$/, '$1.$2');
  const parts = normalized.split(':');
  if (parts.length < 2 || parts.length > 3) {
    const plain = Number.parseFloat(normalized);
    return Number.isFinite(plain) ? plain : null;
  }

  const numbers = parts.map((part) => Number.parseFloat(part));
  if (numbers.some((n) => !Number.isFinite(n))) return null;

  return parts.length === 3
    ? numbers[0] * 3600 + numbers[1] * 60 + numbers[2]
    : numbers[0] * 60 + numbers[1];
}

/**
 * 해설 대본을 시각이 붙은 구간 목록으로 푼다.
 *
 * 백엔드 `Result.scriptText` 는 아직 한 줄짜리 안내 문구지만, 파이프라인
 * (`LLM.py`)이 만드는 실제 대본은 `silence_id,scene_id,window_start,window_end,text`
 * CSV 다. 그 CSV 가 그대로 저장되기 시작하면 이 함수가 바로 목록을 만들어 낸다.
 * 그 전까지는 빈 배열을 돌려주고, 화면은 "구간 정보 없음"을 안내한다.
 *
 * 받아들이는 형태
 * - JSON 배열: `[{ "at": 12, "text": "…" }]` 또는 `start`/`time` 키
 * - CSV: 머리글에 `window_start` 와 `text` 가 있는 표
 * - 줄 단위: `[00:00:12] 문장`, `0:12 문장`, SRT 의 `--> ` 구간
 */
export function parseCues(scriptText: string | null | undefined): Cue[] {
  if (!scriptText) return [];
  const text = scriptText.trim();
  if (!text) return [];

  return (
    parseJsonCues(text) ??
    parseCsvCues(text) ??
    parseLineCues(text) ??
    []
  );
}

function parseJsonCues(text: string): Cue[] | null {
  if (!text.startsWith('[') && !text.startsWith('{')) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }

  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { cues?: unknown }).cues)
      ? (data as { cues: unknown[] }).cues
      : null;
  if (!rows) return null;

  const cues: Cue[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const rawAt = record.at ?? record.start ?? record.time ?? record.window_start;
    const at = typeof rawAt === 'number' ? rawAt : typeof rawAt === 'string' ? parseTimecode(rawAt) : null;
    const body = record.text ?? record.caption ?? record.description;
    if (at === null || at === undefined || typeof body !== 'string' || !body.trim()) continue;

    const rawUntil = record.until ?? record.end ?? record.window_end;
    const until =
      typeof rawUntil === 'number' ? rawUntil : typeof rawUntil === 'string' ? parseTimecode(rawUntil) : null;

    cues.push({ at, text: body.trim(), ...(until !== null && until !== undefined ? { until } : {}) });
  }

  return cues.length > 0 ? sortCues(cues) : null;
}

function parseCsvCues(text: string): Cue[] | null {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitCsvRow(lines[0]).map((cell) => cell.trim().toLowerCase());
  const atColumn = header.findIndex((cell) => cell === 'window_start' || cell === 'start' || cell === 'at');
  const textColumn = header.findIndex((cell) => cell === 'text' || cell === 'description');
  if (atColumn === -1 || textColumn === -1) return null;

  const untilColumn = header.findIndex((cell) => cell === 'window_end' || cell === 'end');

  const cues: Cue[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvRow(line);
    const at = parseTimecode(cells[atColumn] ?? '');
    const body = (cells[textColumn] ?? '').trim();
    if (at === null || !body) continue;

    const until = untilColumn === -1 ? null : parseTimecode(cells[untilColumn] ?? '');
    cues.push({ at, text: body, ...(until !== null ? { until } : {}) });
  }

  return cues.length > 0 ? sortCues(cues) : null;
}

/** 줄 앞에 시각이 붙은 대본. SRT 의 `시작 --> 끝` 도 같은 규칙으로 읽는다. */
function parseLineCues(text: string): Cue[] | null {
  const pattern = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?(?:[.,:]\d{1,3})?)\]?\s*(?:-->\s*(\S+))?\s*[-–—|\t]?\s*(.*)$/;
  const cues: Cue[] = [];
  let pending: Cue | null = null;

  for (const line of text.split(/\r?\n/)) {
    const match = pattern.exec(line);
    if (!match) {
      // SRT 는 시각 줄 다음에 본문이 온다. 비어 있던 구간을 여기서 채운다.
      if (pending && line.trim()) {
        pending.text = pending.text ? `${pending.text} ${line.trim()}` : line.trim();
      }
      continue;
    }

    const at = parseTimecode(match[1]);
    if (at === null) continue;

    const until = match[2] ? parseTimecode(match[2]) : null;
    const body = match[3].trim();

    if (pending && !pending.text) cues.pop();
    pending = { at, text: body, ...(until !== null ? { until } : {}) };
    cues.push(pending);
  }

  const filled = cues.filter((cue) => cue.text.length > 0);
  return filled.length > 0 ? sortCues(filled) : null;
}

function sortCues(cues: Cue[]): Cue[] {
  return [...cues].sort((a, b) => a.at - b.at);
}

/** 따옴표 안의 쉼표를 구분자로 세지 않는 최소 CSV 분해기. */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}
