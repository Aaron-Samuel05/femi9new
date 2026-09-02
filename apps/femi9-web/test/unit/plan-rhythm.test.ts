import { describe, it, expect } from 'vitest'
import {
  rhythmForDays,
  planFingerprint,
  UnsupportedCadenceError,
} from '@femi9/core/services/subscription-plans'

/**
 * A cadence is stored in DAYS; Razorpay bills on a period + interval. This
 * mapping is what turns one into the other, and it decides how often a
 * customer's bank is actually debited — so it is worth pinning exactly.
 */
describe('rhythmForDays', () => {
  it('expresses whole weeks as weekly plans', () => {
    // What the customer was shown is "every 4 weeks", and that is what her bank
    // statement should say too.
    expect(rhythmForDays(28)).toEqual({ period: 'weekly', interval: 4 })
    expect(rhythmForDays(42)).toEqual({ period: 'weekly', interval: 6 })
    expect(rhythmForDays(14)).toEqual({ period: 'weekly', interval: 2 })
    expect(rhythmForDays(7)).toEqual({ period: 'weekly', interval: 1 })
  })

  it('falls back to a daily interval for a cadence that is not whole weeks', () => {
    // Femi9's `cycle` cadence is 25 days and has no weekly form. Daily×25 is
    // exact; rounding it to 4 weeks would move every delivery by three days.
    expect(rhythmForDays(25)).toEqual({ period: 'daily', interval: 25 })
    expect(rhythmForDays(30)).toEqual({ period: 'daily', interval: 30 })
  })

  it('never produces a monthly plan', () => {
    // A monthly plan bills on a CALENDAR DATE, so a 28-day refill mapped to
    // "monthly" drifts against the rhythm the customer was promised — by up to
    // three days every cycle, compounding.
    for (const days of [7, 14, 25, 28, 30, 42, 60, 90]) {
      expect(rhythmForDays(days).period).not.toBe('monthly')
    }
  })

  it('rejects a cadence it cannot express rather than guessing', () => {
    // A misconfigured Cadence row must fail at subscribe time, not become a
    // mandate that debits on a rhythm nobody intended.
    expect(() => rhythmForDays(0)).toThrow(UnsupportedCadenceError)
    expect(() => rhythmForDays(-7)).toThrow(UnsupportedCadenceError)
    expect(() => rhythmForDays(2.5)).toThrow(UnsupportedCadenceError)
    expect(() => rhythmForDays(400)).toThrow(UnsupportedCadenceError)
  })
})

describe('planFingerprint', () => {
  it('is the same for the same amount and rhythm, and different otherwise', () => {
    const weekly4 = { period: 'weekly', interval: 4 } as const
    // The cache key that stops a plan being created per subscribe click.
    expect(planFingerprint(weekly4, 729)).toBe(planFingerprint(weekly4, 729))
    expect(planFingerprint(weekly4, 729)).not.toBe(planFingerprint(weekly4, 730))
    expect(planFingerprint(weekly4, 729)).not.toBe(
      planFingerprint({ period: 'daily', interval: 28 }, 729),
    )
  })

  it('does not collide across period and interval boundaries', () => {
    // "weekly:4:729" vs "weekly:47:29" — a delimiter-free key would make these
    // the same string and bill a customer eleven times too rarely.
    expect(planFingerprint({ period: 'weekly', interval: 4 }, 729)).not.toBe(
      planFingerprint({ period: 'weekly', interval: 47 }, 29),
    )
  })
})
