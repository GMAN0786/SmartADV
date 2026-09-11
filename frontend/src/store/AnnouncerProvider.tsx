import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface AnnouncerValue {
  /**
   * 스크린 리더가 읽을 문장을 남긴다.
   *
   * 시안에서는 검토 패널의 로그였지만, 실제 앱에서는 화면 밖 live 영역이
   * 그 자리를 대신한다. 눈으로만 알 수 있는 정보를 남기지 않기 위한 장치라
   * 상태가 바뀌는 곳마다 함께 부른다.
   */
  say: (text: string, urgent?: boolean) => void;
}

const AnnouncerContext = createContext<AnnouncerValue | null>(null);

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const lastRef = useRef('');

  const say = useCallback((text: string, urgent = false) => {
    const message = text.trim();
    if (!message) return;

    // 같은 문장을 이어서 넣으면 읽지 않는 리더가 있어 보이지 않는 표식을 번갈아 붙인다.
    const stamped = message === lastRef.current ? `${message}\u200B` : message;
    lastRef.current = stamped;

    if (urgent) setAssertive(stamped);
    else setPolite(stamped);
  }, []);

  const value = useMemo<AnnouncerValue>(() => ({ say }), [say]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="st-sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="st-sr-only">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerValue {
  const value = useContext(AnnouncerContext);
  if (!value) throw new Error('useAnnouncer 는 <AnnouncerProvider> 안에서만 쓸 수 있습니다.');
  return value;
}
