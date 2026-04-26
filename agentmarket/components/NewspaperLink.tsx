'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { MouseEvent, ReactNode } from 'react';

type NewspaperLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
};

export default function NewspaperLink({ href, className, children }: NewspaperLinkProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (href === pathname) return;

    event.preventDefault();
    document.body.classList.add('book-loading');
    router.push(href);
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
