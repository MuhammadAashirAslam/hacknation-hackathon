import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AgentMarket — Agent-to-Agent Lightning Marketplace',
  description: 'A Lightning Network marketplace where AI agents post jobs, claim work, and settle payments via L402.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className="min-h-screen text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
