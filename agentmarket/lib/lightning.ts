// MDK wrapper. All Lightning calls in the app must go through this module —
// routes never import @moneydevkit/* directly.
//
// Backend: MDK Agent Wallet daemon at MDK_WALLET_URL (default http://localhost:3456).
// Daemon must be started out-of-band: `npx @moneydevkit/agent-wallet@latest start --daemon`.
//
// The daemon's HTTP API uses an envelope + camelCase shape:
//   success: { "success": true,  "data":  { ...camelCase fields... } }
//   error:   { "success": false, "error": { "code": "...", "message": "..." } }
// This adapter normalizes responses to flat snake_case so the rest of the app
// never sees MDK-specific shapes.

const WALLET_URL = process.env.MDK_WALLET_URL ?? 'http://localhost:3456';

interface MdkEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function callDaemon<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WALLET_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new Error(
      `MDK daemon unreachable at ${WALLET_URL}${path}: ${(err as Error).message}. ` +
      `Start it with: npx @moneydevkit/agent-wallet@latest start --daemon`,
    );
  }

  const body = (await res.json()) as MdkEnvelope<T>;
  if (!body.success || body.data === undefined) {
    const code = body.error?.code ?? `HTTP_${res.status}`;
    const msg = body.error?.message ?? 'unknown daemon error';
    throw new Error(`MDK ${path} failed [${code}]: ${msg}`);
  }
  return body.data;
}

export interface GeneratedInvoice {
  invoice: string;
  payment_hash: string;
  expires_at: string;
}

export interface PaymentResult {
  payment_hash: string;
  preimage: string;
  fee_sats: number;
}

interface MdkInvoiceData {
  invoice: string;
  paymentHash: string;
  expiresAt: string;
}

interface MdkBalanceData {
  balanceSats: number;
}

// Verified against live MDK daemon (2026-04-26). /send does NOT return preimage
// or feeSats — only paymentId, paymentHash, status.
interface MdkSendData {
  paymentId: string;
  paymentHash: string;
  status: string;
}

export async function generateInvoice(
  sats: number,
  memo: string,
): Promise<GeneratedInvoice> {
  const data = await callDaemon<MdkInvoiceData>('/receive', {
    method: 'POST',
    body: JSON.stringify({ amount_sats: sats, description: memo }),
  });
  return {
    invoice: data.invoice,
    payment_hash: data.paymentHash,
    expires_at: data.expiresAt,
  };
}

export async function payInvoice(bolt11: string): Promise<PaymentResult> {
  const data = await callDaemon<MdkSendData>('/send', {
    method: 'POST',
    body: JSON.stringify({ destination: bolt11 }),
  });
  return {
    payment_hash: data.paymentHash,
    preimage: '',     // MDK daemon does not return preimage — settlement is async
    fee_sats: 0,      // MDK daemon does not return fee breakdown
  };
}

export async function getMarketplaceBalance(): Promise<number> {
  const data = await callDaemon<MdkBalanceData>('/balance');
  return data.balanceSats;
}

// TODO(Phase 2): MDK daemon does not expose a payment-hash lookup endpoint
// in the version we probed. Two paths when we get there:
//  1. Use /payments to list and match payment_hash.
//  2. Trust the L402 macaroon's preimage (MDK's withL402 verifies it natively).
export async function verifyPayment(
  paymentHash: string,
  preimage: string,
): Promise<boolean> {
  void paymentHash;
  void preimage;
  throw new Error('verifyPayment: not implemented (Phase 2)');
}

import { withPayment } from '@moneydevkit/nextjs/server';

// L402 seam: route files call withL402 instead of importing withPayment directly,
// keeping all MDK dependencies isolated in this module.
//
// context?: unknown passes through Next.js route context (params) for [id] routes.
export type L402Handler = (req: Request, context?: unknown) => Promise<Response>;

export interface L402Options {
  // Fixed sats or a function that derives the price from the request.
  // Runs twice per payment cycle (invoice creation + token verification).
  // Must be deterministic for a given request URL — read req.url, never req.body.
  sats: number | ((req: Request) => number | Promise<number>);
}

export function withL402(handler: L402Handler, opts: L402Options): L402Handler {
  return withPayment({ amount: opts.sats, currency: 'SAT' }, handler) as L402Handler;
}
