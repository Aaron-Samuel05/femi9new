import { describe, it, expect, afterEach } from 'vitest'
import { isTharaEnabled } from '@femi9/core/thara/feature'

describe('isTharaEnabled', () => {
  const original = process.env.THARA_ENABLED
  afterEach(() => {
    process.env.THARA_ENABLED = original
  })

  it('returns false when env var is unset', () => {
    delete process.env.THARA_ENABLED
    expect(isTharaEnabled()).toBe(false)
  })

  it('returns false when env var is "false"', () => {
    process.env.THARA_ENABLED = 'false'
    expect(isTharaEnabled()).toBe(false)
  })

  it('returns true when env var is exactly "true"', () => {
    process.env.THARA_ENABLED = 'true'
    expect(isTharaEnabled()).toBe(true)
  })

  it('returns false for any other truthy-looking string', () => {
    for (const v of ['1', 'yes', 'on', 'True', 'TRUE']) {
      process.env.THARA_ENABLED = v
      expect(isTharaEnabled(), `for value ${JSON.stringify(v)}`).toBe(false)
    }
  })
})
