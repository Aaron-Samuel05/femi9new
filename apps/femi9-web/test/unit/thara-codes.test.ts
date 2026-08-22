import { describe, it, expect } from 'vitest'
import {
  generateReferralCode,
  normalizeReferralCode,
  LETTER_ALPHABET,
  DIGIT_ALPHABET,
} from '@femi9/core/thara/codes'

describe('generateReferralCode', () => {
  it('emits an 8-char code: 4 letters + 4 digits', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode()
      expect(code).toMatch(/^[A-Z]{4}[0-9]{4}$/)
    }
  })

  it('uses only the ambiguous-char-free alphabets', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode()
      for (const ch of code.slice(0, 4)) expect(LETTER_ALPHABET).toContain(ch)
      for (const ch of code.slice(4)) expect(DIGIT_ALPHABET).toContain(ch)
    }
  })

  it('has very low collision rate across 10 000 samples', () => {
    const SAMPLES = 10_000
    const set = new Set<string>()
    for (let i = 0; i < SAMPLES; i++) set.add(generateReferralCode())

    // Demanding ZERO duplicates was a coin-flip on a long enough timeline: the
    // keyspace is 23^4 * 8^4 ≈ 1.15e9, so the birthday paradox puts the chance
    // of at least one collision in 10 000 draws at ~4.3% — about one CI run in
    // 23. The property worth pinning is the one in this test's name. The mean
    // number of collisions is ~0.04, so a budget of 10 is ~230x headroom and
    // effectively never trips by chance, while a generator that lost its
    // entropy would blow straight through it.
    expect(set.size).toBeGreaterThanOrEqual(SAMPLES - 10)
  })
})

describe('normalizeReferralCode', () => {
  it('uppers and strips whitespace', () => {
    expect(normalizeReferralCode('  tara5578 ')).toBe('TARA5578')
  })

  it('accepts codes made of the valid alphabets only', () => {
    expect(normalizeReferralCode('TARA5578')).toBe('TARA5578')
    expect(normalizeReferralCode('MENA2839')).toBe('MENA2839')
  })

  it('rejects codes containing ambiguous letters or digits', () => {
    expect(normalizeReferralCode('TILA5578')).toBeNull() // I
    expect(normalizeReferralCode('TOKA5578')).toBeNull() // O
    expect(normalizeReferralCode('TALA5578')).toBeNull() // L
    expect(normalizeReferralCode('TARA5570')).toBeNull() // 0
    expect(normalizeReferralCode('TARA5571')).toBeNull() // 1
  })

  it('rejects codes of the wrong length or shape', () => {
    expect(normalizeReferralCode('TARA557')).toBeNull()
    expect(normalizeReferralCode('TARA55789')).toBeNull()
    expect(normalizeReferralCode('TAR55789')).toBeNull()
    expect(normalizeReferralCode('TARA55A9')).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
  })
})
