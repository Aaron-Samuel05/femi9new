import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  isConfigured,
  createOrder,
  publicKeyId,
  refundPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
  GatewayNotExecutedError,
} from '@femi9/core/razorpay'

/**
 * The Razorpay gateway env vars are NOT part of the vitest env block, so each
 * test controls them explicitly. We snapshot + clear the three relevant keys
 * before every test (clean "unconfigured" baseline) and restore afterward so no
 * test leaks credentials into another file/test.
 */
const KEYS = [
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID',
  'NEXT_PUBLIC_RAZORPAY_KEY_ID_FEMI9',
] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

/**
 * The key id the browser gets.
 *
 * `RAZORPAY_KEY_ID` and `NEXT_PUBLIC_RAZORPAY_KEY_ID` hold the SAME value —
 * Razorpay issues one key_id/key_secret pair and the key id is the public half.
 * The two names exist so the code handing a value to the client can only read a
 * NEXT_PUBLIC_-prefixed one, never the secret. Because they are the same value,
 * a deployment that sets one and forgets the other must still work: an empty
 * key reaches Checkout as a blank merchant id, the sheet never opens, and
 * nothing server-side reports a thing.
 */
describe('razorpay publicKeyId', () => {
  it('prefers the NEXT_PUBLIC_ value when it is set', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_server'
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'rzp_test_public'
    expect(publicKeyId('femi9')).toBe('rzp_test_public')
  })

  it('falls back to RAZORPAY_KEY_ID rather than handing Checkout an empty key', () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_server'
    expect(publicKeyId('femi9')).toBe('rzp_test_server')
  })

  it('treats a TODO- placeholder as unset on both names', () => {
    // Terraform seeds placeholders; a half-configured stack must read as
    // unconfigured rather than shipping "TODO-..." to the payment sheet.
    process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = 'TODO-change-me'
    process.env.RAZORPAY_KEY_ID = 'TODO-rzp_live_xxxxxxxx'
    expect(publicKeyId('femi9')).toBe('')
  })

  it('is empty when nothing is configured at all', () => {
    expect(publicKeyId('femi9')).toBe('')
  })
})

describe('razorpay verifyPaymentSignature', () => {
  it('returns true for a correctly computed HMAC and false for a wrong one', () => {
    const secret = 'test_key_secret_abc'
    process.env.RAZORPAY_KEY_SECRET = secret
    const orderId = 'order_ABC123'
    const paymentId = 'pay_XYZ789'
    const good = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')

    expect(verifyPaymentSignature('femi9', { orderId, paymentId, signature: good })).toBe(true)

    // Correct length (so timingSafeEqual doesn't short-circuit on size) but wrong bytes.
    const bad = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a')
    expect(verifyPaymentSignature('femi9', { orderId, paymentId, signature: bad })).toBe(false)

    // A signature over a DIFFERENT (order|payment) pair must not verify.
    const otherPair = createHmac('sha256', secret).update(`${orderId}|pay_OTHER`).digest('hex')
    expect(verifyPaymentSignature('femi9', { orderId, paymentId, signature: otherPair })).toBe(false)
  })

  it('returns false when no key secret is configured', () => {
    // RAZORPAY_KEY_SECRET cleared in beforeEach.
    const anySig = createHmac('sha256', 'whatever').update('order_1|pay_1').digest('hex')
    expect(verifyPaymentSignature('femi9', { orderId: 'order_1', paymentId: 'pay_1', signature: anySig })).toBe(false)
  })
})

describe('razorpay verifyWebhookSignature', () => {
  it('returns true for a correct raw-body HMAC and false otherwise', () => {
    const secret = 'test_webhook_secret'
    process.env.RAZORPAY_WEBHOOK_SECRET = secret
    const rawBody = '{"event":"payment.captured","payload":{"id":"pay_1"}}'
    const good = createHmac('sha256', secret).update(rawBody).digest('hex')

    expect(verifyWebhookSignature('femi9', rawBody, good)).toBe(true)

    const bad = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a')
    expect(verifyWebhookSignature('femi9', rawBody, bad)).toBe(false)

    // A signature computed over different bytes must not verify against rawBody.
    const otherBody = createHmac('sha256', secret).update('{"tampered":true}').digest('hex')
    expect(verifyWebhookSignature('femi9', rawBody, otherBody)).toBe(false)

    // Missing header → false.
    expect(verifyWebhookSignature('femi9', rawBody, null)).toBe(false)
  })

  it('returns false when the webhook secret is unset', () => {
    const rawBody = '{}'
    const sig = createHmac('sha256', 'x').update(rawBody).digest('hex')
    expect(verifyWebhookSignature('femi9', rawBody, sig)).toBe(false)
  })
})

describe('razorpay isConfigured', () => {
  it('reflects presence of BOTH credential halves', () => {
    expect(isConfigured('femi9')).toBe(false) // both cleared

    process.env.RAZORPAY_KEY_ID = 'rzp_test_id'
    expect(isConfigured('femi9')).toBe(false) // only id → still unset

    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
    expect(isConfigured('femi9')).toBe(true) // both present

    delete process.env.RAZORPAY_KEY_ID
    expect(isConfigured('femi9')).toBe(false) // only secret → unset
  })
})

