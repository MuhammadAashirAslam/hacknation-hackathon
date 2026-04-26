'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { JobCard } from '@/components/JobCard';
import { TransactionFeed, type Transaction } from '@/components/TransactionFeed';
import { WalletStatus } from '@/components/WalletStatus';
import { AssessmentList } from '@/components/AssessmentList';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Zap, Plus } from 'lucide-react';
import { JobCardSkeleton } from '@/components/JobCardSkeleton';

interface Job {
  id: string;
  title: string;
  category: 'summarize' | 'classify' | 'translate' | 'qa';
  input: string;
  reward_sats: number;
  fee_sats: number;
  status: 'open' | 'claimed' | 'completed' | 'expired';
  requester_id: string;
  assigned_worker_id: string | null;
  worker_id: string | null;
  result: string | null;
  created_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  expires_at: number;
  parent_job_id: string | null;
  is_decomposed: boolean;
}

interface Stats {
  jobs_total: number;
  jobs_open: number;
  jobs_claimed: number;
  jobs_completed: number;
  sats_moved: number;
  fees_collected: number;
}

const TX_LABELS: Record<Transaction['type'], string> = {
  job_posted: 'Job posted',
  job_claimed: 'Job claimed',
  job_completed: 'Job completed',
};

function showTxToast(tx: Transaction): void {
  const sign = tx.direction === 'in' ? '+' : '−';
  const shortTx = tx.id.slice(0, 8);
  const shortAgent = tx.agent_id.length > 12 ? `${tx.agent_id.slice(0, 12)}…` : tx.agent_id;
  toast.success(TX_LABELS[tx.type], {
    description: `${sign}${tx.sats.toLocaleString()} sats · ${shortAgent} · tx ${shortTx}`,
    duration: 4500,
  });
}

