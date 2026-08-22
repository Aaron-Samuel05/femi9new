import { describe, it, expect, beforeEach } from 'vitest'
import { prisma, resetDb } from '../helpers/db'
import {
  attachIdentity,
  IdentityConflictError,
  assertIdentityFree,
} from '@femi9/core/services/auth'
import {
  missingProfileFields,
  isProfileComplete,
  getProfileStatus,
  toAccountUser,
  deleteAddress,
  updateProfile,
} from '@femi9/core/services/account'

/**
 * attachIdentity is the ONLY writer of User.email / User.phone outside
 * verifyOtp's own create, and it exists because both columns are @unique while
 * every signup path fills in exactly one of them. The four branches below are
 * the whole contract: free / self / other / the P2002 race. If the "other"
 * branch ever stops throwing, checkout goes back to either 500-ing on the
 * unique index or silently discarding a customer's email.
 */
describe('attachIdentity', () => {
  beforeEach(resetDb)

  it('writes the value when nobody owns it', async () => {
    const user = await prisma.user.create({ data: { phone: '9884230571', role: 'customer' } })

    await attachIdentity(prisma, user.id, { email: 'Priya@Example.com', emailVerified: null })

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    // Normalised on the way in, so a later lookup by the same address matches.
    expect(fresh.email).toBe('priya@example.com')
    expect(fresh.emailVerified).toBeNull()
  })

  it('is a no-op when the value already belongs to this same user', async () => {
    const user = await prisma.user.create({
      data: { email: 'priya@example.com', role: 'customer' },
    })

    await expect(
      attachIdentity(prisma, user.id, { email: 'priya@example.com', emailVerified: new Date() }),
    ).resolves.toBeUndefined()

    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.email).toBe('priya@example.com')
    // Re-attaching your own address is how "confirm my email" stamps it verified.
    expect(fresh.emailVerified).not.toBeNull()
  })

  it('refuses with IdentityConflictError when another row owns the email', async () => {
    await prisma.user.create({ data: { email: 'taken@example.com', role: 'customer' } })
    const user = await prisma.user.create({ data: { phone: '9884230571', role: 'customer' } })

    await expect(
      attachIdentity(prisma, user.id, { email: 'taken@example.com' }),
    ).rejects.toBeInstanceOf(IdentityConflictError)

    // The refusal must not have partially written anything.
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.email).toBeNull()
  })

  it('refuses with IdentityConflictError when another row owns the phone', async () => {
    await prisma.user.create({ data: { phone: '9000000001', role: 'customer' } })
    const user = await prisma.user.create({ data: { email: 'a@b.co', role: 'customer' } })

    const err = await attachIdentity(prisma, user.id, {
      phone: '9000000001',
      phoneVerified: new Date(),
    }).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(IdentityConflictError)
    expect((err as IdentityConflictError).field).toBe('phone')
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.phone).toBeNull()
    expect(fresh.phoneVerified).toBeNull()
  })

  it('surfaces the conflict rather than a raw P2002 when the value is claimed mid-flight', async () => {
    // The race the ownership SELECT cannot close: the row reads as free, and is
    // taken by the time we UPDATE. Modelled by making only the FIRST lookup lie;
    // everything after it hits the real DB, where the owner genuinely exists.
    // The catch must re-resolve the owner and answer 409 — a raw
    // PrismaClientKnownRequestError escaping here is the 500 that killed checkout.
    await prisma.user.create({ data: { email: 'race@example.com', role: 'customer' } })
    const user = await prisma.user.create({ data: { phone: '9884230571', role: 'customer' } })

    let lookups = 0
    const racer = {
      user: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: async (args: any) => (++lookups === 1 ? null : prisma.user.findUnique(args)),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        update: async (args: any) => prisma.user.update(args),
      },
    }

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attachIdentity(racer as any, user.id, { email: 'race@example.com' }),
    ).rejects.toBeInstanceOf(IdentityConflictError)
    expect(lookups).toBeGreaterThan(1) // proves the retry path re-read the owner
  })

  it('assertIdentityFree throws before an SMS is ever spent on a taken number', async () => {
    await prisma.user.create({ data: { phone: '9000000002', role: 'customer' } })
    const user = await prisma.user.create({ data: { email: 'c@d.co', role: 'customer' } })

    await expect(assertIdentityFree(user.id, 'phone', '+91 90000 00002')).rejects.toBeInstanceOf(
      IdentityConflictError,
    )
    // Your own number is always free to re-verify.
    await expect(assertIdentityFree(user.id, 'email', 'c@d.co')).resolves.toBeUndefined()
  })
})

