import type { Assessment, Job, JobStatus } from './types';

// HMR-safe singletons: survive Next.js hot reloads without losing in-memory state.
const g = globalThis as unknown as {
  __jobStore?: Map<string, Job>;
  __assessmentStore?: Map<string, Assessment[]>;
  __workerQueue?: string[];
};
const store: Map<string, Job> =
  g.__jobStore ?? (g.__jobStore = new Map<string, Job>());
const assessmentsByJob: Map<string, Assessment[]> =
  g.__assessmentStore ?? (g.__assessmentStore = new Map<string, Assessment[]>());
const workerQueue: string[] =
  g.__workerQueue ?? (g.__workerQueue = []);

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

// Returns all child jobs of a given parent, in creation order.
export function listChildren(parentId: string): Job[] {
  return Array.from(store.values())
    .filter((j) => j.parent_job_id === parentId)
    .sort((a, b) => a.created_at - b.created_at)
    .map(applyExpiry);
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
  assessmentsByJob.clear();
  workerQueue.length = 0;
}

// ── Worker queue (round-robin assignment) ────────────────────────────────────

export function registerWorker(workerId: string): { queue: string[]; added: boolean } {
  if (workerQueue.includes(workerId)) {
    return { queue: [...workerQueue], added: false };
  }
  workerQueue.push(workerId);
  return { queue: [...workerQueue], added: true };
}

// Pops the head of the queue and pushes it to the tail. Returns the assigned
// worker id or null if no workers are registered.
export function rotateAssignWorker(): string | null {
  if (workerQueue.length === 0) return null;
  const next = workerQueue.shift() as string;
  workerQueue.push(next);
  return next;
}

export function listRegisteredWorkers(): string[] {
  return [...workerQueue];
}

// ── Assessments ──────────────────────────────────────────────────────────────

export function addAssessment(a: Assessment): void {
  const list = assessmentsByJob.get(a.job_id) ?? [];
  // Idempotency: one assessment per (job, worker).
  if (list.some((existing) => existing.worker_id === a.worker_id)) return;
  list.push(a);
  assessmentsByJob.set(a.job_id, list);
}

export function listAssessments(jobId: string): Assessment[] {
  return [...(assessmentsByJob.get(jobId) ?? [])];
}
