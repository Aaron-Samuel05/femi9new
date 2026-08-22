import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import {
  enrollUser,
  sendTharaInvite,
  suppressEmail,
  TharaInviteBadEmailError,
  TharaInviteNotEligibleError,
  TharaInviteSelfError,
  TharaInviteSuppressedError,
} from '@femi9/core/services/thara'
import { renderInviteEmail } from '@femi9/core/thara/invite'

async function activeMember(overrides: { email?: string; name?: string } = {}) {
  const u = await prisma.user.create({
    data: {
      email: overrides.email ?? `m-${Math.random().toString(36).slice(2, 8)}@t.local`,
      name: overrides.name ?? 'Aria',
      role: 'customer',
    },
  })
  const { id } = await enrollUser(u.id, 'v1')
  await prisma.tharaMembership.update({
    where: { id },
    data: { status: 'active', activatedAt: new Date() },
  })
  return u
}

describe('Thara invite (sub-project E)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('renderInviteEmail includes the referrer name, code, and URL', () => {
    const { subject, html, text } = renderInviteEmail({
      referrerName: 'Aria',
      referralCode: 'TARA5578',
      referralUrl: 'https://femi9.in/r/TARA5578',
    })
    expect(subject).toContain('Aria')
    expect(html).toContain('TARA5578')
    expect(html).toContain('https://femi9.in/r/TARA5578')
    expect(text).toContain('TARA5578')
  })

  it('renderInviteEmail falls back to "A friend" when the referrer has no name', () => {
    const { subject, html } = renderInviteEmail({
      referrerName: null,
      referralCode: 'MENA2839',
      referralUrl: 'https://femi9.in/r/MENA2839',
    })
    expect(subject).toContain('A friend')
    expect(html).toContain('A friend')
  })

  it('sendTharaInvite returns { mock: true } in mock mode', async () => {
    const original = process.env.ALLOW_MOCK_PROVIDERS
    process.env.ALLOW_MOCK_PROVIDERS = 'true'
    try {
      const u = await activeMember({ email: 'sender@t.local' })
      const result = await sendTharaInvite(u.id, 'friend@t.local')
      expect(result.mock).toBe(true)
    } finally {
      process.env.ALLOW_MOCK_PROVIDERS = original
    }
  })

  it('rejects a bad email address', async () => {
    const u = await activeMember()
    await expect(sendTharaInvite(u.id, 'not-an-email')).rejects.toBeInstanceOf(
      TharaInviteBadEmailError,
    )
  })

  it('rejects a non-member trying to send an invite', async () => {
    const u = await prisma.user.create({ data: { email: 'never@t.local', role: 'customer' } })
    await expect(sendTharaInvite(u.id, 'friend@t.local')).rejects.toBeInstanceOf(
      TharaInviteNotEligibleError,
    )
  })

  it('rejects a deactivated member', async () => {
    const u = await activeMember()
    await prisma.tharaMembership.update({
      where: { userId: u.id },
      data: { status: 'deactivated', deactivatedAt: new Date() },
    })
    await expect(sendTharaInvite(u.id, 'friend@t.local')).rejects.toBeInstanceOf(
      TharaInviteNotEligibleError,
    )
  })

  it('rejects a self-invite (email matches referrer)', async () => {
    const u = await activeMember({ email: 'me@t.local' })
    await expect(sendTharaInvite(u.id, 'me@t.local')).rejects.toBeInstanceOf(
      TharaInviteSelfError,
    )
    // Case-insensitive too.
    await expect(sendTharaInvite(u.id, 'ME@T.LOCAL')).rejects.toBeInstanceOf(
      TharaInviteSelfError,
    )
  })

  it('rejects a suppressed recipient', async () => {
    const original = process.env.ALLOW_MOCK_PROVIDERS
    process.env.ALLOW_MOCK_PROVIDERS = 'true'
    try {
      const u = await activeMember()
      await suppressEmail('bounced@t.local', 'hard_bounce')
      await expect(sendTharaInvite(u.id, 'bounced@t.local')).rejects.toBeInstanceOf(
        TharaInviteSuppressedError,
      )
    } finally {
      process.env.ALLOW_MOCK_PROVIDERS = original
    }
  })

  it('suppressEmail is idempotent and case-normalising', async () => {
    await suppressEmail('BOUNCE@T.LOCAL', 'hard_bounce')
    await suppressEmail('bounce@t.local', 'complaint') // update reason
    const rows = await prisma.tharaSuppressedEmail.findMany()
    expect(rows.length).toBe(1)
    expect(rows[0].email).toBe('bounce@t.local')
    expect(rows[0].reason).toBe('complaint')
  })
})
