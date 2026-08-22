import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  isConfigured,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '@femi9/core/razorpay'

/**
 * The Razorpay gateway env vars are NOT part of the vitest env block, so each
 * test controls them explicitly. We snapshot + clear the three relevant keys
 * before every test (clean "unconfigured" baseline) and restore afterward so no
 * test leaks credentials into another file/test.
 */
const KEYS = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const
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

describe('razorpay verifyPaymentSignature', () => {
  it('returns true for a correctly computed HMAC and false for a wrong one', () => {
    const secret = 'test_key_secret_abc'
    process.env.RAZORPAY_KEY_SECRET = secret
    const orderId = 'order_ABC123'
    const paymentId = 'pay_XYZ789'
    const good = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex')

    expect(verifyPaymentSignature({ orderId, paymentId, signature: good })).toBe(true)

    // Correct length (so timingSafeEqual doesn't short-circuit on size) but wrong bytes.
    const bad = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a')
    expect(verifyPaymentSignature({ orderId, paymentId, signature: bad })).toBe(false)

    // A signature over a DIFFERENT (order|payment) pair must not verify.
    const otherPair = createHmac('sha256', secret).update(`${orderId}|pay_OTHER`).digest('hex')
    expect(verifyPaymentSignature({ orderId, paymentId, signature: otherPair })).toBe(false)
  })

  it('returns false when no key secret is configured', () => {
    // RAZORPAY_KEY_SECRET cleared in beforeEach.
    const anySig = createHmac('sha256', 'whatever').update('order_1|pay_1').digest('hex')
    expect(verifyPaymentSignature({ orderId: 'order_1', paymentId: 'pay_1', signature: anySig })).toBe(false)
  })
})

describe('razorpay verifyWebhookSignature', () => {
  it('returns true for a correct raw-body HMAC and false otherwise', () => {
    const secret = 'test_webhook_secret'
    process.env.RAZORPAY_WEBHOOK_SECRET = secret
    const rawBody = '{"event":"payment.captured","payload":{"id":"pay_1"}}'
    const good = createHmac('sha256', secret).update(rawBody).digest('hex')

    expect(verifyWebhookSignature(rawBody, good)).toBe(true)

    const bad = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a')
    expect(verifyWebhookSignature(rawBody, bad)).toBe(false)

    // A signature computed over different bytes must not verify against rawBody.
    const otherBody = createHmac('sha256', secret).update('{"tampered":true}').digest('hex')
    expect(verifyWebhookSignature(rawBody, otherBody)).toBe(false)

    // Missing header → false.
    expect(verifyWebhookSignature(rawBody, null)).toBe(false)
  })

  it('returns false when the webhook secret is unset', () => {
    const rawBody = '{}'
    const sig = createHmac('sha256', 'x').update(rawBody).digest('hex')
    expect(verifyWebhookSignature(rawBody, sig)).toBe(false)
  })
})

describe('razorpay isConfigured', () => {
  it('reflects presence of BOTH credential halves', () => {
    expect(isConfigured()).toBe(false) // both cleared

    process.env.RAZORPAY_KEY_ID = 'rzp_test_id'
    expect(isConfigured()).toBe(false) // only id → still unset

    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
    expect(isConfigured()).toBe(true) // both present

    delete process.env.RAZORPAY_KEY_ID
    expect(isConfigured()).toBe(false) // only secret → unset
  })
})

describe('razorpay createOrder (mock mode)', () => {
  it('returns a deterministic mock order without a network call when unconfigured', async () => {
    // Unconfigured baseline from beforeEach.
    const order = await createOrder({ amountRupees: 499, receipt: 'FM-00042' })
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
        createOrder({ amountRupees: 499, receipt: 'FM-PROD' }),
      ).rejects.toThrow('Razorpay is not configured')
    } finally {
      if (previous === undefined) delete mutableEnv.NODE_ENV
      else mutableEnv.NODE_ENV = previous
    }
  })
})
