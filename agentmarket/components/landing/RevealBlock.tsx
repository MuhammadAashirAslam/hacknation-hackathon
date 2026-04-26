'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';

type RevealVariant = 'slide' | 'tilt' | 'clip';

interface RevealBlockProps {
  children: ReactNode;
  variant?: RevealVariant;
  delayMs?: number;
  className?: string;
}

export default function RevealBlock({
  children,
  variant = 'slide',
  delayMs = 0,
  className = '',
}: RevealBlockProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = ref.current;
    if (!current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(current);
    return () => observer.disconnect();
  }, []);

  const variantClass =
    variant === 'tilt'
      ? 'reveal-tilt'
      : variant === 'clip'
        ? 'reveal-clip'
        : 'reveal-slide';

  return (
    <div
      ref={ref}
      className={`${className} reveal ${visible ? variantClass : ''}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
