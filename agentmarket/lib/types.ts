export type JobCategory = 'summarize' | 'classify' | 'translate' | 'qa';

export type JobStatus = 'open' | 'claimed' | 'completed' | 'expired';

export interface Job {
  id: string;
  title: string;
  category: JobCategory;
  input: string;
  reward_sats: number;
  fee_sats: number;
  status: JobStatus;
  requester_id: string;
  // Round-robin assignment from the worker queue at job creation. null = open
  // to any registered worker (legacy / no fleet running).
  assigned_worker_id: string | null;
  worker_id: string | null;
  result: string | null;
  created_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  expires_at: number;
  // Decomposition: when set, this is a child job whose result will be folded
  // into its parent on completion. null on standalone jobs and on parents.
  parent_job_id: string | null;
  // True on a parent that has been decomposed into children. Workers must
  // skip these (they're orchestration nodes, not leaf work).
  is_decomposed: boolean;
}

export interface Assessment {
  id: string;
  job_id: string;
  worker_id: string;
  // Short Tavily-derived note about the job. Free-form, capped to ~400 chars.
  note: string;
  // Whether this worker is the assigned one (UI-side highlighting).
  assigned: boolean;
  created_at: number;
}

export type TransactionType = 'job_posted' | 'job_claimed' | 'job_completed';

export type TransactionDirection = 'in' | 'out';

export interface Transaction {
  id: string;
  type: TransactionType;
  sats: number;
  direction: TransactionDirection;
  job_id: string;
  agent_id: string;
  timestamp: number;
}

export interface ApiError {
  error: string;
  code: string;
}

export interface CreateJobBody {
  title: string;
  category: JobCategory;
  input: string;
  reward_sats: number;
  requester_id: string;
}

export interface ClaimJobBody {
  worker_id: string;
}

// payout_invoice is an assumption pending your confirmation: worker submits a
// fresh BOLT11 in the deliver request and marketplace pays it on success.
export interface DeliverJobBody {
  worker_id: string;
  result: string;
  payout_invoice: string;
}

export interface MarketplaceStats {
  jobs_total: number;
  jobs_open: number;
  jobs_claimed: number;
  jobs_completed: number;
  sats_moved: number;
  fees_collected: number;
}
