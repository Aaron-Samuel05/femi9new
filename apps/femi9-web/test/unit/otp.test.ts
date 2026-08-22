import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  generateCode,
  generateToken,
  hashCode,
  smsConfigured,
  emailConfigured,
  sendMagicLink,
  sendSms,
} from '@femi9/core/otp'

/**
 * The provider env vars are not part of the vitest env block; snapshot + clear
 * before each test and restore after so a set key never leaks across tests.
 */
const KEYS = ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID', 'RESEND_API_KEY', 'EMAIL_FROM'] as const
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

describe('otp generateCode', () => {
  it('is always a 6-digit numeric string, including leading zeros', () => {
    // Many iterations so the padStart / leading-zero path is exercised.
    for (let i = 0; i < 2000; i++) {
      const code = generateCode()
      expect(code).toMatch(/^\d{6}$/)
      expect(code.length).toBe(6)
    }
  })
})

describe('otp generateToken', () => {
  it('is 64 hex chars (32 random bytes) and effectively unique per call', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })
})

describe('otp hashCode', () => {
  it('is deterministic for the same input', () => {
    expect(hashCode('123456')).toBe(hashCode('123456'))
  })

  it('differs for different inputs and is a 64-char sha256 hex digest', () => {
    const h1 = hashCode('123456')
    const h2 = hashCode('123457')
    expect(h1).not.toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
    // Distinct 6-digit codes must not collide on their stored hash.
    expect(hashCode('000000')).not.toBe(hashCode('000001'))
  })
})

describe('otp provider configuration flags', () => {
  it('smsConfigured requires a real MSG91 key and template', () => {
    expect(smsConfigured()).toBe(false)
    process.env.MSG91_AUTH_KEY = 'msg91-key'
    expect(smsConfigured()).toBe(false)
    process.env.MSG91_TEMPLATE_ID = 'template-id'
    expect(smsConfigured()).toBe(true)
    process.env.MSG91_AUTH_KEY = 'TODO-change-me'
    expect(smsConfigured()).toBe(false)
  })

  it('emailConfigured requires a real Resend key and verified sender', () => {
    expect(emailConfigured()).toBe(false)
    process.env.RESEND_API_KEY = 're_test_key'
    expect(emailConfigured()).toBe(false)
    process.env.EMAIL_FROM = 'Femi9 <login@example.test>'
    expect(emailConfigured()).toBe(true)
    process.env.RESEND_API_KEY = 'TODO-re_xxxxx'
    expect(emailConfigured()).toBe(false)
  })

  it('never returns authentication secrets from mock providers in production', async () => {
    const previous = process.env.NODE_ENV
    const mutableEnv = process.env as Record<string, string | undefined>
    mutableEnv.NODE_ENV = 'production'
    try {
      await expect(sendSms('9999999999', '123456')).rejects.toThrow('MSG91 is not configured')
      await expect(sendMagicLink('a@example.test', 'https://example.test/link')).rejects.toThrow(
        'Resend is not configured',
      )
    } finally {
      if (previous === undefined) delete mutableEnv.NODE_ENV
      else mutableEnv.NODE_ENV = previous
    }
  })
})
