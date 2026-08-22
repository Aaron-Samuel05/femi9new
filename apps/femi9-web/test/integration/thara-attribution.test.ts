import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import { enrollUser, attributeReferralIfPresent } from '@/lib/services/thara'
import { signTharaRefCookie } from '@/lib/thara/cookies'

async function makeUser(overrides: { email?: string; phone?: string } = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `u-${Math.random().toString(36).slice(2, 8)}@t.local`,
      phone: overrides.phone,
      role: 'customer',
    },
  })
}

async function ctxOf(referrerMembershipId: string) {
  return {
    cookieToken: await signTharaRefCookie(referrerMembershipId),
    ip: '127.0.0.1',
    ua: 'test-agent',
  }
}

describe('attributeReferralIfPresent', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('attaches a TharaReferral when everything checks out', async () => {
    const referrerUser = await makeUser({ email: 'r@t.local', phone: '9999900001' })
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    const referred = await makeUser({ email: 'f@t.local', phone: '9999900002' })

    const result = await attributeReferralIfPresent(referred, await ctxOf(refMemId))
    expect(result.attributed).toBe(true)
    const row = await prisma.tharaReferral.findUnique({
      where: { referredUserId: referred.id },
    })
    expect(row?.referrerId).toBe(refMemId)
    expect(row?.invitedByLink).toBe(true)
    expect(row?.lockedAt).toBeNull()
  })

  it('rejects self-referral', async () => {
    const u = await makeUser({ email: 's@t.local' })
    const { id: refMemId } = await enrollUser(u.id, 'v1')
    const result = await attributeReferralIfPresent(u, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'self-referral' })
    expect(await prisma.tharaReferral.count()).toBe(0)
  })

  it('rejects when the referred and referrer share an email (dup account)', async () => {
    const referrerUser = await makeUser({ email: 'dup-shared@t.local' })
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    // Simulate a would-be duplicate: same email, different user id.
    const impostor = { ...referrerUser, id: 'fake-user-id' }
    const result = await attributeReferralIfPresent(impostor, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'dup-email' })
  })

  it('rejects when the referred and referrer share a phone (dup account)', async () => {
    const referrerUser = await makeUser({ email: 'ref-phone@t.local', phone: '9999900010' })
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    const referred = await makeUser({ email: 'other-phone@t.local', phone: '9999900011' })
    // Force phone equality to exercise the guard.
    const referredForced = { ...referred, phone: '9999900010' }
    const result = await attributeReferralIfPresent(referredForced, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'dup-phone' })
  })

  it('rejects when the referrer is suspended', async () => {
    const referrerUser = await makeUser()
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    await prisma.tharaMembership.update({
      where: { id: refMemId },
      data: { status: 'suspended', suspendedAt: new Date() },
    })
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'referrer-not-eligible' })
  })

  it('rejects when the referrer is deactivated', async () => {
    const referrerUser = await makeUser()
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    await prisma.tharaMembership.update({
      where: { id: refMemId },
      data: { status: 'deactivated', deactivatedAt: new Date() },
    })
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'referrer-not-eligible' })
  })

  it('no-ops when the cookie is missing', async () => {
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, {
      cookieToken: null,
      ip: null,
      ua: null,
    })
    expect(result).toEqual({ attributed: false, reason: 'no-cookie' })
  })

  it('no-ops on a tampered cookie', async () => {
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, {
      cookieToken: 'not-a-jwt',
      ip: null,
      ua: null,
    })
    expect(result).toEqual({ attributed: false, reason: 'bad-cookie' })
  })

  it('refuses a second referrer for the same user (one-referrer-per-user)', async () => {
    const r1User = await makeUser()
    const r2User = await makeUser()
    const { id: r1Mem } = await enrollUser(r1User.id, 'v1')
    const { id: r2Mem } = await enrollUser(r2User.id, 'v1')
    const referred = await makeUser()
    await attributeReferralIfPresent(referred, await ctxOf(r1Mem))
    const result = await attributeReferralIfPresent(referred, await ctxOf(r2Mem))
    expect(result).toEqual({ attributed: false, reason: 'already-attributed' })
  })
})
