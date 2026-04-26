'use client';

import { useState, useEffect } from 'react';
import { Clock, Loader2 } from 'lucide-react';

interface Job {
  id: string;
  title: string;
  category: 'summarize' | 'classify' | 'translate' | 'qa';
  input: string;
  reward_sats: number;
  fee_sats: number;
  status: 'open' | 'claimed' | 'completed' | 'expired';
  requester_id: string;
  worker_id: string | null;
  result: string | null;
  created_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  expires_at: number;
}

interface JobCardProps {
  job: Job;
  onClaim?: (jobId: string) => void;
  onViewResult?: (jobId: string) => void;
  highlighted?: boolean;
}

const categoryColors = {
  summarize: 'bg-[#ece0c5] text-[#2a1c12]',
  classify: 'bg-[#d9c6a4] text-[#2a1c12]',
  translate: 'bg-[#b39a78] text-[#fffbf3]',
  qa: 'bg-[#f1e3cb] text-[#6e5e54]',
};

const statusColors = {
  open: 'bg-[#2a1c12] text-[#fffbf3]',
  claimed: 'bg-[#b39a78] text-[#2a1c12]',
  completed: 'bg-[#6e8e6a] text-[#fffbf3]',
  expired: 'bg-[#b94a3a] text-[#fffbf3]',
};

function useRelativeTime(timestamp: number) {
  const [relativeTime, setRelativeTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = Date.now();
      const diff = now - timestamp;
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) {
        setRelativeTime(`${days}d ago`);
      } else if (hours > 0) {
        setRelativeTime(`${hours}h ago`);
      } else if (minutes > 0) {
        setRelativeTime(`${minutes}m ago`);
      } else {
        setRelativeTime('just now');
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return relativeTime;
}

export function JobCard({
  job,
  onClaim,
  onViewResult,
  highlighted,
}: JobCardProps) {
  const relativeTime = useRelativeTime(job.created_at);
  const truncatedRequesterId = job.requester_id.length > 12 
    ? `${job.requester_id.slice(0, 12)}…` 
    : job.requester_id;
  const truncatedWorkerId = job.worker_id && job.worker_id.length > 12
    ? `${job.worker_id.slice(0, 12)}…`
    : job.worker_id;

  const inputPreview = job.input.length > 80
    ? `${job.input.slice(0, 80)}…`
    : job.input;

  const claimFee = 2;
  const claimButtonText = `Claim Job (${claimFee} sats)`;

  const getDuration = () => {
    if (!job.claimed_at || !job.completed_at) return null;
    const duration = Math.floor((job.completed_at - job.claimed_at) / 1000);
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m`;
    return `${Math.floor(duration / 3600)}h`;
  };

  return (
    <div
      className={`rounded-xl border border-[#b39a78]/60 bg-[#fffbf3]/80 p-5 hover:border-[#2a1c12]/50 transition-all duration-200 backdrop-blur-[2px] ${
        highlighted
          ? 'ring-2 ring-[#2a1c12] ring-offset-2 ring-offset-[#f1e3cb]'
          : ''
      }`}
    >
      {/* Top row: category + status badges */}
      <div className="flex justify-between items-start mb-3">
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${categoryColors[job.category]}`}>
          {job.category}
        </div>
        <div className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[job.status]} ${
          job.status === 'open' ? 'animate-pulse' : ''
        }`}>
          {job.status}
        </div>
      </div>

      <h3 className="text-lg font-semibold text-[#2a1c12] line-clamp-2 mt-3">
        {job.title}
      </h3>

      <p className="text-sm text-[#6e5e54] font-mono truncate mt-2">
        {inputPreview}
      </p>

      <div className="border-t border-[#b39a78]/50 my-4" />

      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-2xl font-bold text-[#2a1c12] font-mono">
          {job.reward_sats}
        </span>
        <span className="text-sm text-[#2a1c12] font-mono">sats</span>
        <span className="text-xs text-[#6e5e54] font-mono">
          + {job.fee_sats} fee
        </span>
      </div>

      <div className="flex justify-between items-center text-xs text-[#6e5e54] mb-3">
        <span>by {truncatedRequesterId}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {relativeTime}
        </div>
      </div>

      {job.status === 'claimed' && (
        <div className="text-xs text-[#8a6a2a] mb-3 flex items-center gap-2">
          <span>Claimed by {truncatedWorkerId}, working…</span>
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      )}

      {job.status === 'completed' && job.claimed_at && job.completed_at && (
        <div className="text-xs text-[#3f6a3a] mb-3">
          Completed in {getDuration()} · {truncatedWorkerId}
        </div>
      )}

      {job.status === 'expired' && (
        <div className="text-xs text-[#6e5e54] mb-3">
          Expired without a worker.
        </div>
      )}

      {job.status === 'open' && (
        <button
          onClick={() => onClaim?.(job.id)}
          className="w-full rounded-lg bg-[#2a1c12] text-[#fffbf3] font-semibold text-sm py-2 hover:bg-[#1a0e06] transition-colors"
        >
          {claimButtonText}
        </button>
      )}

      {job.status === 'completed' && (
        <button
          onClick={() => onViewResult?.(job.id)}
          className="w-full rounded-lg bg-[#b39a78] text-[#2a1c12] font-semibold text-sm py-2 hover:bg-[#a68b69] transition-colors"
        >
          View Result →
        </button>
      )}
    </div>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#b39a78]/50 bg-[#fffbf3]/70 p-5 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="h-6 w-20 rounded-full bg-[#d9c6a4]" />
        <div className="h-6 w-16 rounded-full bg-[#d9c6a4]" />
      </div>
      <div className="h-6 w-3/4 rounded bg-[#d9c6a4] mt-3 mb-2" />
      <div className="h-4 w-full rounded bg-[#d9c6a4] mb-4" />
      <div className="border-t border-[#b39a78]/50 my-4" />
      <div className="h-8 w-1/3 rounded bg-[#d9c6a4] mb-4" />
      <div className="flex justify-between items-center mb-3">
        <div className="h-4 w-1/4 rounded bg-[#d9c6a4]" />
        <div className="h-4 w-1/4 rounded bg-[#d9c6a4]" />
      </div>
      <div className="h-10 w-full rounded-lg bg-[#d9c6a4]" />
    </div>
  );
}
