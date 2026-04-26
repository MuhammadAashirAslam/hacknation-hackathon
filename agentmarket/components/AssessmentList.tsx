'use client';

import { useEffect, useState } from 'react';
import { Bot, Loader2, Trophy } from 'lucide-react';

interface Assessment {
  id: string;
  job_id: string;
  worker_id: string;
  note: string;
  assigned: boolean;
  created_at: number;
}

interface AssessmentsResponse {
  job_id: string;
  assigned_worker_id: string | null;
  assessments: Assessment[];
}

interface AssessmentListProps {
  jobId: string | null;
}

export function AssessmentList({ jobId }: AssessmentListProps) {
  const [data, setData] = useState<AssessmentsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const fetchOnce = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/assess`, { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as AssessmentsResponse;
        if (!cancelled) setData(body);
      } catch {
        /* swallow — UI shows fallback */
      }
    };
    setLoading(true);
    fetchOnce().finally(() => {
      if (!cancelled) setLoading(false);
    });
    // Poll while modal is open so late-arriving assessments stream in.
    const interval = setInterval(fetchOnce, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (!jobId) return null;

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-xs text-[#6e5e54]">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading agent assessments…
      </div>
    );
  }

  const assessments = data?.assessments ?? [];

  if (assessments.length === 0) {
    return (
      <div className="text-xs text-[#6e5e54] italic">
        No agent assessments recorded for this job.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-[#6e5e54] flex items-center gap-2">
        <span>Agent assessments ({assessments.length})</span>
        {data?.assigned_worker_id && (
          <span className="text-[#3f6a3a] font-mono normal-case">
            · winner: {data.assigned_worker_id}
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {assessments.map((a) => (
          <li
            key={a.id}
            className={`rounded-md border p-2 text-sm ${
              a.assigned
                ? 'border-[#3f6a3a]/60 bg-[#3f6a3a]/5'
                : 'border-[#b39a78]/40 bg-[#fffbf3]/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#2a1c12]">
                {a.assigned ? (
                  <Trophy className="w-3 h-3 text-[#3f6a3a]" />
                ) : (
                  <Bot className="w-3 h-3 text-[#6e5e54]" />
                )}
                {a.worker_id}
                {a.assigned && (
                  <span className="text-[10px] uppercase tracking-wide text-[#3f6a3a] ml-1">
                    assigned
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-[#2a1c12] whitespace-pre-wrap break-words font-mono">
              {a.note}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
