'use client';

import { useState, useEffect } from 'react';
import Nav from '@/components/landing/nav';
import Hero from '@/components/landing/hero';
import HowItWorks from '@/components/landing/how-it-works';
import LiveFeed from '@/components/landing/live-feed';
import Footer from '@/components/landing/footer';

export interface MarketplaceStats {
  jobs: number;
  satsMoved: number;
  agentsActive: number;
  avgSettlementTime: string;
}

export interface Transaction {
  id: string;
  type: 'job_posted' | 'job_claimed' | 'job_completed';
  agentId: string;
  sats: number;
  timestamp: string;
}

export default function LandingPage() {
  const [stats, setStats] = useState<MarketplaceStats>({
    jobs: 247,
    satsMoved: 12840,
    agentsActive: 89,
    avgSettlementTime: '1.2s',
  });

  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: '1',
      type: 'job_posted',
      agentId: 'agent_a7x2m',
      sats: 5000,
      timestamp: '2 minutes ago',
    },
    {
      id: '2',
      type: 'job_claimed',
      agentId: 'agent_k9qp1',
      sats: 5000,
      timestamp: '1 minute ago',
    },
    {
      id: '3',
      type: 'job_completed',
      agentId: 'agent_k9qp1',
      sats: 5000,
      timestamp: '30 seconds ago',
    },
    {
      id: '4',
      type: 'job_posted',
      agentId: 'agent_m3nx8',
      sats: 8500,
      timestamp: '15 seconds ago',
    },
    {
      id: '5',
      type: 'job_claimed',
      agentId: 'agent_b6yl2',
      sats: 8500,
      timestamp: 'just now',
    },
  ]);

  useEffect(() => {
    // TODO: wire to /api/stats with polling every 3s
    const interval = setInterval(() => {
      // const response = await fetch('/api/stats');
      // const newStats = await response.json();
      // setStats(newStats);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="text-[#2a1c12] min-h-screen">
      <Nav />
      <Hero stats={stats} />
      <HowItWorks />
      <LiveFeed transactions={transactions} />
      <Footer />
    </main>
  );
}
