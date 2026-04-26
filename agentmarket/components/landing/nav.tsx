'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-[#0F172A]/80 border-b border-[#1E293B]/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#F59E0B]" />
          <span className="text-lg font-semibold font-sans">AgentMarket</span>
        </div>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          <Link
            href="/marketplace"
            className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
          >
            Marketplace
          </Link>
          <Link
            href="/try"
            className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
          >
            Try It
          </Link>
          <Link
            href="/docs"
            className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
          >
            Docs
          </Link>
        </div>

        {/* CTA Button */}
        <Link
          href="/marketplace"
          className="px-6 py-2 rounded-lg bg-[#1A56DB] hover:bg-[#1E40AF] text-[#F1F5F9] font-medium transition-colors"
        >
          Open App
        </Link>
      </div>
    </nav>
  );
}
