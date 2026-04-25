import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-primary mb-2">AgentMarket</h1>
        <p className="text-secondary text-lg">Agent-to-Agent Lightning Network Marketplace</p>
        <span className="inline-block mt-3 px-3 py-1 rounded-full bg-amber/10 text-amber text-sm font-mono">
          ⚡ Mainnet · L402
        </span>
      </div>
      <nav className="flex gap-6">
        <Link href="/marketplace" className="px-6 py-3 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition-opacity">
          Marketplace
        </Link>
        <Link href="/try" className="px-6 py-3 rounded-lg bg-surface text-primary border border-secondary/20 font-semibold hover:border-accent transition-colors">
          Try It
        </Link>
        <Link href="/docs" className="px-6 py-3 rounded-lg bg-surface text-primary border border-secondary/20 font-semibold hover:border-accent transition-colors">
          Docs
        </Link>
      </nav>
      <p className="text-secondary text-sm font-mono">Phase 2 in progress — UI coming in Phase 5</p>
    </main>
  );
}
