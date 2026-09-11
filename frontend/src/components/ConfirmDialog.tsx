import { Modal } from './Modal';

interface ConfirmDialogProps {
  label: string;
  title: string;
  /** 무엇이 사라지는지 먼저 말한다. 되돌릴 수 없는 동작일수록 분명하게. */
  text: string;
  confirmLabel: string;
  dismissLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}

/**
 * 되돌릴 수 없는 동작을 한 번 더 묻는 대화상자.
 *
 * 계속하는 쪽을 아래에 두어 실수로 취소를 누르기 어렵게 했다.
 */
export function ConfirmDialog({
  label,
  title,
  text,
  confirmLabel,
  dismissLabel,
  onConfirm,
  onDismiss,
}: ConfirmDialogProps) {
  return (
    <Modal label={label} onDismiss={onDismiss}>
      <div className="st-dialog__title">{title}</div>
      <div className="st-dialog__text">{text}</div>
      <button type="button" onClick={onConfirm} className="st-btn st-btn--primary">
        {confirmLabel}
      </button>
      <button type="button" onClick={onDismiss} className="st-btn st-btn--ghost">
        {dismissLabel}
      </button>
    </Modal>
  );
}
