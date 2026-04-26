import { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

export function SparkGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z" fill="currentColor" />
    </svg>
  );
}

export function PaperPlaneGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M2.2 11.3L20.8 3.1C21.5 2.8 22.2 3.5 21.9 4.2L13.7 22.8C13.4 23.5 12.4 23.4 12.2 22.6L10.3 14.9L2.4 13C1.6 12.8 1.5 11.6 2.2 11.3Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 14L14 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CoinCheckGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="10" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 12.2L9.3 14.1L12.7 10.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.8 6.4C15.4 5.5 16.5 5 17.6 5C19.5 5 21 6.5 21 8.4C21 10.3 19.5 11.8 17.6 11.8C17.2 11.8 16.8 11.7 16.4 11.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ClockGlyph(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 7.5V12L15.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