describe('razorpay createOrder (mock mode)', () => {
  it('returns a deterministic mock order without a network call when unconfigured', async () => {
    // Unconfigured baseline from beforeEach.
    const order = await createOrder('femi9', { amountRupees: 499, receipt: 'FM-00042' })
    expect(order.mock).toBe(true)
    expect(order.id).toBe('mock_FM-00042')
    expect(order.amount).toBe(49900) // rupees → paise
  })

  it('fails closed when credentials are missing in production', async () => {
    const previous = process.env.NODE_ENV
    const mutableEnv = process.env as Record<string, string | undefined>
    mutableEnv.NODE_ENV = 'production'
    try {
      await expect(
        createOrder('femi9', { amountRupees: 499, receipt: 'FM-PROD' }),
      ).rejects.toThrow('Razorpay is not configured')
    } finally {
      if (previous === undefined) delete mutableEnv.NODE_ENV
      else mutableEnv.NODE_ENV = previous
    }
  })
})
/**
 * Refund idempotency.
 *
 * Razorpay's Refunds API has no idempotency key, and a refund is the one call
 * in this module that moves money OUT. An ambiguous failure — a timeout, a
 * dropped socket, a 502 — leaves the caller unable to tell "never happened"
 * from "happened, reply lost", and retrying the wrong guess pays the customer
 * twice out of the merchant's own balance. So refundPayment reads what already
 * exists against the payment before it creates anything.
 */
describe('razorpay refundPayment idempotency', () => {
  const realFetch = globalThis.fetch

  function configure() {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
  }

  /** Stub fetch with a per-URL handler and record every call made. */
  function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
    const calls: Array<{ url: string; method: string }> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: (init?.method ?? 'GET').toUpperCase() })
      const result = handler(url, init) as { status?: number; body?: unknown }
      const status = result.status ?? 200
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => result.body,
        text: async () => JSON.stringify(result.body ?? ''),
      }
    }) as typeof globalThis.fetch
    return calls
  }

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('creates a refund when the payment has none', async () => {
    configure()
    const calls = stubFetch((url) => {
      if (url.endsWith('/refunds')) return { body: { items: [] } }
      return { body: { id: 'rfnd_new' } }
    })

    const refund = await refundPayment('femi9', 'pay_1', 500)
    expect(refund.id).toBe('rfnd_new')
    expect(refund.adopted).toBe(false)

    // Read first, then write — never a blind create.
    expect(calls[0].url).toContain('/payments/pay_1/refunds')
    expect(calls[0].method).toBe('GET')
    expect(calls[1].url).toContain('/payments/pay_1/refund')
    expect(calls[1].method).toBe('POST')
  })

  it('ADOPTS an existing refund instead of returning the money twice', async () => {
    configure()
    // The state left behind by a refund that succeeded at Razorpay while our
    // side timed out: the money is already back with the customer.
    const calls = stubFetch((url) => {
      if (url.endsWith('/refunds')) return { body: { items: [{ id: 'rfnd_prior', amount: 50000 }] } }
      throw new Error('must not create a second refund')
    })

    const refund = await refundPayment('femi9', 'pay_1', 500)
    expect(refund.adopted).toBe(true)
    expect(refund.id).toBe('rfnd_prior')

    // Exactly one call, and it was the read.
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('GET')
  })

  it('refuses rather than topping up when existing refunds fall short', async () => {
    configure()
    stubFetch((url) => {
      if (url.endsWith('/refunds')) return { body: { items: [{ id: 'rfnd_partial', amount: 20000 }] } }
      throw new Error('must not create a second refund')
    })

    // A partial-refund history this console never creates means something else
    // touched the payment; topping it up automatically could over-refund.
    await expect(refundPayment('femi9', 'pay_1', 500)).rejects.toThrow(/already has 1 refund/)
  })

  it('classifies a 4xx as definitively not executed, and a 5xx as ambiguous', async () => {
    configure()
    stubFetch((url) => {
      if (url.endsWith('/refunds')) return { body: { items: [] } }
      return { status: 400, body: { error: 'bad request' } }
    })
    await expect(refundPayment('femi9', 'pay_1', 500)).rejects.toBeInstanceOf(GatewayNotExecutedError)

    stubFetch((url) => {
      if (url.endsWith('/refunds')) return { body: { items: [] } }
      return { status: 502, body: { error: 'bad gateway' } }
    })
    const err = await refundPayment('femi9', 'pay_1', 500).catch((e) => e)
    expect(err).toBeInstanceOf(Error)
    // NOT GatewayNotExecutedError: a 502 cannot rule out that the refund ran.
    expect(err).not.toBeInstanceOf(GatewayNotExecutedError)
  })

  it('makes no network call at all in mock mode', async () => {
    // Unconfigured baseline from the outer beforeEach.
    const calls = stubFetch(() => {
      throw new Error('mock mode must not touch the network')
    })
    const refund = await refundPayment('femi9', 'pay_1', 500)
    expect(refund.mock).toBe(true)
    expect(refund.adopted).toBe(false)
    expect(calls).toHaveLength(0)
  })
})
