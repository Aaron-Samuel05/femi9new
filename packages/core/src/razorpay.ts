import 'server-only'
import type { Brand } from '@femi9/db'
import {
  keyIdFor,
  keySecretFor,
  paymentsConfigured,
  publicKeyIdFor,
  webhookConfiguredFor,
  webhookSecretFor,
} from './payment-identity'
import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  configuredEnv,
  mockProvidersAllowed,
  ProviderConfigurationError,
} from './runtime-mode'

/**
 * Razorpay gateway seam.
 *
 * This module is the ONLY place that knows how to talk to Razorpay, so the rest
 * of the app can create gateway orders and verify signatures without caring
 * whether we're live or mocked. We deliberately avoid the `razorpay` npm SDK and
 * hand-roll the two HTTP calls (create order, refund) with `fetch` + node:crypto
 * HMAC — the surface we need is tiny and this keeps the dependency footprint and
 * the runtime (must stay Node, for createHmac) under our control.
 *
 * MOCK MODE is explicit (`ALLOW_MOCK_PROVIDERS=true`) and is additionally
 * disabled whenever NODE_ENV=production. Missing live credentials therefore
 * fail closed instead of silently turning checkout into a free mock-payment
 * path.
 */

const ORDERS_URL = 'https://api.razorpay.com/v1/orders'

/** Live only when BOTH halves of the API credential are present. A half-set
 *  config (one env var) would fail every real call, so we treat it as unset. */
export function isConfigured(brand: Brand): boolean {
  return paymentsConfigured(brand)
}

export function webhookConfigured(brand: Brand): boolean {
  return webhookConfiguredFor(brand)
}

/** The publishable key the browser Checkout widget needs. Public by design
 *  (NEXT_PUBLIC_*); empty string in mock mode so the client can branch on it. */
export function publicKeyId(brand: Brand): string {
  return publicKeyIdFor(brand)
}

/** HTTP Basic header for the private API (key_id:key_secret, base64). Only ever
 *  called on the configured path, so the env vars are guaranteed present. */
function basicAuthHeader(brand: Brand): string {
  const keyId = keyIdFor(brand) ?? ''
  const keySecret = keySecretFor(brand) ?? ''
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')
}

/** Constant-time string compare over equal-length hex digests. A plain `===`
 *  leaks timing; length is checked first because timingSafeEqual throws on a
 *  size mismatch (and a different length already means "not equal"). */
function safeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export interface GatewayOrder {
  id: string
  amount: number // paise
  mock: boolean
}

/**
 * Open a payment order on the gateway for `amountRupees`.
 *
 * Razorpay works in PAISE, so we convert here (rupees are integers in our data,
 * Math.round guards any float drift). Configured → real Orders API. Not
 * configured → an explicit local/test mock id keyed on the receipt (our orderNo)
 * so a retry maps to the same mock order, with NO network call. Production fails
 * closed when credentials are absent.
 */
export async function createOrder(brand: Brand, {
  amountRupees,
  receipt,
}: {
  amountRupees: number
  receipt: string
}): Promise<GatewayOrder> {
  const amountPaise = Math.round(amountRupees * 100)

  if (!isConfigured(brand)) {
    if (!mockProvidersAllowed()) throw new ProviderConfigurationError('Razorpay')
    return { id: `mock_${receipt}`, amount: amountPaise, mock: true }
  }

  const res = await fetch(ORDERS_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: basicAuthHeader(brand) },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Razorpay createOrder failed (${res.status}): ${detail}`)
  }
  const data = (await res.json()) as { id: string; amount: number }
  return { id: data.id, amount: data.amount, mock: false }
}

/**
 * Verify the signature Razorpay Checkout hands back on a successful payment:
 * HMAC_SHA256(order_id|payment_id, key_secret), hex, compared constant-time to
 * `razorpay_signature`. Returns false when unconfigured — there is no secret to
 * sign with, so a "valid" result would be meaningless (the mock flow does not
 * route through here).
 */
export function verifyPaymentSignature(
  brand: Brand,
  {
    orderId,
    paymentId,
    signature,
  }: {
    orderId: string
    paymentId: string
    signature: string
  },
): boolean {
  const secret = keySecretFor(brand)
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')
  return safeEqual(expected, signature)
}

/**
 * Verify a webhook call: HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) hex,
 * compared to the `x-razorpay-signature` header. MUST run against the exact raw
 * request bytes (not a re-serialized JSON), so callers pass the untouched body
 * text. Returns false if the webhook secret is unset or the header is missing.
 */
export function verifyWebhookSignature(
  brand: Brand,
  rawBody: string,
  signature: string | null,
): boolean {
  // The secret of the account that RAISED the charge. Once the brands have
  // separate accounts, verifying a Lumi9 webhook against Femi9's secret fails
  // here and the order is silently never marked paid — which is why each brand
  // gets its own webhook endpoint.
  const secret = webhookSecretFor(brand)
  if (!secret || !signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(expected, signature)
}

export interface GatewayRefund {
  id: string
  mock: boolean
}

export interface GatewayPayment {
  id: string
  orderId: string
  amount: number
  status: string
  method?: string
}

/** Read gateway payments for reconciliation. Amount is returned in paise. */
export async function listOrderPayments(brand: Brand, orderId: string): Promise<GatewayPayment[]> {
  if (!isConfigured(brand)) {
    if (!mockProvidersAllowed()) throw new ProviderConfigurationError('Razorpay')
    return []
  }
  const res = await fetch(`${ORDERS_URL}/${encodeURIComponent(orderId)}/payments`, {
    headers: { authorization: basicAuthHeader(brand) },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Razorpay listOrderPayments failed (${res.status}): ${detail}`)
  }
  const data = await res.json() as {
    items?: Array<{ id: string; order_id: string; amount: number; status: string; method?: string }>
  }
  return (data.items ?? []).map((p) => ({
    id: p.id,
    orderId: p.order_id,
    amount: p.amount,
    status: p.status,
    method: p.method,
  }))
}

/**
 * Refund a captured payment (full, or partial when `amountRupees` is given).
 * Configured → real Refunds API; mock → a synthetic refund id, no network call.
 */
export async function refundPayment(brand: Brand, paymentId: string, amountRupees?: number): Promise<GatewayRefund> {
  if (!isConfigured(brand)) {
    if (!mockProvidersAllowed()) throw new ProviderConfigurationError('Razorpay')
    return { id: `mock_refund_${paymentId}`, mock: true }
  }

  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: basicAuthHeader(brand) },
    // Omit the body for a full refund; Razorpay refunds the full amount when no
    // amount is supplied. Partial refunds pass the amount in paise.
    body: amountRupees != null ? JSON.stringify({ amount: Math.round(amountRupees * 100) }) : undefined,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Razorpay refund failed (${res.status}): ${detail}`)
  }
  const data = (await res.json()) as { id: string }
  return { id: data.id, mock: false }
}
