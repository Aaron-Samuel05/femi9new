import { describe, it, expect } from 'vitest'
import {
  createSession as createAdminSession,
  verifySession as verifyAdminSession,
} from '@/lib/admin-auth'
import {
  createSession as createCustomerSession,
  verifySession as verifyCustomerSession,
} from '@/lib/auth'

/**
 * CRITICAL security invariant: admin and customer sessions live in separate
 * audiences ('femi9-admin' vs 'femi9-customer') even though both are HS256 JWTs
 * signed with the SAME AUTH_SECRET. A valid signature is therefore NOT enough —
 * a token minted for one side must be rejected by the other's verifier.
 *
 * If the `audience:` guard were dropped from either verifySession, the
 * cross-audience assertions below would start returning a session instead of
 * null and these tests would fail — which is exactly the regression they exist
 * to catch. (Both tokens carry sub+email+name so the rejection can ONLY be the
 * audience check, not a missing-claim guard.)
 */
describe('auth session audience separation', () => {
  it('admin token: accepted by admin verify, rejected by customer verify', async () => {
    const token = await createAdminSession({
      sub: 'admin-1',
      email: 'admin@femi9.in',
      name: 'Ops Admin',
    })

    const asAdmin = await verifyAdminSession(token)
    expect(asAdmin).not.toBeNull()
    expect(asAdmin).toEqual({ sub: 'admin-1', email: 'admin@femi9.in', name: 'Ops Admin' })

    // Same signature, wrong audience → must be refused by the customer verifier.
    const asCustomer = await verifyCustomerSession(token)
    expect(asCustomer).toBeNull()
  })

  it('customer token: accepted by customer verify, rejected by admin verify', async () => {
    const token = await createCustomerSession({
      sub: 'user-9',
      phone: '9876543210',
      email: 'shopper@example.com',
      name: 'Shopper',
    })

    const asCustomer = await verifyCustomerSession(token)
    expect(asCustomer).not.toBeNull()
    expect(asCustomer?.sub).toBe('user-9')
    expect(asCustomer?.email).toBe('shopper@example.com')

    // Carries sub+email+name, so the ONLY thing that can reject it here is the
    // 'femi9-admin' audience requirement.
    const asAdmin = await verifyAdminSession(token)
    expect(asAdmin).toBeNull()
  })

  it('tampered and garbage tokens return null from both verifiers', async () => {
    const token = await createAdminSession({
      sub: 'admin-2',
      email: 'a@b.c',
      name: 'A',
    })
    // Flip the FIRST char of the signature segment to break the HMAC. (The last
    // base64url char of a 32-byte digest only carries padding bits, so flipping
    // it can leave the decoded bytes unchanged — the first char is meaningful.)
    const parts = token.split('.')
    parts[2] = (parts[2]![0] === 'A' ? 'B' : 'A') + parts[2]!.slice(1)
    const tampered = parts.join('.')

    expect(await verifyAdminSession(tampered)).toBeNull()
    expect(await verifyCustomerSession(tampered)).toBeNull()

    for (const garbage of ['', 'not-a-jwt', 'a.b.c', 'x'.repeat(40)]) {
      expect(await verifyAdminSession(garbage)).toBeNull()
      expect(await verifyCustomerSession(garbage)).toBeNull()
    }
  })
})
