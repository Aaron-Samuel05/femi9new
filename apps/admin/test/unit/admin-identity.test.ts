import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { platformDb, disconnectPlatform } from '@femi9/db-platform'
import { hashPassword, verifyPassword, needsRehash } from '@femi9/core/admin-password'
import {
  signInAdmin,
  createAdminSession,
  verifyAdminSession,
  adminCookieName,
  brandsFor,
  hasAtLeast,
} from '@femi9/core/admin-identity'
import { hasModule } from '@femi9/core/brands'

/**
 * The console's front door. These tests exist because every failure here is a
 * silent one: a brand toggle that authorises, a session that crosses brands, or
 * an error message that tells a stranger who works on what.
 */

const db = platformDb()

const PASSWORD = 'correct horse battery staple'
let hash: string

beforeAll(async () => {
  hash = await hashPassword(PASSWORD)
})

beforeEach(async () => {
  await db.adminAuditLog.deleteMany()
  await db.adminBrandRole.deleteMany()
  await db.adminUser.deleteMany()
})

afterAll(async () => {
  await disconnectPlatform()
})

async function makeAdmin(email: string, brands: Array<'femi9' | 'lumi9'>, opts: { active?: boolean } = {}) {
  return db.adminUser.create({
    data: {
      email,
      name: 'Test Admin',
      passwordHash: hash,
      active: opts.active ?? true,
      memberships: { create: brands.map((brand) => ({ brand, role: 'manager' as const })) },
    },
  })
}

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    expect(await verifyPassword(PASSWORD, hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('produces a different hash each time (salted)', async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(hash)
  })

  it('treats a malformed stored hash as a failed verify, not a crash', async () => {
    for (const bad of ['', 'garbage', 'scrypt$x$y$z$q$r', 'bcrypt$1$2$3$4$5']) {
      expect(await verifyPassword(PASSWORD, bad)).toBe(false)
    }
  })

  it('flags weaker stored parameters for rehash', async () => {
    expect(needsRehash(hash)).toBe(false)
    expect(needsRehash('scrypt$1024$8$1$c2FsdA==$aGFzaA==')).toBe(true)
    expect(needsRehash('nonsense')).toBe(true)
  })
})

describe('signing in', () => {
  it('admits an admin to a brand they hold a role in', async () => {
    await makeAdmin('priya@example.com', ['femi9'])
    const res = await signInAdmin('femi9', 'priya@example.com', PASSWORD)
    expect(res.ok).toBe(true)
    expect(res.session?.brand).toBe('femi9')
    expect(res.session?.role).toBe('manager')
  })

  // The one that matters: the toggle states a request, membership decides.
  it('REFUSES a valid password for a brand the admin has no role in', async () => {
    await makeAdmin('priya@example.com', ['femi9'])
    const res = await signInAdmin('lumi9', 'priya@example.com', PASSWORD)
    expect(res.ok).toBe(false)
    expect(res.session).toBeUndefined()
  })

  it('refuses a wrong password, a disabled account, and an unknown email alike', async () => {
    await makeAdmin('priya@example.com', ['femi9'])
    await makeAdmin('gone@example.com', ['femi9'], { active: false })
    expect((await signInAdmin('femi9', 'priya@example.com', 'nope')).ok).toBe(false)
    expect((await signInAdmin('femi9', 'gone@example.com', PASSWORD)).ok).toBe(false)
    expect((await signInAdmin('femi9', 'nobody@example.com', PASSWORD)).ok).toBe(false)
  })

  it('rejects a brand that is not a brand, without consulting the database', async () => {
    await makeAdmin('priya@example.com', ['femi9'])
    for (const bogus of ['FEMI9', '../etc', '', null, undefined, 'platform', 1]) {
      expect((await signInAdmin(bogus, 'priya@example.com', PASSWORD)).ok).toBe(false)
    }
  })

  it('is case- and whitespace-insensitive on the email', async () => {
    await makeAdmin('priya@example.com', ['femi9'])
    expect((await signInAdmin('femi9', '  PRIYA@Example.COM  ', PASSWORD)).ok).toBe(true)
  })

  it('lets one person hold both brands', async () => {
    const admin = await makeAdmin('both@example.com', ['femi9', 'lumi9'])
    expect((await signInAdmin('femi9', 'both@example.com', PASSWORD)).ok).toBe(true)
    expect((await signInAdmin('lumi9', 'both@example.com', PASSWORD)).ok).toBe(true)
    expect((await brandsFor(admin.id)).sort()).toEqual(['femi9', 'lumi9'])
  })

  it('stamps lastLoginAt only on success', async () => {
    const admin = await makeAdmin('priya@example.com', ['femi9'])
    expect(admin.lastLoginAt).toBeNull()
    await signInAdmin('femi9', 'priya@example.com', 'wrong')
    expect((await db.adminUser.findUnique({ where: { id: admin.id } }))?.lastLoginAt).toBeNull()
    await signInAdmin('femi9', 'priya@example.com', PASSWORD)
    expect((await db.adminUser.findUnique({ where: { id: admin.id } }))?.lastLoginAt).not.toBeNull()
  })
})

describe('sessions are bound to one brand', () => {
  const session = {
    sub: 'admin_1',
    email: 'priya@example.com',
    name: 'Priya',
    brand: 'femi9' as const,
    role: 'manager' as const,
  }

  it('verifies under its own brand', async () => {
    const token = await createAdminSession(session)
    expect((await verifyAdminSession(token, 'femi9'))?.sub).toBe('admin_1')
  })

  // Copying the cookie across consoles must not work.
  it('does NOT verify under the other brand', async () => {
    const token = await createAdminSession(session)
    expect(await verifyAdminSession(token, 'lumi9')).toBeNull()
  })

  it('rejects a tampered or empty token', async () => {
    const token = await createAdminSession(session)
    expect(await verifyAdminSession(token.slice(0, -3) + 'aaa', 'femi9')).toBeNull()
    expect(await verifyAdminSession('', 'femi9')).toBeNull()
    expect(await verifyAdminSession('a.b.c', 'femi9')).toBeNull()
  })

  it('gives each brand its own cookie, so both can be open at once', () => {
    expect(adminCookieName('femi9')).not.toBe(adminCookieName('lumi9'))
  })
})

describe('roles and module gating', () => {
  it('ranks roles so readonly cannot pass a manager check', () => {
    expect(hasAtLeast('owner', 'manager')).toBe(true)
    expect(hasAtLeast('manager', 'manager')).toBe(true)
    expect(hasAtLeast('support', 'manager')).toBe(false)
    expect(hasAtLeast('readonly', 'support')).toBe(false)
  })

  it('keeps Femi9-only programmes out of the Lumi9 console', () => {
    // NOT 'affiliates': both brands run a creator programme now. They are two
    // separate rosters in two separate schemas reviewed through one screen —
    // module-gating.test.ts is where that list is pinned properly.
    for (const m of ['thara', 'community', 'partners'] as const) {
      expect(hasModule('femi9', m)).toBe(true)
      expect(hasModule('lumi9', m)).toBe(false)
    }
    for (const m of ['orders', 'catalog', 'customers', 'affiliates', 'settings'] as const) {
      expect(hasModule('femi9', m)).toBe(true)
      expect(hasModule('lumi9', m)).toBe(true)
    }
  })
})
