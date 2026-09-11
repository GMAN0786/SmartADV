import { useState } from 'react';

type ThumbnailVariant = 'default' | 'wide' | 'cover' | 'stage';

const CLASS: Record<ThumbnailVariant, string> = {
  default: 'st-thumb',
  wide: 'st-thumb st-thumb--wide',
  cover: 'st-thumb st-thumb--cover',
  stage: 'st-thumb st-thumb--stage',
};

interface ThumbnailProps {
  variant?: ThumbnailVariant;
  /** 자리표시자 안에 보일 글자. 비우면 무늬만 남는다. */
  caption?: string;
  /** 실제 미리보기 이미지. 없거나 못 읽으면 자리표시자로 돌아간다. */
  src?: string | null;
}

/**
 * 영상 미리보기.
 *
 * 이미지가 있으면 그것을, 없으면 자리표시자를 보여준다. 어느 쪽이든 정보를
 * 담지 않으므로 스크린 리더에는 노출하지 않는다 — 제목과 길이는 옆의 글자가 말한다.
 */
export function Thumbnail({ variant = 'default', caption, src }: ThumbnailProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span aria-hidden="true" className={CLASS[variant]}>
      {showImage ? (
        <img
          src={src as string}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
        />
      ) : (
        caption
      )}
    </span>
  );
}
