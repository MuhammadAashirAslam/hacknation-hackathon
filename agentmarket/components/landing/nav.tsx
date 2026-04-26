'use client';

import Link from 'next/link';
import NewspaperLink from '@/components/NewspaperLink';

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#f1e3cb]/70 border-b border-[#b39a78]/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="AgentMarket logo" className="h-14 w-14" />
          <span className="text-lg font-semibold font-sans text-[#2a1c12]">AgentMarket</span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/marketplace" className="text-[#6e5e54] hover:text-[#2a1c12] transition-colors">
            Marketplace
          </Link>
          <Link href="/try" className="text-[#6e5e54] hover:text-[#2a1c12] transition-colors">
            Try It
          </Link>
          <Link href="/docs" className="text-[#6e5e54] hover:text-[#2a1c12] transition-colors">
            Docs
          </Link>
        </div>

        <NewspaperLink
          href="/marketplace"
          className="px-6 py-2 rounded-lg bg-[#2a1c12] hover:bg-[#1a0e06] text-[#fffbf3] font-semibold transition-colors"
        >
          Open App
        </NewspaperLink>
      </div>
    </nav>
  );
}
