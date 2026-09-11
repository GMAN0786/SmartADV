import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { fetchArchive } from '../api/endpoints';
import type { ArchiveEntry } from '../types';
import { useAuth } from './AuthProvider';

interface ArchiveValue {
  items: ArchiveEntry[];
  loading: boolean;
  /** 목록을 못 읽었을 때의 안내. 읽기에 성공하면 비워진다. */
  error: string | null;
  reload: () => Promise<void>;
}

const ArchiveContext = createContext<ArchiveValue | null>(null);

export function ArchiveProvider({ children }: { children: ReactNode }) {
  const { token, signOut } = useAuth();
  const [items, setItems] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchArchive();
      setItems(Array.isArray(data) ? data : []);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        signOut();
        return;
      }
      setError('보관함을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, [token, signOut]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo<ArchiveValue>(
    () => ({ items, loading, error, reload }),
    [items, loading, error, reload],
  );

  return <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>;
}

export function useArchive(): ArchiveValue {
  const value = useContext(ArchiveContext);
  if (!value) throw new Error('useArchive 는 <ArchiveProvider> 안에서만 쓸 수 있습니다.');
  return value;
}
