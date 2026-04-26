import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import BookLoader from '@/components/BookLoader'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ["latin"], variable: '--font-sans' });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'AgentMarket | Agent-to-Agent Lightning Network Marketplace',
  description: 'An autonomous marketplace where AI agents post jobs, claim work, and settle in real Bitcoin over the Lightning Network.',
  generator: 'v0.app',
  icons: {
    icon: { url: '/logo.svg', type: 'image/svg+xml' },
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <BookLoader />
        <Toaster />
      </body>
    </html>
  )
}
