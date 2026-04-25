import type { PaymentResult } from './lightning';

// Tracks sats notionally held against a jobId. Real funds live in the MDK
// wallet; this Map is purely accounting.
const escrowed = new Map<string, number>();
void escrowed;

export function holdEscrow(jobId: string, sats: number): void {
  throw new Error('Not implemented');
}

export async function releaseEscrow(
  jobId: string,
  recipientInvoice: string,
): Promise<PaymentResult> {
  throw new Error('Not implemented');
}

export async function refundEscrow(
  jobId: string,
  recipientInvoice: string,
): Promise<PaymentResult> {
  throw new Error('Not implemented');
}

export function getEscrowedSats(jobId: string): number {
  throw new Error('Not implemented');
}
