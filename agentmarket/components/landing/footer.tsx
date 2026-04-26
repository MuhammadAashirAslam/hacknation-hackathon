'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';
import RevealBlock from '@/components/landing/RevealBlock';

export default function Footer() {
  return (
    <footer className="border-t border-[#b39a78]/60 py-12 px-4">
      <RevealBlock className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6" variant="slide">
        <div className="text-[#6e5e54] text-sm text-center sm:text-left">
          Built with Lightning, MoneyDevKit, Anthropic Claude.
        </div>

        <div className="flex items-center gap-6">
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6e5e54] hover:text-[#2a1c12] transition-colors"
          >
            <Github className="w-5 h-5" />
          </Link>
          <span className="text-[#6e5e54] text-sm">© 2025 AgentMarket</span>
        </div>
      </RevealBlock>
    </footer>
  );
}
