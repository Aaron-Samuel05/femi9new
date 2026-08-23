import { describe, it, expect } from 'vitest'
import {
  createSession as createAdminSession,
  verifySession as verifyAdminSession,
} from '@femi9/core/admin-auth'
import {
  createSession as createCustomerSession,
  verifySession as verifyCustomerSession,
} from '@femi9/core/auth'

/**
 * CRITICAL security invariant: admin and customer sessions live in separate
 * audiences ('femi9-admin' vs 'femi9-customer') even though both are HS256 JWTs
 * signed with the SAME AUTH_SECRET. A valid signature is therefore NOT enough —
 * a token minted for one side must be rejected by the other's verifier.
 *
 * The same now holds ACROSS BRANDS: a Lumi9 shopper's token carries audience
 * 'lumi9-customer' and must be refused by Femi9's verifier, and the reverse.
 * Both brands sign with the same secret, so the audience is the only thing
 * standing between them — see the third test.
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
    const asCustomer = await verifyCustomerSession('femi9', token)
    expect(asCustomer).toBeNull()
  })

  it('customer token: accepted by customer verify, rejected by admin verify', async () => {
    const token = await createCustomerSession('femi9', {
      sub: 'user-9',
      phone: '9876543210',
      email: 'shopper@example.com',
      name: 'Shopper',
    })

    const asCustomer = await verifyCustomerSession('femi9', token)
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
    expect(await verifyCustomerSession('femi9', tampered)).toBeNull()

    for (const garbage of ['', 'not-a-jwt', 'a.b.c', 'x'.repeat(40)]) {
      expect(await verifyAdminSession(garbage)).toBeNull()
      expect(await verifyCustomerSession('femi9', garbage)).toBeNull()
    }
  })

  it('customer token is bound to ONE brand: Femi9 accepts it, Lumi9 refuses it', async () => {
    const femi9Token = await createCustomerSession('femi9', { sub: 'user-9', name: 'Shopper' })
    const lumi9Token = await createCustomerSession('lumi9', { sub: 'user-9', name: 'Shopper' })

    // Each verifies under its own brand …
    expect(await verifyCustomerSession('femi9', femi9Token)).not.toBeNull()
    expect(await verifyCustomerSession('lumi9', lumi9Token)).not.toBeNull()

    // … and NOT under the other's, despite the identical secret and claims.
    expect(await verifyCustomerSession('lumi9', femi9Token)).toBeNull()
    expect(await verifyCustomerSession('femi9', lumi9Token)).toBeNull()
  })
})
