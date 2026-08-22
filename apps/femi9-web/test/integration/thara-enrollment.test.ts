import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import {
  enrollUser,
  optOutUser,
  getMembership,
  TharaDeactivatedError,
} from '@/lib/services/thara'

async function makeUser(email = `u-${Math.random().toString(36).slice(2, 8)}@test.local`) {
  return prisma.user.create({ data: { email, role: 'customer' } })
}

describe('Thara enrollment service', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('enrols a fresh user in purchase_pending with a valid referral code', async () => {
    const user = await makeUser()
    const result = await enrollUser(user.id, 'v1')
    expect(result.status).toBe('purchase_pending')
    expect(result.referralCode).toMatch(/^[A-HJ-NP-Z]{4}[2-9]{4}$/)
  })

  it('is idempotent — a second enrol returns the same membership', async () => {
    const user = await makeUser()
    const a = await enrollUser(user.id, 'v1')
    const b = await enrollUser(user.id, 'v1')
    expect(b.id).toBe(a.id)
    expect(b.referralCode).toBe(a.referralCode)
    const rows = await prisma.tharaMembership.count()
    expect(rows).toBe(1)
  })

  it('preserves referral code when opting out and refuses re-enrolment', async () => {
    const user = await makeUser()
    const first = await enrollUser(user.id, 'v1')
    await optOutUser(user.id)
    const m = await getMembership(user.id)
    expect(m?.status).toBe('deactivated')
    expect(m?.referralCode).toBe(first.referralCode)
    await expect(enrollUser(user.id, 'v1')).rejects.toBeInstanceOf(TharaDeactivatedError)
  })

  it('returns null for a non-member', async () => {
    const user = await makeUser()
    expect(await getMembership(user.id)).toBeNull()
  })
})
