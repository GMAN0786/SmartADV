import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  label: string;
  /** Esc 를 누르거나 바깥을 눌렀을 때. 되돌릴 수 없는 확인창에서는 넘기지 않는다. */
  onDismiss?: () => void;
  /** 아래에서 올라오는 시트 형태. 기본은 가운데 대화상자. */
  sheet?: boolean;
  children: ReactNode;
}

/**
 * 겹쳐 뜨는 레이어의 공통 뼈대.
 *
 * 열리면 안쪽 첫 요소로 초점을 옮기고, Tab 이 밖으로 새지 않게 가둔 뒤,
 * 닫힐 때 원래 있던 자리로 초점을 돌려준다. 스크린 리더·키보드·스위치
 * 사용자가 "지금 여기에 있다"를 잃지 않게 하는 최소 조건이다.
 */
export function Modal({ label, onDismiss, sheet, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    return () => returnFocusRef.current?.focus();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && onDismiss) {
      event.stopPropagation();
      onDismiss();
      return;
    }

    if (event.key !== 'Tab') return;

    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={sheet ? 'st-overlay st-overlay--sheet' : 'st-overlay'}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={sheet ? 'st-sheet' : 'st-dialog'}
      >
        {children}
      </div>
    </div>
  );
}
