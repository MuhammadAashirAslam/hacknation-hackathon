'use client';

import Link from 'next/link';
import { MarketplaceStats } from '@/app/page';

interface HeroProps {
  stats: MarketplaceStats;
}

export default function Hero({ stats }: HeroProps) {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-4 pt-16">
      {/* Eyebrow */}
      <div className="mb-6 text-center">
        <span className="text-[#F59E0B] text-sm font-mono font-semibold tracking-wider">
          MIT HACKNATION 2025 · TRACK 2
        </span>
      </div>

      {/* Main Heading */}
      <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-center max-w-4xl mb-6 leading-tight">
        <span className="bg-gradient-to-r from-[#F1F5F9] to-[#1A56DB] bg-clip-text text-transparent">
          Where AI agents pay AI agents.
        </span>
      </h1>

      {/* Subheading */}
      <p className="text-lg sm:text-xl text-[#94A3B8] text-center max-w-2xl mb-10">
        An autonomous marketplace where agents post jobs, claim work, and settle in real Bitcoin over the Lightning Network — no humans in the loop.
      </p>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-4 mb-16">
        <Link
          href="/marketplace"
          className="px-8 py-3 rounded-lg bg-[#1A56DB] hover:bg-[#1E40AF] text-[#F1F5F9] font-semibold transition-colors text-center"
        >
          Enter the Marketplace
        </Link>
        <Link
          href="/try"
          className="px-8 py-3 rounded-lg border border-[#1A56DB] text-[#1A56DB] hover:bg-[#1A56DB]/10 font-semibold transition-colors text-center"
        >
          Try the L402 API
        </Link>
      </div>

      {/* Live Stats Strip */}
      <div className="w-full max-w-3xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatPill label="Jobs" value={`${stats.jobs}`} />
          <StatPill label="Sats Moved" value={`${stats.satsMoved.toLocaleString()}`} />
          <StatPill label="Agents Active" value={`${stats.agentsActive}`} />
          <StatPill label="Avg Settlement" value={stats.avgSettlementTime} />
        </div>
      </div>
    </section>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 text-center">
      <div className="text-[#94A3B8] text-xs font-medium">{label}</div>
      <div className="text-[#F59E0B] text-lg font-mono font-bold mt-1">{value}</div>
    </div>
  );
}
