// MDK wrapper. All Lightning calls in the app must go through this module —
// routes never import @moneydevkit/* directly.
//
// Payment backend: MDK Agent Wallet daemon at MDK_WALLET_URL (default http://localhost:3456).
// Daemon must be running: `npx @moneydevkit/agent-wallet@latest start --daemon`
//
// L402 implementation: custom, daemon-based. Does NOT use @moneydevkit/nextjs withPayment
// (that requires MDK cloud webhooks, incompatible with local dev). Instead:
//   1. Challenge: generate invoice via daemon, issue HMAC-signed token
//   2. Verify:   check daemon's /payments for the payment_hash, verify token HMAC
// Wire format: Authorization: L402 <token>:<payment_hash>
// 402 body: { invoice, macaroon, payment_hash, amount_sats, expires_at }

import { createHmac } from 'node:crypto';

const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, '');
const WALLET_URL = normalizeBaseUrl(process.env.MDK_WALLET_URL ?? 'http://localhost:3456');
const AGENT_WALLET_URL = normalizeBaseUrl(
  process.env.MDK_AGENT_WALLET_URL ?? process.env.AGENT_WALLET_URL ?? 'http://localhost:3457',
);

// Token signing secret. In production this would be a proper env secret.
// For the demo, derived from MDK_ACCESS_TOKEN so it's unique per deployment.
const TOKEN_SECRET = process.env.MDK_ACCESS_TOKEN ?? 'agentmarket-dev-secret';

// L402 token lifetime in seconds. Must be > payment settlement time (~15s).
const TOKEN_EXPIRY_SECS = Number(process.env.L402_EXPIRY_SECS ?? '900');