/**
 * The completeness definition every gate reads. A brand-new OTP account has a
 * phone and nothing else — the state that used to render as "Femi9 member" with
 * two em-dashes — so it must report incomplete, in a stable field order.
 */
describe('profile completeness', () => {
  beforeEach(resetDb)

  it('reports missing fields in a stable name/email/phone order', () => {
    expect(missingProfileFields({ name: null, email: null, phone: '9884230571' })).toEqual([
      'name',
      'email',
    ])
    expect(missingProfileFields({ name: '   ', email: 'a@b.co', phone: null })).toEqual([
      'name',
      'phone',
    ])
    expect(isProfileComplete({ name: 'Priya Nair', email: 'a@b.co', phone: '9884230571' })).toBe(true)
  })

  it('getProfileStatus resolves from the DB and returns null for a stale session', async () => {
    const user = await prisma.user.create({ data: { phone: '9884230571', role: 'customer' } })

    expect(await getProfileStatus(user.id)).toEqual({ complete: false, missing: ['name', 'email'] })
    expect(await getProfileStatus('does-not-exist')).toBeNull()
  })

  it('never renders a placeholder as if it were data', async () => {
    const user = await prisma.user.create({ data: { phone: '9884230571', role: 'customer' } })
    const view = toAccountUser(user)

    // The raw column stays null so a form's defaultValue can't persist a label.
    expect(view.name).toBeNull()
    expect(view.displayName).toBe('Your account')
    expect(view.greeting).toBe('Welcome back')
    // A missing channel is null, so the view renders an "Add your email" action
    // rather than a lone em-dash.
    expect(view.email).toBeNull()
    expect(view.phoneDisplay).toBe('+91 98842 30571')
    expect(view.profileComplete).toBe(false)
  })

  it('resolves a real name into the greeting and initials', async () => {
    const user = await prisma.user.create({
      data: { name: '  Priya Nair ', email: 'p@n.co', phone: '9884230571', role: 'customer' },
    })
    const view = toAccountUser(user)

    expect(view.name).toBe('Priya Nair')
    expect(view.greeting).toBe('Welcome back, Priya')
    expect(view.initials).toBe('PN')
    expect(view.profileComplete).toBe(true)
  })
})

describe('profile and address writes', () => {
  beforeEach(resetDb)

  it('refuses a phone change through PATCH instead of writing it unverified', async () => {
    const user = await prisma.user.create({
      data: { name: 'Priya', email: 'p@n.co', phone: '9884230571', role: 'customer' },
    })

    const changed = await updateProfile(user.id, { phone: '9000000009' })
    expect(changed.status).toBe('phone-requires-verification')

    // The stored number is untouched; re-sending the SAME number is a no-op 200.
    const same = await updateProfile(user.id, { phone: '+91 98842 30571' })
    expect(same.status).toBe('ok')
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(fresh.phone).toBe('9884230571')
  })

  it('archives an order-linked address instead of refusing to delete it', async () => {
    const user = await prisma.user.create({ data: { phone: '9884230571', role: 'customer' } })
    const kept = await prisma.address.create({
      data: { userId: user.id, label: 'Home', name: 'Priya', line: 'A', city: 'Coimbatore', isPrimary: true },
    })
    const used = await prisma.address.create({
      data: { userId: user.id, label: 'Work', name: 'Priya', line: 'B', city: 'Coimbatore' },
    })
    await prisma.order.create({
      data: {
        orderNo: 'FM-00001',
        userId: user.id,
        addressId: used.id,
        subtotal: 100,
        total: 100,
      },
    })

    expect(await deleteAddress(user.id, used.id)).toBe('archived')
    // The row survives for the order's FK but leaves the customer's address book.
    const row = await prisma.address.findUniqueOrThrow({ where: { id: used.id } })
    expect(row.archivedAt).not.toBeNull()

    // An address with no orders is genuinely removed.
    expect(await deleteAddress(user.id, kept.id)).toBe('deleted')
    expect(await prisma.address.findUnique({ where: { id: kept.id } })).toBeNull()
  })
})
