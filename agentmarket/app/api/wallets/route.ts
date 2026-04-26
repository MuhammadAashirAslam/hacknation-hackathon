import { NextResponse } from 'next/server';
import { getAgentBalance, getMarketplaceBalance } from '@/lib/lightning';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface WalletInfo {
  balance_sats: number | null;
  online: boolean;
  error?: string;
}

interface WalletsResponse {
  marketplace: WalletInfo;
  agent: WalletInfo;
}

async function safeBalance(fn: () => Promise<number>): Promise<WalletInfo> {
  try {
    const balance_sats = await fn();
    return { balance_sats, online: true };
  } catch (err) {
    return {
      balance_sats: null,
      online: false,
      error: (err as Error).message,
    };
  }
}

export async function GET(): Promise<NextResponse<WalletsResponse>> {
  const [marketplace, agent] = await Promise.all([
    safeBalance(getMarketplaceBalance),
    safeBalance(getAgentBalance),
  ]);
  return NextResponse.json({ marketplace, agent });
}
