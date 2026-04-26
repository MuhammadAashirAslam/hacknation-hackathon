'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function BookLoader() {
  const pathname = usePathname();

  // Remove the loading overlay once the new route is committed.
  // 8s safety fallback prevents a stuck loader if pathname never changes
  // (e.g. user clicked a link to the current page).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (!body.classList.contains('book-loading')) return;
    const remove = () => body.classList.remove('book-loading');
    const raf = requestAnimationFrame(remove);
    const fallback = window.setTimeout(remove, 8000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [pathname]);

  return (
    <div className="book-loader-root" aria-hidden>
      <div className="book-loader" role="status" aria-label="Loading">
        <div className="book-cover" />
        <div className="book-spine" />
        <div className="book-page book-page-3" />
        <div className="book-page book-page-2" />
        <div className="book-page" />
        <div className="book-loader-text">Loading</div>
      </div>
    </div>
  );
}
