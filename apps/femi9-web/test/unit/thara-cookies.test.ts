import { describe, it, expect } from 'vitest'
import {
  signTharaRefCookie,
  verifyTharaRefCookie,
  THARA_REF_COOKIE,
  THARA_REF_COOKIE_MAX_AGE,
} from '@femi9/core/thara/cookies'

describe('thara ref cookie', () => {
  it('signs and verifies a round-trip', async () => {
    const token = await signTharaRefCookie('mem_abc123')
    const claim = await verifyTharaRefCookie(token)
    expect(claim).toEqual({ referrerMembershipId: 'mem_abc123' })
  })

  it('rejects a tampered token', async () => {
    const token = await signTharaRefCookie('mem_abc123')
    const tampered = token.slice(0, -2) + 'xx'
    expect(await verifyTharaRefCookie(tampered)).toBeNull()
  })

  it('rejects an obvious garbage string', async () => {
    expect(await verifyTharaRefCookie('not-a-jwt')).toBeNull()
    expect(await verifyTharaRefCookie('')).toBeNull()
  })

  it('exposes the expected cookie name and TTL', () => {
    expect(THARA_REF_COOKIE).toBe('femi9_thara_ref')
    expect(THARA_REF_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60)
  })
})
