'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MouseEvent, ReactNode } from 'react';

type NewspaperLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  durationMs?: number;
};

export default function NewspaperLink({
  href,
  className,
  children,
  durationMs = 900,
}: NewspaperLinkProps) {
  const router = useRouter();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    document.body.classList.add('book-loading');
    setTimeout(() => {
      router.push(href);
      setTimeout(() => {
        document.body.classList.remove('book-loading');
      }, 350);
    }, durationMs);
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
