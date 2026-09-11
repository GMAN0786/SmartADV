import { useId, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { ACCEPTED_VIDEO_LABEL, ACCEPTED_VIDEO_TYPES } from '../constants';
import { UploadIcon } from './icons';

interface UploadActionProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

/**
 * 영상 파일 고르기.
 *
 * 진짜 `<input type="file">` 을 화면 밖에 두고 버튼이 그것을 연다. 끌어놓기는
 * 마우스를 쓸 수 있는 사용자에게 얹는 지름길일 뿐이라, 끌어놓기 없이도
 * 버튼 하나로 같은 일을 끝낼 수 있다.
 */
export function UploadAction({ onFile, disabled }: UploadActionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useId();

  const accept = (file: File | undefined) => {
    if (!file || disabled) return;
    onFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    accept(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className="st-drop"
      data-over={over}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        aria-describedby={hintId}
        aria-label={`영상 파일 업로드, 기기에서 화면해설을 만들 영상을 선택합니다. ${ACCEPTED_VIDEO_LABEL} 형식을 지원합니다`}
        className="st-action st-action--primary"
      >
        <UploadIcon size={34} />
        <span className="st-action__text">
          <span className="st-action__title">영상 파일 업로드</span>
          <span className="st-action__hint" id={hintId}>
            {over ? '여기에 놓으면 올라갑니다.' : `${ACCEPTED_VIDEO_LABEL} · 끌어놓아도 됩니다.`}
          </span>
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_TYPES}
        className="st-sr-only"
        tabIndex={-1}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // 같은 파일을 연달아 고를 수 있게 값을 비운다.
          event.target.value = '';
        }}
      />
    </div>
  );
}
