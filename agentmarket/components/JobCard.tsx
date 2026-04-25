import type { Job } from '@/lib/types';

export interface JobCardProps {
  job: Job;
  onClaim?: (jobId: string) => void;
}

export function JobCard(props: JobCardProps): JSX.Element {
  throw new Error('Not implemented');
}
