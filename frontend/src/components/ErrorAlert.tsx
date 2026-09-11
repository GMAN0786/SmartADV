import { ERRORS } from '../constants';
import type { ErrorKey } from '../types';
import { ErrorCircleIcon, WarningIcon } from './icons';

interface ErrorAlertProps {
  error: ErrorKey;
  /** 서버가 더 구체적으로 알려준 문장. 있으면 기본 안내 대신 보여준다. */
  detail?: string | null;
  /** 다시 해볼 수 있을 때만 준다. 버튼 문구는 무엇을 다시 하는지 말한다. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * 화면 흐름을 끊지 않고 얹히는 오류 안내.
 *
 * 무엇이 잘못됐는지와 다음에 무엇을 하면 되는지를 항상 함께 적는다.
 * `role="alert"` 이라 뜨는 순간 스크린 리더가 읽는다.
 */
export function ErrorAlert({ error, detail, onRetry, retryLabel = '다시 시도' }: ErrorAlertProps) {
  const [title, howTo] = ERRORS[error];
  const Icon = error === 'network' || error === 'auth' ? ErrorCircleIcon : WarningIcon;

  return (
    <div role="alert" className="st-alert">
      <Icon size={28} className="st-alert__icon" />
      <div className="st-alert__body">
        <div className="st-alert__title">{title}</div>
        <div className="st-alert__text">{detail?.trim() || howTo}</div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="st-btn st-btn--muted st-alert__action">
            {retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
