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
  summarize: 'bg-[#1e3a8a] text-[#1A56DB]',
  classify: 'bg-[#5b21b6] text-[#a78bfa]',
  translate: 'bg-[#92400e] text-[#F59E0B]',
  qa: 'bg-[#065f46] text-[#10B981]',
};

const statusColors = {
  open: 'bg-[#1e3a8a] text-[#1A56DB]',
  claimed: 'bg-[#92400e] text-[#F59E0B]',
  completed: 'bg-[#065f46] text-[#10B981]',
  expired: 'bg-[#7f1d1d] text-[#EF4444]',
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
      className={`rounded-xl border border-[#334155] bg-[#1E293B] p-5 hover:border-[#475569] transition-all duration-200 ${
        highlighted
          ? 'ring-2 ring-[#1A56DB] ring-offset-2 ring-offset-[#0F172A]'
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

      {/* Title */}
      <h3 className="text-lg font-semibold text-[#F1F5F9] line-clamp-2 mt-3">
        {job.title}
      </h3>

      {/* Input preview */}
      <p className="text-sm text-[#94A3B8] font-mono truncate mt-2">
        {inputPreview}
      </p>

      {/* Divider */}
      <div className="border-t border-[#334155] my-4" />

      {/* Reward block */}
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-2xl font-bold text-[#F59E0B] font-mono">
          {job.reward_sats}
        </span>
        <span className="text-sm text-[#F59E0B] font-mono">sats</span>
        <span className="text-xs text-[#94A3B8] font-mono">
          + {job.fee_sats} fee
        </span>
      </div>

      {/* Meta row: requester + time */}
      <div className="flex justify-between items-center text-xs text-[#94A3B8] mb-3">
        <span>by {truncatedRequesterId}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {relativeTime}
        </div>
      </div>

      {/* Status-specific meta lines */}
      {job.status === 'claimed' && (
        <div className="text-xs text-[#F59E0B] mb-3 flex items-center gap-2">
          <span>Claimed by {truncatedWorkerId}, working…</span>
          <Loader2 className="w-3 h-3 animate-spin" />
        </div>
      )}

      {job.status === 'completed' && job.claimed_at && job.completed_at && (
        <div className="text-xs text-[#10B981] mb-3">
          Completed in {getDuration()} · {truncatedWorkerId}
        </div>
      )}

      {job.status === 'expired' && (
        <div className="text-xs text-[#94A3B8] mb-3">
          Expired without a worker.
        </div>
      )}

      {/* Action button */}
      {job.status === 'open' && (
        <button
          onClick={() => onClaim?.(job.id)}
          className="w-full rounded-lg bg-[#1A56DB] text-[#F1F5F9] font-semibold text-sm py-2 hover:bg-[#1e40af] transition-colors"
        >
          {claimButtonText}
        </button>
      )}

      {job.status === 'completed' && (
        <button
          onClick={() => onViewResult?.(job.id)}
          className="w-full rounded-lg bg-[#334155] text-[#F1F5F9] font-semibold text-sm py-2 hover:bg-[#475569] transition-colors"
        >
          View Result →
        </button>
      )}
    </div>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-xl border border-[#334155] bg-[#1E293B] p-5 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="h-6 w-20 rounded-full bg-[#334155]" />
        <div className="h-6 w-16 rounded-full bg-[#334155]" />
      </div>
      <div className="h-6 w-3/4 rounded bg-[#334155] mt-3 mb-2" />
      <div className="h-4 w-full rounded bg-[#334155] mb-4" />
      <div className="border-t border-[#334155] my-4" />
      <div className="h-8 w-1/3 rounded bg-[#334155] mb-4" />
      <div className="flex justify-between items-center mb-3">
        <div className="h-4 w-1/4 rounded bg-[#334155]" />
        <div className="h-4 w-1/4 rounded bg-[#334155]" />
      </div>
      <div className="h-10 w-full rounded-lg bg-[#334155]" />
    </div>
  );
}
