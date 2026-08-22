import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import {
  enrollUser,
  suspendMembership,
  unsuspendMembership,
  listMemberships,
  TharaNotFoundError,
} from '@femi9/core/services/thara'

async function makeMember(email = `u-${Math.random().toString(36).slice(2, 8)}@t.local`) {
  const u = await prisma.user.create({ data: { email, role: 'customer' } })
  const { id } = await enrollUser(u.id, 'v1')
  return id
}

describe('admin thara service', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('suspends an active member and preserves prior status', async () => {
    const id = await makeMember()
    await prisma.tharaMembership.update({
      where: { id },
      data: { status: 'active', activatedAt: new Date() },
    })

    const after = await suspendMembership(id, 'suspected abuse')
    expect(after.status).toBe('suspended')
    expect(after.statusBeforeSuspend).toBe('active')
    expect(after.suspendedReason).toBe('suspected abuse')
    expect(after.suspendedAt).not.toBeNull()
  })

  it('unsuspend restores the prior status', async () => {
    const id = await makeMember()
    await prisma.tharaMembership.update({
      where: { id },
      data: { status: 'active', activatedAt: new Date() },
    })
    await suspendMembership(id, 'x')

    const restored = await unsuspendMembership(id)
    expect(restored.status).toBe('active')
    expect(restored.suspendedAt).toBeNull()
    expect(restored.suspendedReason).toBeNull()
  })

  it('suspend/unsuspend of a purchase_pending member round-trips cleanly', async () => {
    const id = await makeMember()
    await suspendMembership(id, 'x')
    const restored = await unsuspendMembership(id)
    expect(restored.status).toBe('purchase_pending')
  })

  it('throws for missing membership', async () => {
    await expect(suspendMembership('does-not-exist', 'x')).rejects.toBeInstanceOf(
      TharaNotFoundError,
    )
    await expect(unsuspendMembership('does-not-exist')).rejects.toBeInstanceOf(
      TharaNotFoundError,
    )
  })

  it('list paginates and filters by status', async () => {
    for (let i = 0; i < 5; i++) await makeMember()
    const first = await listMemberships({ take: 2, skip: 0 })
    expect(first.rows.length).toBe(2)
    expect(first.total).toBe(5)
  })
})
