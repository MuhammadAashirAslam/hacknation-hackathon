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
  worker_id: string | null;
  result: string | null;
  created_at: number;
  claimed_at: number | null;
  completed_at: number | null;
  expires_at: number;
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
