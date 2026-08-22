import { describe, it, expect } from 'vitest'
import { languageHint, contradictsState } from '@/lib/geo/language'

/**
 * The language veto only ever REMOVES a guess, never adds one, so the test that
 * matters most is the one proving it stays quiet: a veto that fires too eagerly
 * costs correct shoppers their zone discount across the whole Hindi belt.
 */
describe('languageHint', () => {
  it('reads a regional language even when English outranks it', () => {
    // en-IN first with Tamil second is an ordinary Indian browser configuration.
    // Ignoring the lower-weighted entries would throw away most of the signal.
    expect(languageHint('en-IN,ta;q=0.9,en;q=0.8')).toMatchObject({ language: 'ta' })
    expect(languageHint('ta-IN,ta;q=0.9')).toMatchObject({ language: 'ta' })
    expect(languageHint('ml-IN')).toMatchObject({ language: 'ml' })
  })

  it('picks the highest-weighted regional language when several are present', () => {
    expect(languageHint('en,kn;q=0.5,ta;q=0.9')).toMatchObject({ language: 'ta' })
    expect(languageHint('en,kn;q=0.9,ta;q=0.5')).toMatchObject({ language: 'kn' })
    expect(languageHint('en-IN,ta;q=0')).toBeNull() // q=0 means "not acceptable"
  })

  it('has no opinion on languages that span many states', () => {
    // `hi` is deliberately absent from the table: listing it would veto correct
    // answers everywhere from Rajasthan to Bihar.
    expect(languageHint('hi-IN,hi;q=0.9,en;q=0.8')).toBeNull()
    expect(languageHint('en-GB,en;q=0.9')).toBeNull()
    expect(languageHint('')).toBeNull()
    expect(languageHint(null)).toBeNull()
  })
})

describe('contradictsState', () => {
  it('fires only when the preference and the detected state disagree', () => {
    const tamil = languageHint('en-IN,ta;q=0.9')
    // The case this exists for: CGNAT placed a Tamil-speaking viewer in Mumbai.
    expect(contradictsState(tamil, 'Maharashtra')).toBe(true)
    expect(contradictsState(tamil, 'Tamil Nadu')).toBe(false)
    expect(contradictsState(tamil, 'Puducherry')).toBe(false) // same home set
    expect(contradictsState(tamil, 'tamil nadu')).toBe(false) // case-insensitive
  })

  it('never fires on missing evidence', () => {
    const tamil = languageHint('ta-IN')
    expect(contradictsState(null, 'Maharashtra')).toBe(false)
    expect(contradictsState(tamil, undefined)).toBe(false)
    expect(contradictsState(languageHint('en-IN'), 'Maharashtra')).toBe(false)
  })
})