interface MdkEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function callDaemon<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${WALLET_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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

async function callDaemonAt<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (err) {
    throw new Error(
      `MDK daemon unreachable at ${baseUrl}${path}: ${(err as Error).message}. ` +
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

// ── Public interfaces ────────────────────────────────────────────────────────

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

// ── Daemon-backed functions (implemented and tested in Phase 1) ──────────────

interface MdkInvoiceData { invoice: string; paymentHash: string; expiresAt: string; }
interface MdkBalanceData  { balanceSats: number; }
interface MdkSendData     { paymentId: string; paymentHash: string; status: string; }
interface MdkPaymentEntry {
  paymentHash: string;
  amountSats: number;
  direction: 'inbound' | 'outbound';
  status: string;
  preimage?: string;
}
interface MdkPaymentsData { payments: MdkPaymentEntry[]; }

export async function generateInvoice(sats: number, memo: string): Promise<GeneratedInvoice> {
  const data = await callDaemon<MdkInvoiceData>('/receive', {
    method: 'POST',
    body: JSON.stringify({ amount_sats: sats, description: memo }),
  });
  return { invoice: data.invoice, payment_hash: data.paymentHash, expires_at: data.expiresAt };
}

export async function payInvoice(bolt11: string): Promise<PaymentResult> {
  const data = await callDaemon<MdkSendData>('/send', {
    method: 'POST',
    body: JSON.stringify({ destination: bolt11 }),
  });
  // Daemon does not return preimage on send; settlement is async.
  return { payment_hash: data.paymentHash, preimage: '', fee_sats: 0 };
}

export async function payInvoiceAsAgent(bolt11: string): Promise<PaymentResult> {
  const data = await callDaemonAt<MdkSendData>(AGENT_WALLET_URL, '/send', {
    method: 'POST',
    body: JSON.stringify({ destination: bolt11 }),
  });
  return { payment_hash: data.paymentHash, preimage: '', fee_sats: 0 };
}

export async function getMarketplaceBalance(): Promise<number> {
  const data = await callDaemon<MdkBalanceData>('/balance');
  return data.balanceSats;
}

export async function verifyPayment(paymentHash: string): Promise<boolean> {
  const data = await callDaemon<MdkPaymentsData>('/payments');
  return data.payments.some(
    (p) => p.paymentHash === paymentHash && p.direction === 'inbound' && p.status === 'completed',
  );
}

// ── Custom L402 implementation ────────────────────────────────────────────────
//
// Token format (base64url of JSON):
//   { payment_hash, endpoint, amount_sats, expires_at }
// Token MAC: HMAC-SHA256(TOKEN_SECRET, token_payload)
// Wire: "L402 <base64url(payload)>.<base64url(mac)>:<payment_hash>"
//
// The token binds a specific invoice to a specific endpoint and amount,
// preventing replay across endpoints or amount manipulation.

interface L402TokenPayload {
  payment_hash: string;
  endpoint: string;
  amount_sats: number;
  expires_at: number;
}

function encodeToken(payload: L402TokenPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${mac}`;
}

function decodeToken(token: string): L402TokenPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expectedMac = createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  if (mac !== expectedMac) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as L402TokenPayload;
  } catch {
    return null;
  }
}

export interface L402Challenge {
  invoice: string;
  macaroon: string;      // our token (named 'macaroon' for L402 wire compat)
  payment_hash: string;
  amount_sats: number;
  expires_at: number;
}

export async function createL402Challenge(
  sats: number,
  endpoint: string,
): Promise<L402Challenge> {
  const inv = await generateInvoice(sats, `AgentMarket L402: ${endpoint}`);
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_SECS;
  const payload: L402TokenPayload = {
    payment_hash: inv.payment_hash,
    endpoint,
    amount_sats: sats,
    expires_at: expiresAt,
  };
  return {
    invoice: inv.invoice,
    macaroon: encodeToken(payload),
    payment_hash: inv.payment_hash,
    amount_sats: sats,
    expires_at: expiresAt,
  };
}

export type L402VerifyResult =
  | { ok: true; payment_hash: string }
  | { ok: false; status: 401 | 402 | 403; code: string; error: string };

export async function verifyL402Header(
  authHeader: string,
  endpoint: string,
  expectedSats: number,
): Promise<L402VerifyResult> {
  // Expected: "L402 <token>:<payment_hash>"
  const match = authHeader.match(/^L402\s+([^:]+):([0-9a-f]+)$/i);
  if (!match) {
    return { ok: false, status: 401, code: 'invalid_credential', error: 'Malformed L402 header' };
  }
  const [, token, paymentHash] = match;

  const payload = decodeToken(token);
  if (!payload) {
    return { ok: false, status: 401, code: 'invalid_credential', error: 'Token signature invalid' };
  }
  if (payload.payment_hash !== paymentHash) {
    return { ok: false, status: 401, code: 'invalid_payment_proof', error: 'Payment hash mismatch' };
  }
  if (Date.now() / 1000 > payload.expires_at) {
    return { ok: false, status: 401, code: 'credential_expired', error: 'Token has expired' };
  }
  // Normalize endpoint comparison (ignore trailing slash, query string)
  const normalize = (s: string) => s.split('?')[0].replace(/\/$/, '');
  if (normalize(payload.endpoint) !== normalize(endpoint)) {
    return { ok: false, status: 403, code: 'resource_mismatch', error: 'Token issued for different endpoint' };
  }
  if (payload.amount_sats !== expectedSats) {
    return { ok: false, status: 403, code: 'amount_mismatch', error: 'Token issued for different amount' };
  }

  const paid = await verifyPayment(paymentHash);
  if (!paid) {
    return { ok: false, status: 402, code: 'payment_required', error: 'Invoice not yet paid or not found' };
  }

  return { ok: true, payment_hash: paymentHash };
}

// ── withL402 route wrapper ────────────────────────────────────────────────────

export type L402Handler = (req: Request, context?: unknown) => Promise<Response>;

export interface L402Options {
  sats: number | ((req: Request) => number | Promise<number>);
}

export function withL402(handler: L402Handler, opts: L402Options): L402Handler {
  return async (req: Request, context?: unknown): Promise<Response> => {
    const url = new URL(req.url);
    const endpoint = url.pathname;
    const sats = typeof opts.sats === 'function' ? await opts.sats(req) : opts.sats;

    const authHeader = req.headers.get('Authorization') ?? '';

    if (!authHeader.toLowerCase().startsWith('l402 ')) {
      // No auth — issue a challenge
      const challenge = await createL402Challenge(sats, endpoint);
      return new Response(JSON.stringify(challenge), {
        status: 402,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': `L402 macaroon="${challenge.macaroon}", invoice="${challenge.invoice}"`,
        },
      });
    }

    // Has L402 header — verify
    const result = await verifyL402Header(authHeader, endpoint, sats);
    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: result.status, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return handler(req, context);
  };
}
