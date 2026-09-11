import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DETAIL_OPTIONS,
  RATE_OPTIONS,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  STORAGE_KEYS,
  VOICE_OPTIONS,
  VOLUME_OPTIONS,
} from '../constants';
import type { NarrationSettings, ThemeKey } from '../types';
import { clamp, cycle, round1 } from '../utils/format';

export interface Settings {
  theme: ThemeKey;
  /** 글자·간격 배율. 1 = 100%, 2 = 200%. */
  scale: number;
  reduceMotion: boolean;
  haptic: boolean;
  /** 재생할 때 해설 음성을 함께 들려줄지. */
  audioDescription: boolean;
  narration: NarrationSettings;
}

const DEFAULTS: Settings = {
  theme: 'system',
  scale: 1,
  reduceMotion: false,
  haptic: true,
  audioDescription: true,
  narration: { voice: '여성 1', volume: '보통', rate: '1.0배', detail: '기본' },
};

export const NARRATION_OPTIONS: Record<keyof NarrationSettings, string[]> = {
  voice: VOICE_OPTIONS,
  volume: VOLUME_OPTIONS,
  rate: RATE_OPTIONS,
  detail: DETAIL_OPTIONS,
};

export const NARRATION_LABELS: Record<keyof NarrationSettings, string> = {
  voice: '해설 음성',
  volume: '해설 음량',
  rate: '해설 속도',
  detail: '해설 상세도',
};

interface SettingsValue extends Settings {
  /** `system` 을 OS 설정에 따라 dark/light 로 푼 값. 화면에 실제로 걸리는 테마. */
  resolvedTheme: Exclude<ThemeKey, 'system'>;
  setTheme: (theme: ThemeKey) => void;
  toggleHighContrast: () => void;
  toggleReduceMotion: () => void;
  toggleHaptic: () => void;
  toggleAudioDescription: () => void;
  scaleUp: () => void;
  scaleDown: () => void;
  cycleNarration: (key: keyof NarrationSettings) => string;
}

const SettingsContext = createContext<SettingsValue | null>(null);

function readStored(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...parsed,
      scale: clamp(Number(parsed.scale) || DEFAULTS.scale, SCALE_MIN, SCALE_MAX),
      narration: { ...DEFAULTS.narration, ...(parsed.narration ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(readStored);
  const [prefersDark, setPrefersDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false,
  );

  // 설정은 기기에 남는다. 앱을 다시 열어도 글자 크기를 다시 맞출 필요가 없다.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      /* 저장이 막혀 있어도 이번 세션 동안은 그대로 쓴다. */
    }
  }, [settings]);

  // `시스템 설정 따르기` 를 고른 사용자는 OS 를 바꾸면 앱도 함께 바뀌어야 한다.
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const patch = useCallback((next: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...next }));
  }, []);

  const value = useMemo<SettingsValue>(() => {
    const resolvedTheme: Exclude<ThemeKey, 'system'> =
      settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;

    return {
      ...settings,
      resolvedTheme,
      setTheme: (theme) => patch({ theme }),
      // 고대비 스위치와 테마 라디오는 같은 값을 다룬다. 끄면 시스템 설정으로 돌아간다.
      toggleHighContrast: () => patch({ theme: settings.theme === 'hc' ? 'system' : 'hc' }),
      toggleReduceMotion: () => patch({ reduceMotion: !settings.reduceMotion }),
      toggleHaptic: () => patch({ haptic: !settings.haptic }),
      toggleAudioDescription: () => patch({ audioDescription: !settings.audioDescription }),
      scaleUp: () => patch({ scale: Math.min(SCALE_MAX, round1(settings.scale + SCALE_STEP)) }),
      scaleDown: () => patch({ scale: Math.max(SCALE_MIN, round1(settings.scale - SCALE_STEP)) }),
      cycleNarration: (key) => {
        const next = cycle(NARRATION_OPTIONS[key], settings.narration[key]);
        patch({ narration: { ...settings.narration, [key]: next } });
        return next;
      },
    };
  }, [settings, prefersDark, patch]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings 는 <SettingsProvider> 안에서만 쓸 수 있습니다.');
  return value;
}

/**
 * 진동 피드백.
 *
 * 설정이 켜져 있고 기기가 지원할 때만 울린다. 소리·문구를 대신하지 않고
 * 곁들이는 신호라, 지원하지 않아도 알려야 할 정보가 사라지지 않는다.
 */
export function useHaptic(): (pattern?: number | number[]) => void {
  const { haptic } = useSettings();
  return useCallback(
    (pattern = 12) => {
      if (!haptic) return;
      try {
        navigator.vibrate?.(pattern);
      } catch {
        /* 지원하지 않는 기기에서는 조용히 넘어간다. */
      }
    },
    [haptic],
  );
}
