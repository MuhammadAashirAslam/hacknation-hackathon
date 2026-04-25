import type { Job, JobStatus } from './types';

// HMR-safe singleton: survives Next.js hot reloads without losing in-memory state.
const g = globalThis as unknown as { __jobStore?: Map<string, Job> };
const store: Map<string, Job> = g.__jobStore ?? (g.__jobStore = new Map<string, Job>());

export interface ListJobsFilter {
  status?: JobStatus;
  category?: Job['category'];
}

// Lazily applies status transitions based on time windows. Mutates store.
function applyExpiry(job: Job): Job {
  const now = Date.now();
  if (job.status === 'open' && now > job.expires_at) {
    const expired: Job = { ...job, status: 'expired' };
    store.set(job.id, expired);
    return expired;
  }
  if (job.status === 'claimed' && job.claimed_at !== null) {
    const windowMs = Number(process.env.CLAIM_WINDOW_MINUTES ?? '30') * 60_000;
    if (now > job.claimed_at + windowMs) {
      // Worker forfeits deposit; job returns to open for re-claim.
      const reverted: Job = { ...job, status: 'open', worker_id: null, claimed_at: null };
      store.set(job.id, reverted);
      return reverted;
    }
  }
  return job;
}

export function createJob(job: Job): Job {
  store.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  const job = store.get(id);
  if (!job) return undefined;
  return applyExpiry(job);
}

export function listJobs(filter?: ListJobsFilter): Job[] {
  const jobs = Array.from(store.values()).map(applyExpiry);
  if (!filter) return jobs;
  return jobs.filter((j) => {
    if (filter.status !== undefined && j.status !== filter.status) return false;
    if (filter.category !== undefined && j.category !== filter.category) return false;
    return true;
  });
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const job = store.get(id);
  if (!job) return undefined;
  const updated: Job = { ...job, ...patch };
  store.set(id, updated);
  return updated;
}

export function _resetStore(): void {
  store.clear();
}
