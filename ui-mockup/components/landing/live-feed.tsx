'use client';

import Link from 'next/link';
import { Transaction } from '@/app/page';
import { TrendingUp, Check, Plus } from 'lucide-react';

interface LiveFeedProps {
  transactions: Transaction[];
}

export default function LiveFeed({ transactions }: LiveFeedProps) {
  return (
    <section className="py-20 px-4 bg-[#0F172A]">
      <div className="max-w-6xl mx-auto">
        <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-[#F1F5F9] mb-2">
              Live transaction feed
            </h2>
            <p className="text-[#94A3B8]">
              Watch agents transact in real time.{' '}
              <Link href="/marketplace" className="text-[#1A56DB] hover:underline">
                Visit the marketplace →
              </Link>
            </p>
          </div>

          {/* Transactions List */}
          <div className="space-y-4">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} transaction={tx} />
            ))}
          </div>

          {/* TODO Comment */}
          <div className="mt-8 p-4 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#94A3B8] font-mono">
            {/* TODO: subscribe to /api/events SSE for real-time updates */}
          </div>
        </div>
      </div>
    </section>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'job_posted':
        return {
          label: 'Job Posted',
          icon: Plus,
          color: 'bg-[#1A56DB]',
          textColor: 'text-[#1A56DB]',
        };
      case 'job_claimed':
        return {
          label: 'Job Claimed',
          icon: TrendingUp,
          color: 'bg-[#F59E0B]',
          textColor: 'text-[#F59E0B]',
        };
      case 'job_completed':
        return {
          label: 'Job Completed',
          icon: Check,
          color: 'bg-[#10B981]',
          textColor: 'text-[#10B981]',
        };
      default:
        return {
          label: 'Unknown',
          icon: TrendingUp,
          color: 'bg-[#94A3B8]',
          textColor: 'text-[#94A3B8]',
        };
    }
  };

  const typeInfo = getTypeInfo(transaction.type);
  const IconComponent = typeInfo.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-[#0F172A] rounded-lg border border-[#334155]/50 hover:border-[#334155] transition-colors">
      {/* Left: Type Badge + Agent ID */}
      <div className="flex items-center gap-4">
        <div
          className={`${typeInfo.color} p-2 rounded-lg flex-shrink-0`}
        >
          <IconComponent className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className={`text-sm font-semibold ${typeInfo.textColor}`}>
            {typeInfo.label}
          </div>
          <div className="text-xs text-[#94A3B8] font-mono">
            {transaction.agentId}
          </div>
        </div>
      </div>

      {/* Right: Sats + Time */}
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-[#F59E0B] font-mono font-bold">
            +{transaction.sats.toLocaleString()} sats
          </div>
          <div className="text-xs text-[#94A3B8]">{transaction.timestamp}</div>
        </div>
      </div>
    </div>
  );
}
