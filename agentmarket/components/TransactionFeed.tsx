'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  FilePlus,
  Hand,
  CheckCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Zap,
  Loader2,
  Pause,
  Play,
} from 'lucide-react';

export interface Transaction {
  id: string;
  type: 'job_posted' | 'job_claimed' | 'job_completed';
  sats: number;
  direction: 'in' | 'out';
  job_id: string;
  agent_id: string;
  timestamp: number; // ms epoch
}

interface TransactionFeedProps {
  initial?: Transaction[];
  sseUrl?: string;
  maxItems?: number;
  className?: string;
}

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

const typeIcons = {
  job_posted: FilePlus,
  job_claimed: Hand,
  job_completed: CheckCircle,
};

const typeColors = {
  job_posted: '#2a1c12',
  job_claimed: '#8a6a2a',
  job_completed: '#3f6a3a',
};

const typeLabels = {
  job_posted: 'Job posted',
  job_claimed: 'Job claimed',
  job_completed: 'Job completed',
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

function truncateId(id: string, length: number = 8): string {
  return id.length > length ? `${id.substring(0, length)}…` : id;
}

export function TransactionFeed({
  initial = [],
  sseUrl = '/api/events',
  maxItems = 50,
  className = '',
}: TransactionFeedProps) {
  const [transactions, setTransactions] = useState<Transaction[]>(initial);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [isPaused, setIsPaused] = useState(false);
  const [newEventCount, setNewEventCount] = useState(0);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [relativeTime, setRelativeTime] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout>();
  const retryTimerRef = useRef<NodeJS.Timeout>();
  const relativeTimeIntervalRef = useRef<NodeJS.Timeout>();

  // Scroll to top on new transaction (if not paused)
  const scrollToTop = useCallback(() => {
    if (scrollAreaRef.current && !isPaused) {
      scrollAreaRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isPaused]);

  // Connect to SSE
  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    setStatus('connecting');
    setReconnectCountdown(0);

    const eventSource = new EventSource(sseUrl);

    eventSource.onopen = () => {
      setStatus('connected');
      retryCountRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Transaction;

        // Validate required fields
        if (!data.id || !data.type || data.sats === undefined || !data.direction) {
          console.error('[v0] Invalid transaction data:', data);
          return;
        }

        setTransactions((prev) => [data, ...prev].slice(0, maxItems));

        if (isPaused) {
          setNewEventCount((prev) => prev + 1);
        } else {
          scrollToTop();
        }
      } catch (error) {
        console.error('[v0] Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setStatus('disconnected');

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s...
      const baseDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
      retryCountRef.current += 1;

      let countdown = baseDelay / 1000;
      setReconnectCountdown(countdown);

      reconnectTimerRef.current = setInterval(() => {
        countdown -= 1;
        setReconnectCountdown(countdown);

        if (countdown <= 0) {
          clearInterval(reconnectTimerRef.current);
          connect();
        }
      }, 1000);

      retryTimerRef.current = setTimeout(() => {
        connect();
      }, baseDelay);
    };

    eventSourceRef.current = eventSource;
  }, [sseUrl, maxItems, isPaused, scrollToTop]);

  // Disconnect from SSE
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setStatus('disconnected');
  }, []);

  // Initialize connection on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // Update relative times every 5 seconds
  useEffect(() => {
    relativeTimeIntervalRef.current = setInterval(() => {
      setRelativeTime((prev) => prev + 1);
    }, 5000);

    return () => {
      if (relativeTimeIntervalRef.current) clearInterval(relativeTimeIntervalRef.current);
    };
  }, []);

  // Handle pause: reset new event count when unpaused and transactions resume scrolling
  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
    if (isPaused) {
      setNewEventCount(0);
      scrollToTop();
    }
  };

  // Status indicator
  const statusDot =
    status === 'connected'
      ? 'bg-[#3f6a3a] animate-pulse'
      : status === 'connecting'
        ? 'bg-[#b39a78]'
        : 'bg-[#b94a3a]';

  const statusLabel =
    status === 'connected'
      ? 'Live'
      : status === 'connecting'
        ? 'Connecting…'
        : 'Reconnecting…';

  // Render loading state
  if (status === 'connecting' && transactions.length === 0) {
    return (
      <div className={`flex flex-col bg-[#fffbf3]/80 rounded-xl border border-[#b39a78]/60 max-h-[640px] md:max-h-[480px] backdrop-blur-[2px] ${className}`}>
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <Loader2 className="w-6 h-6 text-[#6e5e54] animate-spin mb-3" />
          <p className="text-xs text-[#6e5e54]">Connecting to live feed…</p>
        </div>
      </div>
    );
  }

  const isEmpty = transactions.length === 0;

  return (
    <div className={`flex flex-col bg-[#fffbf3]/80 rounded-xl border border-[#b39a78]/60 max-h-[640px] md:max-h-[480px] backdrop-blur-[2px] ${className}`}>
      <div className="sticky top-0 p-4 border-b border-[#b39a78]/60 bg-[#fffbf3]/90 rounded-t-xl flex items-center justify-between z-10">
        <h3 className="text-sm font-medium uppercase tracking-wide text-[#6e5e54]">
          Live Feed
        </h3>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className="text-xs text-[#6e5e54]">{statusLabel}</span>
        </div>
      </div>

      {status === 'disconnected' && reconnectCountdown > 0 && (
        <div className="bg-[#f1e3cb] text-[#2a1c12] text-xs px-4 py-2 text-center border-b border-[#b39a78]/60">
          Reconnecting in {Math.ceil(reconnectCountdown)}s…
        </div>
      )}

      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
      >
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Zap className="w-6 h-6 text-[#2a1c12] mb-2" />
            <p className="text-xs text-[#6e5e54]">
              No transactions yet. Spin up an agent.
            </p>
          </div>
        ) : (
          transactions.map((tx, index) => {
            const Icon = typeIcons[tx.type];
            const iconColor = typeColors[tx.type];
            const directionIcon =
              tx.direction === 'in' ? (
                <ArrowUpRight className="w-3 h-3 text-[#3f6a3a]" />
              ) : (
                <ArrowDownLeft className="w-3 h-3 text-[#b94a3a]" />
              );

            return (
              <div
                key={tx.id}
                className="flex items-start gap-3 p-3 bg-[#fffbf3] rounded-lg border border-[#b39a78]/50 hover:border-[#2a1c12]/40 transition-all animate-in slide-in-from-top-2 fade-in duration-200"
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
              >
                <div className="flex-shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" style={{ color: iconColor }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#2a1c12] capitalize">
                    {typeLabels[tx.type]}
                  </div>
                  <div className="text-xs text-[#6e5e54] font-mono">
                    agent {truncateId(tx.agent_id)} · job {truncateId(tx.job_id, 8)}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center gap-1 justify-end mb-1">
                    <span
                      className="text-sm font-mono font-semibold"
                      style={{
                        color: tx.direction === 'in' ? '#3f6a3a' : '#b94a3a',
                      }}
                    >
                      {tx.direction === 'in' ? '+' : '−'}
                      {tx.sats.toLocaleString()} sats
                    </span>
                    {directionIcon}
                  </div>
                  <div className="text-xs text-[#6e5e54]">
                    {formatRelativeTime(tx.timestamp)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="sticky bottom-0 p-3 border-t border-[#b39a78]/60 bg-[#fffbf3]/90 rounded-b-xl flex items-center justify-between text-xs text-[#6e5e54]">
        <span>Showing last {transactions.length} events</span>
        <button
          onClick={handleTogglePause}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[#d9c6a4] transition-colors text-[#6e5e54] hover:text-[#2a1c12]"
          title={isPaused ? 'Resume scrolling' : 'Pause scrolling'}
        >
          {isPaused ? (
            <>
              <Play className="w-3 h-3" />
              <span className="text-xs">{newEventCount}</span>
            </>
          ) : (
            <>
              <Pause className="w-3 h-3" />
              <span>Pause</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
