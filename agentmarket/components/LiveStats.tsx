'use client';

import { useEffect, useState } from 'react';

interface LiveStatsProps {
  initial?: {
    jobs_total: number;
    jobs_open: number;
    jobs_claimed: number;
    jobs_completed: number;
    sats_moved: number;
    fees_collected: number;
  };
  apiUrl?: string;
  pollMs?: number;
  variant?: 'hero' | 'compact';
  className?: string;
}

interface StatsData {
  jobs_total: number;
  jobs_open: number;
  jobs_claimed: number;
  jobs_completed: number;
  sats_moved: number;
  fees_collected: number;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function LiveStats({  initial,
  apiUrl = '/api/stats',
  pollMs = 3000,
  variant = 'compact',
  className = '',
}: LiveStatsProps) {
  const [stats, setStats] = useState<StatsData | null>(initial || null);
  const [isLoading, setIsLoading] = useState(!initial);
  const [error, setError] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  // Fetch stats from API
  const fetchStats = async () => {
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      
      // Check which values changed to highlight them
      if (stats) {
        Object.entries(data).forEach(([key, value]) => {
          if (value !== stats[key as keyof StatsData]) {
            setHighlightedKey(key);
            setTimeout(() => setHighlightedKey(null), 600);
          }
        });
      }
      
      setStats(data);
      setError(false);
      setIsLoading(false);
    } catch (err) {
      setError(true);
      // Keep showing last-known values
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!initial) {
      fetchStats();
    }
  }, []);

  // Set up polling interval
  useEffect(() => {
    const interval = setInterval(fetchStats, pollMs);
    return () => clearInterval(interval);
  }, [pollMs, stats]);

  if (!stats && isLoading) {
    return variant === 'hero' ? <HeroVariantLoading /> : <CompactVariantLoading />;
  }

  if (!stats) {
    return null;
  }

  return variant === 'hero' ? (
    <HeroVariant stats={stats} highlightedKey={highlightedKey} error={error} />
  ) : (
    <CompactVariant stats={stats} highlightedKey={highlightedKey} error={error} className={className} />
  );
}

// Hero variant - inline pill row for landing page
function HeroVariant({
  stats,
  highlightedKey,
  error,
}: {
  stats: StatsData;
  highlightedKey: string | null;
  error: boolean;
}) {
  const pills = [
    { key: 'jobs_total', label: 'jobs', value: stats.jobs_total },
    { key: 'sats_moved', label: 'sats moved', value: stats.sats_moved },
    { key: 'jobs_completed', label: 'completed', value: stats.jobs_completed },
    { key: 'jobs_open', label: 'active', value: stats.jobs_open },
  ];

  return (
    <div className="flex flex-wrap gap-3 relative">
      {pills.map((pill) => (
        <div
          key={pill.key}
          className={`
            bg-white/5 border border-white/10 rounded-full px-4 py-2
            transition-all duration-600
            ${
              highlightedKey === pill.key
                ? 'bg-[#F59E0B]/20'
                : 'bg-white/5'
            }
          `}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-[#F59E0B]">
              {formatNumber(pill.value)}
            </span>
            <span className="text-xs text-[#94A3B8]">{pill.label}</span>
          </div>
        </div>
      ))}
      
      {error && (
        <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-red-500 opacity-75" />
      )}

      <style>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Compact variant - grid layout for marketplace top bar
function CompactVariant({
  stats,
  highlightedKey,
  error,
  className,
}: {
  stats: StatsData;
  highlightedKey: string | null;
  error: boolean;
  className?: string;
}) {
  const cards = [
    { key: 'jobs_open', label: 'Open', value: stats.jobs_open },
    { key: 'jobs_claimed', label: 'Claimed', value: stats.jobs_claimed },
    { key: 'jobs_completed', label: 'Completed', value: stats.jobs_completed },
    { key: 'sats_moved', label: 'Sats Moved', value: stats.sats_moved },
  ];

  return (
    <div
      className={`
        grid grid-cols-2 lg:grid-cols-4 gap-3 relative
        ${className}
      `}
    >
      {cards.map((card) => (
        <div
          key={card.key}
          className={`
            bg-[#1E293B] rounded-lg border border-[#334155] p-3
            transition-all duration-600
            ${
              highlightedKey === card.key
                ? 'bg-[#F59E0B]/20 border-[#F59E0B]/30'
                : 'bg-[#1E293B]'
            }
          `}
        >
          <div className="text-xs uppercase tracking-wider text-[#94A3B8] mb-2">
            {card.label}
          </div>
          <div className="font-mono text-xl lg:text-2xl font-semibold text-[#F59E0B]">
            {formatNumber(card.value)}
          </div>
        </div>
      ))}

      {error && (
        <div
          className="absolute bottom-2 right-2 w-2 h-2 rounded-full bg-red-500 opacity-75"
          title="Stats unavailable, retrying"
        />
      )}

      <style>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// Loading state - Hero variant
function HeroVariantLoading() {
  const pills = [
    { label: 'jobs' },
    { label: 'sats moved' },
    { label: 'completed' },
    { label: 'active' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {pills.map((pill, idx) => (
        <div
          key={idx}
          className="bg-white/5 border border-white/10 rounded-full px-4 py-2 animate-pulse"
        >
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold text-[#F59E0B]">—</span>
            <span className="text-xs text-[#94A3B8]">{pill.label}</span>
          </div>
        </div>
      ))}

      <style>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        .animate-pulse {
          animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}

// Loading state - Compact variant
function CompactVariantLoading({ className = '' }: { className?: string }) {
  const cards = [
    { label: 'Open' },
    { label: 'Claimed' },
    { label: 'Completed' },
    { label: 'Sats Moved' },
  ];

  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${className}`}>
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="bg-[#1E293B] rounded-lg border border-[#334155] p-3 animate-pulse"
        >
          <div className="text-xs uppercase tracking-wider text-[#94A3B8] mb-2">
            {card.label}
          </div>
          <div className="font-mono text-xl lg:text-2xl font-semibold text-[#F59E0B]">—</div>
        </div>
      ))}

      <style>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        
        .animate-pulse {
          animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
}
