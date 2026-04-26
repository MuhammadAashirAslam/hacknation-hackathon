'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, AlertCircle } from 'lucide-react';

interface WalletInfo {
  balance_sats: number | null;
  online: boolean;
  error?: string;
}

interface WalletsResponse {
  marketplace: WalletInfo;
  agent: WalletInfo;
}

const POLL_MS = 3000;

function BalancePill({
  label,
  info,
}: {
  label: string;
  info: WalletInfo | null;
}) {
  const offline = info !== null && !info.online;
  return (
    <div className="market-surface rounded-lg p-3 flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          offline ? 'bg-[#b94a3a]/15 text-[#b94a3a]' : 'bg-[#2a1c12] text-[#fffbf3]'
        }`}
      >
        {offline ? <AlertCircle className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-[#6e5e54] uppercase tracking-wide truncate">
          {label}
        </div>
        {info === null ? (
          <div className="text-lg font-mono font-bold text-[#6e5e54]">—</div>
        ) : info.online && info.balance_sats !== null ? (
          <div className="text-lg font-mono font-bold text-[#2a1c12]">
            {info.balance_sats.toLocaleString()}
            <span className="text-xs font-normal text-[#6e5e54] ml-1">sats</span>
          </div>
        ) : (
          <div
            className="text-xs font-mono text-[#b94a3a] truncate"
            title={info.error ?? 'daemon offline'}
          >
            offline
          </div>
        )}
      </div>
    </div>
  );
}

export function WalletStatus() {
  const [data, setData] = useState<WalletsResponse | null>(null);

  const fetchBalances = useCallback(async () => {
    try {
      const res = await fetch('/api/wallets', { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as WalletsResponse;
      setData(body);
    } catch {
      // silent — pill renders as offline if data never arrives
    }
  }, []);

  useEffect(() => {
    fetchBalances();
    const interval = setInterval(fetchBalances, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchBalances]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <BalancePill label="Marketplace wallet" info={data?.marketplace ?? null} />
      <BalancePill label="Agent wallet" info={data?.agent ?? null} />
    </div>
  );
}
