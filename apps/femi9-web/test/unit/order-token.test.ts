import { describe, it, expect } from 'vitest'
import { orderToken, verifyOrderToken } from '@/lib/order-token'

/**
 * Thorough coverage of the order-confirmation capability token (the sanity test
 * has the smoke version). The token is base64url(HMAC-SHA256(orderNo,
 * AUTH_SECRET)); AUTH_SECRET is supplied by the vitest env block.
 *
 * These guard the IDOR fix: only the exact token for a given orderNo may pass,
 * so an attacker enumerating order numbers can't unlock another order's PII.
 */
describe('order-token', () => {
  it('round-trips: the token for an orderNo verifies against that orderNo', () => {
    const orderNo = 'FM-00001'
    const token = orderToken(orderNo)
    expect(verifyOrderToken(orderNo, token)).toBe(true)
  })

  it('is deterministic (same input → same token) and base64url-shaped', () => {
    expect(orderToken('FM-12345')).toBe(orderToken('FM-12345'))
    // base64url alphabet only: no +, /, or = padding.
    expect(orderToken('FM-12345')).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('rejects the token when the orderNo differs', () => {
    const token = orderToken('FM-00001')
    expect(verifyOrderToken('FM-00002', token)).toBe(false)
    // Even a subtle change (adjacent sequential number) must fail.
    expect(verifyOrderToken('FM-00010', orderToken('FM-00011'))).toBe(false)
  })

  it('rejects a tampered token of the same length', () => {
    const orderNo = 'FM-00777'
    const token = orderToken(orderNo)
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect(tampered).not.toBe(token)
    expect(tampered.length).toBe(token.length)
    expect(verifyOrderToken(orderNo, tampered)).toBe(false)
  })

  it('rejects missing, empty, and wrong-length tokens', () => {
    const orderNo = 'FM-00001'
    expect(verifyOrderToken(orderNo, null)).toBe(false)
    expect(verifyOrderToken(orderNo, undefined)).toBe(false)
    expect(verifyOrderToken(orderNo, '')).toBe(false)
    expect(verifyOrderToken(orderNo, 'short')).toBe(false)
    expect(verifyOrderToken(orderNo, orderToken(orderNo) + 'extra')).toBe(false)
  })

  it('does not accept one order\'s token for another (no token reuse)', () => {
    const a = orderToken('FM-10000')
    const b = orderToken('FM-20000')
    expect(a).not.toBe(b)
    expect(verifyOrderToken('FM-20000', a)).toBe(false)
    expect(verifyOrderToken('FM-10000', b)).toBe(false)
  })
})
