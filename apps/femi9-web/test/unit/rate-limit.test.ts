import { describe, it, expect } from 'vitest'
import { rateLimit } from '@femi9/core/rate-limit'

/**
 * The limiter's store is a module-level in-process Map shared across all tests,
 * so every test uses a DISTINCT key to avoid cross-talk. `now` is passed
 * explicitly (ms) so the fixed window is fully deterministic — no real clock.
 */
describe('rateLimit fixed window', () => {
  it('allows exactly `limit` hits then denies with retryAfterSec > 0', async () => {
    const key = 'test:allow-then-deny'
    const limit = 3
    const windowMs = 10_000
    const now = 1_000_000

    // First `limit` calls are allowed, with remaining counting down.
    const r1 = await rateLimit(key, limit, windowMs, now)
    expect(r1.ok).toBe(true)
    expect(r1.remaining).toBe(2)
    expect(r1.retryAfterSec).toBe(0)

    const r2 = await rateLimit(key, limit, windowMs, now)
    expect(r2.ok).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = await rateLimit(key, limit, windowMs, now)
    expect(r3.ok).toBe(true)
    expect(r3.remaining).toBe(0)

    // The (limit + 1)-th call within the same window is denied.
    const r4 = await rateLimit(key, limit, windowMs, now)
    expect(r4.ok).toBe(false)
    expect(r4.remaining).toBe(0)
    expect(r4.retryAfterSec).toBeGreaterThan(0)
    // resetAt = now + windowMs, so retryAfter ≈ windowMs/1000 seconds.
    expect(r4.retryAfterSec).toBe(10)
  })

  it('resets the counter once `now` advances past the window', async () => {
    const key = 'test:window-reset'
    const limit = 2
    const windowMs = 5_000
    const now = 2_000_000

    // Exhaust the window.
    expect((await rateLimit(key, limit, windowMs, now)).ok).toBe(true)
    expect((await rateLimit(key, limit, windowMs, now)).ok).toBe(true)
    expect((await rateLimit(key, limit, windowMs, now)).ok).toBe(false)

    // Still blocked strictly inside the window.
    expect((await rateLimit(key, limit, windowMs, now + windowMs - 1)).ok).toBe(false)

    // At/after resetAt (now + windowMs) the bucket resets → allowed again, full budget.
    const after = await rateLimit(key, limit, windowMs, now + windowMs)
    expect(after.ok).toBe(true)
    expect(after.remaining).toBe(limit - 1)
    expect(after.retryAfterSec).toBe(0)
  })

  it('tracks each key independently', async () => {
    const windowMs = 10_000
    const now = 3_000_000

    // Exhaust key A (limit 1).
    expect((await rateLimit('test:iso:A', 1, windowMs, now)).ok).toBe(true)
    expect((await rateLimit('test:iso:A', 1, windowMs, now)).ok).toBe(false)

    // A fresh key is unaffected.
    expect((await rateLimit('test:iso:B', 1, windowMs, now)).ok).toBe(true)
  })
})
