import { useEffect, useMemo, useState } from 'react';
import { mediaUrl } from '../api/client';
import { fetchResult } from '../api/endpoints';
import type { Cue, ErrorKey, ResultResponse } from '../types';
import { toErrorKey } from '../utils/errors';
import { parseCues } from '../utils/cues';

export interface LoadedResult {
  result: ResultResponse | null;
  /** 합성된 영상 주소. 없으면 해설 음성만 있는 결과다. */
  videoSrc: string | null;
  /** 해설 음성 주소. */
  audioSrc: string | null;
  /** 대본에서 뽑아낸 해설 구간. 시각 정보가 없으면 빈 배열. */
  cues: Cue[];
  loading: boolean;
  error: ErrorKey | null;
}

/**
 * 영상 하나의 생성 결과를 읽는다.
 *
 * 완료 화면과 재생 화면이 같은 자료를 보므로 한자리에 모았다. 대본에 시각이
 * 붙어 있으면 구간 목록까지 함께 만들어 준다.
 */
export function useResult(videoId: number): LoadedResult {
  const [result, setResult] = useState<ResultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ErrorKey | null>(null);

  useEffect(() => {
    if (!Number.isFinite(videoId)) {
      setLoading(false);
      setError('notfound');
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    void (async () => {
      try {
        const data = await fetchResult(videoId, controller.signal);
        setResult(data);
        setError(null);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(toErrorKey(cause, 'notfound'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [videoId]);

  return useMemo<LoadedResult>(
    () => ({
      result,
      videoSrc: mediaUrl(result?.mergedVideoPath),
      audioSrc: mediaUrl(result?.narrationAudioPath),
      cues: parseCues(result?.scriptText),
      loading,
      error,
    }),
    [result, loading, error],
  );
}
