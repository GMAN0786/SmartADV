import { ChevronLeftIcon } from './icons';

interface BackButtonProps {
  onClick: () => void;
  /** 어디로 돌아가는지 함께 읽어준다. 예: `홈으로 돌아갑니다` */
  destination: string;
  /** 화면 하단에 놓는 변형. 가로로 꽉 채우고 가운데 정렬한다. */
  block?: boolean;
}

/** 어느 화면에서든 같은 자리·같은 모양으로 놓이는 뒤로 가기. */
export function BackButton({ onClick, destination, block }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`뒤로, ${destination}`}
      className={block ? 'st-btn st-btn--ghost st-btn--block' : 'st-back'}
    >
      <ChevronLeftIcon size={22} />
      <span>뒤로</span>
    </button>
  );
}
