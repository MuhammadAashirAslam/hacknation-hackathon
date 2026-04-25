import { NextResponse } from 'next/server';
import type { ApiError, MarketplaceStats } from '@/lib/types';

export async function GET(): Promise<NextResponse<MarketplaceStats | ApiError>> {
  throw new Error('Not implemented');
}
