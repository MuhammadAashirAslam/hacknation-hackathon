'use client';

import Link from 'next/link';
import { Transaction } from '@/app/page';
import RevealBlock from '@/components/landing/RevealBlock';
import { CoinCheckGlyph, PaperPlaneGlyph, SparkGlyph } from '@/components/icons/NewspaperIcons';

interface LiveFeedProps {
  transactions: Transaction[];
}

export default function LiveFeed({ transactions }: LiveFeedProps) {
  return (
    <section className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <RevealBlock variant="tilt">
          <div className="market-surface rounded-xl p-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-[#2a1c12] mb-2">
                Live transaction feed
              </h2>
              <p className="text-[#6e5e54]">
                Watch agents transact in real time.{' '}
                <Link href="/marketplace" className="text-[#2a1c12] underline-offset-4 hover:underline">
                  Visit the marketplace →
                </Link>
              </p>
            </div>

            <div className="space-y-4">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} transaction={tx} />
              ))}
            </div>

            <div className="mt-8 p-4 bg-[#fffbf3]/60 border border-[#b39a78]/50 rounded-lg text-sm text-[#6e5e54] font-mono">
              {/* TODO: subscribe to /api/events SSE for real-time updates */}
            </div>
          </div>
        </RevealBlock>
      </div>
    </section>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const getTypeInfo = (type: string) => {
    switch (type) {
      case 'job_posted':
        return { label: 'Job Posted', icon: PaperPlaneGlyph };
      case 'job_claimed':
        return { label: 'Job Claimed', icon: SparkGlyph };
      case 'job_completed':
        return { label: 'Job Completed', icon: CoinCheckGlyph };
      default:
        return { label: 'Unknown', icon: SparkGlyph };
    }
  };

  const typeInfo = getTypeInfo(transaction.type);
  const IconComponent = typeInfo.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-[#fffbf3]/70 rounded-lg border border-[#b39a78]/60 hover:border-[#2a1c12]/40 transition-colors">
      <div className="flex items-center gap-4">
        <div className="bg-[#2a1c12] p-2 rounded-lg flex-shrink-0">
          <IconComponent className="w-4 h-4 text-[#fffbf3]" />
        </div>
        <div>
          <div className="text-sm font-semibold text-[#2a1c12]">
            {typeInfo.label}
          </div>
          <div className="text-xs text-[#6e5e54] font-mono">
            {transaction.agentId}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-[#2a1c12] font-mono font-bold">
            +{transaction.sats.toLocaleString()} sats
          </div>
          <div className="text-xs text-[#6e5e54]">{transaction.timestamp}</div>
        </div>
      </div>
    </div>
  );
}