export default function MarketplacePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({
    jobs_total: 0,
    jobs_open: 0,
    jobs_claimed: 0,
    jobs_completed: 0,
    sats_moved: 0,
    fees_collected: 0,
  });
  const [feed, setFeed] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'claimed' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'summarize' | 'classify' | 'translate' | 'qa'>('all');
  const [postingStatus, setPostingStatus] = useState<'idle' | 'requesting' | 'awaiting' | 'success'>('idle');
  const [postedJobId, setPostedJobId] = useState<string | null>(null);
  const [resultJobId, setResultJobId] = useState<string | null>(null);
  // feedIsLive is surfaced by TransactionFeed internally; unused at page level for now

  // Form state
  const [formData, setFormData] = useState<{
    title: string;
    category: Job['category'];
    input: string;
    reward: string;
    requester_id: string;
  }>({
    title: '',
    category: 'summarize',
    input: '',
    reward: '10000',
    requester_id: 'demo-requester-1',
  });

  const reward = parseInt(formData.reward) || 0;
  const fee = Math.ceil(reward * 0.1);
  const totalSats = reward + fee;
  const resultJob = resultJobId ? jobs.find((job) => job.id === resultJobId) ?? null : null;

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && job.category !== categoryFilter) return false;
    return true;
  });

  // Per-parent child progress (computed once over the full job list, not the
  // filtered view, so progress reflects reality even when filters hide kids).
  const childCountsByParent = jobs.reduce<Record<string, { done: number; total: number }>>(
    (acc, j) => {
      if (j.parent_job_id) {
        const slot = acc[j.parent_job_id] ?? { done: 0, total: 0 };
        slot.total += 1;
        if (j.status === 'completed') slot.done += 1;
        acc[j.parent_job_id] = slot;
      }
      return acc;
    },
    {},
  );

  const fetchJobs = useCallback(async () => {
    const res = await fetch('/api/jobs');
    if (!res.ok) {
      throw new Error(`Failed to fetch jobs (${res.status})`);
    }
    const data = (await res.json()) as Job[];
    setJobs(data);
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/stats');
    if (!res.ok) {
      throw new Error(`Failed to fetch stats (${res.status})`);
    }
    const data = (await res.json()) as Stats;
    setStats(data);
  }, []);

  // Initial page data
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        await Promise.all([fetchJobs(), fetchStats()]);
      } catch (err) {
        console.error('Failed to load marketplace data:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [fetchJobs, fetchStats]);

  // Poll stats for top counters
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats().catch((err) => {
        console.error('Failed to fetch stats:', err);
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchStats]);

  // Subscribe to events
  const mountedAtRef = useRef<number>(Date.now());
  useEffect(() => {
    const eventSource = new EventSource('/api/events');
    eventSource.onmessage = (event) => {
      try {
        const newTx = JSON.parse(event.data) as Transaction;
        setFeed((prev) => [newTx, ...prev].slice(0, 20));

        // Toast only live events, not the SSE backlog replayed on connect.
        if (newTx.timestamp > mountedAtRef.current) {
          showTxToast(newTx);
        }
      } catch {
        // Ping comments and malformed payloads are ignored.
      }
      fetchJobs().catch((err) => {
        console.error('Failed to refetch jobs after event:', err);
      });
      fetchStats().catch((err) => {
        console.error('Failed to refetch stats after event:', err);
      });
    };
    eventSource.onerror = () => {
      // TransactionFeed has dedicated reconnect UX; page only needs best-effort refreshes.
    };
    return () => eventSource.close();
  }, [fetchJobs, fetchStats]);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostingStatus('requesting');
    setPostedJobId(null);

    try {
      setPostingStatus('awaiting');
      const response = await fetch('/api/demo/post-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          category: formData.category,
          input: formData.input,
          reward_sats: reward,
          requester_id: formData.requester_id,
        }),
      });
      const body = (await response.json()) as { job?: Job; error?: string };
      if (!response.ok || !body.job) {
        throw new Error(body.error ?? `Failed to post job (${response.status})`);
      }

      setPostedJobId(body.job.id);
      await Promise.all([fetchJobs(), fetchStats()]);
      setPostingStatus('success');

      // Reset form after a delay
      setTimeout(() => {
        setFormData({
          title: '',
          category: 'summarize',
          input: '',
          reward: '10000',
          requester_id: 'demo-requester-1',
        });
        setPostingStatus('idle');
        setPostedJobId(null);
        setIsDialogOpen(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to post job:', err);
      setPostingStatus('idle');
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-[#2a1c12] mb-1">
                Marketplace
              </h1>
              <p className="text-sm text-[#6e5e54]">
                Live agent jobs settling on Lightning
              </p>
            </div>

            <Button
              onClick={() => setIsDialogOpen(true)}
              className="bg-[#2a1c12] hover:bg-[#1a0e06] text-[#fffbf3] gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Post a Job
            </Button>
          </div>

          <WalletStatus />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="market-surface rounded-lg p-3">
              <p className="text-xs text-[#6e5e54] mb-1">Jobs Open</p>
              <p className="text-lg font-mono font-bold text-[#2a1c12]">
                {stats.jobs_open}
              </p>
            </div>
            <div className="market-surface rounded-lg p-3">
              <p className="text-xs text-[#6e5e54] mb-1">Jobs Claimed</p>
              <p className="text-lg font-mono font-bold text-[#2a1c12]">
                {stats.jobs_claimed}
              </p>
            </div>
            <div className="market-surface rounded-lg p-3">
              <p className="text-xs text-[#6e5e54] mb-1">Completed</p>
              <p className="text-lg font-mono font-bold text-[#2a1c12]">
                {stats.jobs_completed}
              </p>
            </div>
            <div className="market-surface rounded-lg p-3">
              <p className="text-xs text-[#6e5e54] mb-1">Sats Moved</p>
              <p className="text-lg font-mono font-bold text-[#2a1c12]">
                {(stats.sats_moved / 1000).toFixed(0)}k
              </p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Status Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            {(['all', 'open', 'claimed', 'completed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? 'bg-[#2a1c12] text-[#fffbf3]'
                    : 'market-surface text-[#2a1c12] hover:border-[#2a1c12]/50'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="w-full sm:w-auto sm:ml-auto">
            <Select
              value={categoryFilter}
              onValueChange={(value) =>
                setCategoryFilter(
                  value as
                    | 'all'
                    | 'summarize'
                    | 'classify'
                    | 'translate'
                    | 'qa'
                )
              }
            >
              <SelectTrigger className="w-full sm:w-[180px] bg-[#fffbf3]/80 border-[#b39a78] text-[#2a1c12]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="summarize">Summarize</SelectItem>
                <SelectItem value="classify">Classify</SelectItem>
                <SelectItem value="translate">Translate</SelectItem>
                <SelectItem value="qa">QA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Jobs Grid */}
          <div>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(6)].map((_, i) => (
                  <JobCardSkeleton key={i} />
                ))}
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">
                  No jobs match these filters.
                </p>
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setCategoryFilter('all');
                  }}
                  className="text-[#2a1c12] hover:underline text-sm font-medium"
                >
                  Clear filters
                </button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-[#6e5e54] mb-4">
                  The marketplace is quiet. Post the first job →
                </p>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-[#2a1c12] hover:bg-[#1a0e06] text-[#fffbf3] gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Post a Job
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map((job) => {
                  const counts = childCountsByParent[job.id];
                  return (
                    <JobCard
                      key={job.id}
                      job={job}
                      onViewResult={(jobId) => setResultJobId(jobId)}
                      childrenCompleted={counts?.done}
                      childrenTotal={counts?.total}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Transaction Feed Sidebar */}
          <div className="lg:sticky lg:top-6 h-fit">
            <div className="market-surface rounded-lg p-4">
              <TransactionFeed
                initial={feed}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Post a Job Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto bg-[#fffbf3] border-[#b39a78]">
          <DialogHeader>
            <DialogTitle className="text-[#2a1c12]">Post a Job</DialogTitle>
            <DialogDescription className="text-[#6e5e54]">
              Post a task for agents to claim and complete
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePostJob} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title" className="text-[#2a1c12]">Title</Label>
              <Input
                id="title"
                placeholder="e.g., Summarize this article"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                required
                className="bg-[#fffbf3] border-[#b39a78] text-[#2a1c12]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category" className="text-[#2a1c12]">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    category: value as
                      | 'summarize'
                      | 'classify'
                      | 'translate'
                      | 'qa',
                  }))
                }
              >
                <SelectTrigger className="bg-[#fffbf3] border-[#b39a78] text-[#2a1c12]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summarize">Summarize</SelectItem>
                  <SelectItem value="classify">Classify</SelectItem>
                  <SelectItem value="translate">Translate</SelectItem>
                  <SelectItem value="qa">QA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="input" className="text-[#2a1c12]">Input</Label>
              <Textarea
                id="input"
                placeholder="URL to summarize, text to classify, etc."
                value={formData.input}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, input: e.target.value }))
                }
                required
                className="min-h-24 max-h-56 overflow-y-auto [field-sizing:fixed] bg-[#fffbf3] border-[#b39a78] text-[#2a1c12] font-mono text-xs"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reward" className="text-[#2a1c12]">Reward (sats)</Label>
              <Input
                id="reward"
                type="number"
                min="1"
                value={formData.reward}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reward: e.target.value }))
                }
                className="bg-[#fffbf3] border-[#b39a78] text-[#2a1c12] font-mono"
              />
              <p className="text-xs text-[#6e5e54]">
                Marketplace adds 10% fee on top.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requester" className="text-[#2a1c12]">Requester ID</Label>
              <Input
                id="requester"
                value={formData.requester_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    requester_id: e.target.value,
                  }))
                }
                className="bg-[#fffbf3] border-[#b39a78] text-[#2a1c12] font-mono text-xs"
              />
            </div>

            {postingStatus !== 'idle' && (
              <div className="p-3 bg-[#f1e3cb] border border-[#b39a78] rounded text-sm text-[#2a1c12]">
                {postingStatus === 'requesting' && <p>Requesting invoice...</p>}
                {postingStatus === 'awaiting' && <p>Awaiting payment...</p>}
                {postingStatus === 'success' && (
                  <div>
                    <p className="text-[#2a1c12] font-semibold mb-1">Job posted ✓</p>
                    <p className="text-xs text-[#6e5e54]">
                      {postedJobId ? `Job ID: ${postedJobId}` : 'Check the marketplace for your new job.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            <Button
              type="submit"
              disabled={postingStatus !== 'idle'}
              className="w-full bg-[#2a1c12] hover:bg-[#1a0e06] text-[#fffbf3] gap-2"
            >
              <Zap className="w-4 h-4" />
              Post Job {totalSats > 0 && `(${totalSats.toLocaleString()} sats)`}
            </Button>

            <div className="text-xs text-[#6e5e54] space-y-1">
              <p>
                You&apos;ll be charged{' '}
                <span className="font-mono font-semibold text-[#2a1c12]">
                  {reward.toLocaleString()} + {fee.toLocaleString()} sats
                </span>{' '}
                via L402 over Lightning.
              </p>
              <p>The marketplace will return an invoice to pay.</p>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resultJobId !== null} onOpenChange={(open) => !open && setResultJobId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {resultJob?.is_decomposed ? 'Aggregated Result' : 'Job Result'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {resultJob ? `${resultJob.title} (${resultJob.category})` : 'Completed job result'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              {resultJob?.is_decomposed
                ? `Synthesized from ${childCountsByParent[resultJob.id]?.total ?? 0} sub-tasks`
                : resultJob?.worker_id
                  ? `Completed by ${resultJob.worker_id}`
                  : 'Worker unknown'}
            </div>
            <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-background p-3">
              <pre className="whitespace-pre-wrap break-words text-sm text-foreground font-mono">
                {resultJob?.result ?? 'No result available for this job yet.'}
              </pre>
            </div>

            {resultJob?.is_decomposed && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sub-tasks
                </div>
                {jobs
                  .filter((j) => j.parent_job_id === resultJob.id)
                  .sort((a, b) => a.created_at - b.created_at)
                  .map((child) => (
                    <div
                      key={child.id}
                      className="rounded-md border border-border bg-background p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-medium text-foreground">
                          {child.title}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {child.status}
                          {child.worker_id ? ` · ${child.worker_id}` : ''}
                        </div>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-xs text-foreground/90 font-mono max-h-40 overflow-y-auto">
                        {child.result ?? 'No result yet…'}
                      </pre>
                    </div>
                  ))}
              </div>
            )}

            <AssessmentList jobId={resultJobId} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
