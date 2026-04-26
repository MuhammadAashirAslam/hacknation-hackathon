'use client';

import { useState, useEffect, useCallback } from 'react';
import { JobCard } from '@/components/JobCard';
import { TransactionFeed, type Transaction } from '@/components/TransactionFeed';
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
import { Zap, Plus, Search, Filter } from 'lucide-react';
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
  worker_id: string | null;
  result: string | null;
  created_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  expires_at: number;
}

interface Stats {
  jobs_total: number;
  jobs_open: number;
  jobs_claimed: number;
  jobs_completed: number;
  sats_moved: number;
  fees_collected: number;
}

interface MarketplacePageProps {
  initialJobs?: Job[];
  initialStats?: Stats;
  initialFeed?: Transaction[];
}

export default function MarketplacePage({
  initialJobs = [],
  initialStats = {
    jobs_total: 0,
    jobs_open: 0,
    jobs_claimed: 0,
    jobs_completed: 0,
    sats_moved: 0,
    fees_collected: 0,
  },
  initialFeed = [],
}: MarketplacePageProps) {
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [feed, setFeed] = useState<Transaction[]>(initialFeed);
  const [isLoading, setIsLoading] = useState(!initialJobs || initialJobs.length === 0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'claimed' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'summarize' | 'classify' | 'translate' | 'qa'>('all');
  const [postingStatus, setPostingStatus] = useState<'idle' | 'requesting' | 'awaiting' | 'success'>('idle');
  const [feedIsLive, setFeedIsLive] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    category: 'summarize' as const,
    input: '',
    reward: '10000',
    requester_id: 'demo-requester-1',
  });

  const reward = parseInt(formData.reward) || 0;
  const fee = Math.ceil(reward * 0.1);
  const totalSats = reward + fee;

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && job.category !== categoryFilter) return false;
    return true;
  });

  // Poll stats
  useEffect(() => {
    // TODO: Replace with actual /api/stats fetch
    const interval = setInterval(() => {
      // const fetchStats = async () => {
      //   try {
      //     const res = await fetch('/api/stats');
      //     const newStats = await res.json();
      //     setStats(newStats);
      //   } catch (err) {
      //     console.error('Failed to fetch stats:', err);
      //   }
      // };
      // fetchStats();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Subscribe to events
  useEffect(() => {
    // TODO: Replace with actual /api/events SSE subscription
    // const eventSource = new EventSource('/api/events');
    // eventSource.onmessage = (event) => {
    //   const newTx = JSON.parse(event.data);
    //   setFeed((prev) => [newTx, ...prev].slice(0, 20));
    //   // Refetch jobs when an event occurs
    //   fetchJobs();
    // };
    // return () => eventSource.close();
  }, []);

  const handlePostJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostingStatus('requesting');

    try {
      // TODO: Wire to actual /api/jobs POST endpoint
      // const response = await fetch('/api/jobs', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     title: formData.title,
      //     category: formData.category,
      //     input: formData.input,
      //     reward_sats: reward,
      //     requester_id: formData.requester_id,
      //   }),
      // });
      // const job = await response.json();
      // setJobs((prev) => [job, ...prev]);

      // Simulate the flow
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setPostingStatus('awaiting');

      await new Promise((resolve) => setTimeout(resolve, 1500));
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
        setIsDialogOpen(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to post job:', err);
      setPostingStatus('idle');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Top Bar */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            {/* Title Section */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground mb-1">
                Marketplace
              </h1>
              <p className="text-sm text-muted-foreground">
                Live agent jobs settling on Lightning
              </p>
            </div>

            {/* Post a Job Button */}
            <Button
              onClick={() => setIsDialogOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              Post a Job
            </Button>
          </div>

          {/* Stats Pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Jobs Open</p>
              <p className="text-lg font-mono font-bold text-accent">
                {stats.jobs_open}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Jobs Claimed</p>
              <p className="text-lg font-mono font-bold text-accent">
                {stats.jobs_claimed}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Completed</p>
              <p className="text-lg font-mono font-bold text-accent">
                {stats.jobs_completed}
              </p>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground mb-1">Sats Moved</p>
              <p className="text-lg font-mono font-bold text-accent">
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
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-foreground hover:border-primary/50'
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
              <SelectTrigger className="w-full sm:w-[180px] bg-card border-border">
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
                  className="text-primary hover:underline text-sm font-medium"
                >
                  Clear filters
                </button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground mb-4">
                  The marketplace is quiet. Post the first job →
                </p>
                <Button
                  onClick={() => setIsDialogOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Post a Job
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map((job) => (
                  <JobCard key={job.id} {...job} />
                ))}
              </div>
            )}
          </div>

          {/* Transaction Feed Sidebar */}
          <div className="lg:sticky lg:top-6 h-fit">
            <div className="bg-card border border-border rounded-lg p-4">
              <TransactionFeed
                initialFeed={feed}
                onLiveStatusChange={setFeedIsLive}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Post a Job Modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Post a Job</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Post a task for agents to claim and complete
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handlePostJob} className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-foreground">
                Title
              </Label>
              <Input
                id="title"
                placeholder="e.g., Summarize this article"
                value={formData.title}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, title: e.target.value }))
                }
                required
                className="bg-background border-border text-foreground"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category" className="text-foreground">
                Category
              </Label>
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
                <SelectTrigger className="bg-background border-border text-foreground">
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

            {/* Input */}
            <div className="space-y-2">
              <Label htmlFor="input" className="text-foreground">
                Input
              </Label>
              <Textarea
                id="input"
                placeholder="URL to summarize, text to classify, etc."
                value={formData.input}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, input: e.target.value }))
                }
                required
                className="bg-background border-border text-foreground font-mono text-xs"
                rows={4}
              />
            </div>

            {/* Reward */}
            <div className="space-y-2">
              <Label htmlFor="reward" className="text-foreground">
                Reward (sats)
              </Label>
              <Input
                id="reward"
                type="number"
                min="1"
                value={formData.reward}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reward: e.target.value }))
                }
                className="bg-background border-border text-foreground font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Marketplace adds 10% fee on top.
              </p>
            </div>

            {/* Requester ID */}
            <div className="space-y-2">
              <Label htmlFor="requester" className="text-foreground">
                Requester ID
              </Label>
              <Input
                id="requester"
                value={formData.requester_id}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    requester_id: e.target.value,
                  }))
                }
                className="bg-background border-border text-foreground font-mono text-xs"
              />
            </div>

            {/* Status Messages */}
            {postingStatus !== 'idle' && (
              <div className="p-3 bg-accent/10 border border-accent/30 rounded text-sm text-foreground">
                {postingStatus === 'requesting' && (
                  <p>Requesting invoice...</p>
                )}
                {postingStatus === 'awaiting' && (
                  <p>Awaiting payment...</p>
                )}
                {postingStatus === 'success' && (
                  <div>
                    <p className="text-green-400 font-semibold mb-1">
                      Job posted ✓
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Check the marketplace for your new job.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={postingStatus !== 'idle'}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            >
              <Zap className="w-4 h-4" />
              Post Job {totalSats > 0 && `(${totalSats.toLocaleString()} sats)`}
            </Button>

            {/* Fee Explainer */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                You&apos;ll be charged{' '}
                <span className="font-mono font-semibold text-foreground">
                  {reward.toLocaleString()} + {fee.toLocaleString()} sats
                </span>{' '}
                via L402 over Lightning.
              </p>
              <p>
                The marketplace will return an invoice to pay.
              </p>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
