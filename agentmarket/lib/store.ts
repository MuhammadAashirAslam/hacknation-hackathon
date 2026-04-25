import type { Job, JobStatus } from './types';

// HMR-safe singleton: survives Next.js hot reloads without losing in-memory state.
const g = globalThis as unknown as { __jobStore?: Map<string, Job> };
const store: Map<string, Job> = g.__jobStore ?? (g.__jobStore = new Map<string, Job>());

export interface ListJobsFilter {
  status?: JobStatus;
  category?: Job['category'];
}

// Lazily marks a job 'expired' if its expiry window has passed. Mutates store.
function applyExpiry(job: Job): Job {
  if (job.status === 'open' && Date.now() > job.expires_at) {
    const expired: Job = { ...job, status: 'expired' };
    store.set(job.id, expired);
    return expired;
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
