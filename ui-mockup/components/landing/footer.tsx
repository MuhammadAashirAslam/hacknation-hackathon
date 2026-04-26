'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#0F172A] border-t border-[#1E293B]/50 py-12 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        {/* Left: Credits */}
        <div className="text-[#94A3B8] text-sm text-center sm:text-left">
          Built with Lightning, MoneyDevKit, Anthropic Claude.
        </div>

        {/* Right: Links + Copyright */}
        <div className="flex items-center gap-6">
          <Link
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#94A3B8] hover:text-[#F1F5F9] transition-colors"
          >
            <Github className="w-5 h-5" />
          </Link>
          <span className="text-[#94A3B8] text-sm">© 2025 AgentMarket</span>
        </div>
      </div>
    </footer>
  );
}
