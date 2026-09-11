/**
 * 화면에 쓰이는 선 아이콘.
 *
 * 모두 currentColor 로 그려서 테마가 바뀌어도 대비가 유지된다.
 * 아이콘 자체는 의미를 담지 않으므로 전부 aria-hidden — 뜻은 곁의 글자가 전한다.
 */

interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 24, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 17V4M12 4l-5 5M12 4l5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M14 10a4 4 0 0 0-6-.5l-3 3A4 4 0 0 0 10.7 18l1.6-1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 L22 20 H2 Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <rect x="11" y="9" width="2" height="6" fill="currentColor" />
      <rect x="11" y="16.5" width="2" height="2" fill="currentColor" />
    </Svg>
  );
}

export function ErrorCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5 12.5l4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M15 4 L7 12 l8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 18, className }: IconProps) {
  return (
    <svg
      width={(size * 12) / 18}
      height={size}
      viewBox="0 0 8 14"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RewindIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5L4 10l7 5V5z" fill="currentColor" />
      <path d="M20 5l-7 5 7 5V5z" fill="currentColor" />
    </Svg>
  );
}

export function ForwardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 5l7 5-7 5V5z" fill="currentColor" />
      <path d="M4 5l7 5-7 5V5z" fill="currentColor" />
    </Svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5l12 7.5-12 7.5V4.5z" fill="currentColor" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="4.5" width="4" height="15" fill="currentColor" />
      <rect x="14" y="4.5" width="4" height="15" fill="currentColor" />
    </Svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M12 4v12M12 16l-5-5M12 16l5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="18" cy="5.5" r="2.8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18.5" r="2.8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8.5 10.7l7-3.9M8.5 13.3l7 3.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M6.5 6.5V20a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V6.5M9.5 6.5V4h5v2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
