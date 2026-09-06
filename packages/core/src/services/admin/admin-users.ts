import 'server-only'
import { platformDb } from '@femi9/db-platform'
import type { AdminRole, Brand } from '@femi9/db-platform'
import { hashPassword } from '../../admin-password'
import { canManageAdmins } from '../../admin-policy'

/**
 * Admin user management service. Every mutation checks `canManageAdmins(callerRole)`
 * — the caller is the currently-signed-in admin, whose role decides whether
 * they may edit the roster. Today only `super_admin` and `owner` may.
 *
 * A user can hold roles on ONE brand or BOTH. Every write operates on the
 * FULL membership set: the invite/edit UI hands over an array of
 * {brand, role} rows and this layer reconciles them into the AdminBrandRole
 * join table (upserts what's in the array, deletes what isn't). That mirrors
 * how the UI thinks about it — "which brands does this person have, and at
 * which role on each" — and closes the door on partial writes leaving a
 * user with stale grants from a previous invite.
 */

export class NotAllowedError extends Error {
  constructor() {
    super('Your role does not allow managing admins.')
    this.name = 'NotAllowedError'
  }
}
export class DuplicateEmailError extends Error {
  constructor() {
    super('An admin with this email already exists.')
    this.name = 'DuplicateEmailError'
  }
}
export class NotFoundError extends Error {
  constructor() {
    super('Admin user not found.')
    this.name = 'NotFoundError'
  }
}
export class EmptyMembershipsError extends Error {
  constructor() {
    super('At least one brand must be selected.')
    this.name = 'EmptyMembershipsError'
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface Membership {
  brand: Brand
  role: AdminRole
}

export interface AdminUserRow {
  id: string
  email: string
  name: string
  active: boolean
  createdAt: Date
  memberships: Membership[]
}

// ─────────────────────────────── Reads ──────────────────────────────────

/**
 * List admins visible to a super_admin.
 *
 * With no `brand` filter (the common super-admin view) — every admin who
 * holds a role on ANY brand. With one — only those with a role on that brand
 * (behaviour of the previous single-brand page).
 */
export async function listAdmins(
  callerRole: AdminRole,
  filter: { brand?: Brand } = {},
): Promise<AdminUserRow[]> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const rows = await db.adminUser.findMany({
    where: filter.brand
      ? { memberships: { some: { brand: filter.brand } } }
      : { memberships: { some: {} } },
    include: { memberships: true },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map(rowToDto)
}

async function one(id: string): Promise<AdminUserRow> {
  const db = platformDb()
  const u = await db.adminUser.findUnique({
    where: { id },
    include: { memberships: true },
  })
  if (!u) throw new NotFoundError()
  return rowToDto(u)
}

function rowToDto(u: {
  id: string
  email: string
  name: string
  active: boolean
  createdAt: Date
  memberships: { brand: Brand; role: AdminRole }[]
}): AdminUserRow {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    active: u.active,
    createdAt: u.createdAt,
    memberships: u.memberships.map((br) => ({ brand: br.brand, role: br.role })),
  }
}

// ─────────────────────────────── Writes ─────────────────────────────────

export interface InviteAdminInput {
  email: string
  name: string
  /** One entry per brand this admin should have access to. Must be non-empty. */
  memberships: Membership[]
  /** Initial password. Minimum 12 chars; guarded here AND at the route. */
  password: string
}

/**
 * Create a new admin (or grant the given memberships to an existing account
 * without changing their password). Idempotent per-membership via upsert.
 */
export async function inviteAdmin(
  callerRole: AdminRole,
  input: InviteAdminInput,
): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email.')
  if (input.password.length < 12) throw new Error('Password must be at least 12 characters.')
  if (input.memberships.length === 0) throw new EmptyMembershipsError()
  dedupBrands(input.memberships)

  const db = platformDb()
  const passwordHash = await hashPassword(input.password)
  const existing = await db.adminUser.findUnique({ where: { email } })

  // Same policy as create-admin.ts: an existing account keeps its password on
  // a re-invite — granting a new brand role must not silently reset creds.
  const user = existing
    ? await db.adminUser.update({
        where: { id: existing.id },
        data: { name: input.name, active: true },
      })
    : await db.adminUser.create({ data: { email, name: input.name, passwordHash } })

  for (const m of input.memberships) {
    await db.adminBrandRole.upsert({
      where: { adminUserId_brand: { adminUserId: user.id, brand: m.brand } },
      update: { role: m.role },
      create: { adminUserId: user.id, brand: m.brand, role: m.role },
    })
  }
  return one(user.id)
}

/**
 * Replace the full membership set for a user. Whatever brands are NOT in the
 * incoming array have their AdminBrandRole row deleted. Whatever IS in the
 * array is upserted with the given role.
 *
 * If the resulting set would be empty, this throws — deactivate the account
 * instead of leaving a user with no access.
 */
export async function setMemberships(
  callerRole: AdminRole,
  userId: string,
  memberships: Membership[],
): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  if (memberships.length === 0) throw new EmptyMembershipsError()
  dedupBrands(memberships)

  const db = platformDb()
  const existing = await db.adminUser.findUnique({ where: { id: userId } })
  if (!existing) throw new NotFoundError()

  const wantedBrands = new Set(memberships.map((m) => m.brand))
  const current = await db.adminBrandRole.findMany({ where: { adminUserId: userId } })

  // Delete brands no longer wanted.
  for (const c of current) {
    if (!wantedBrands.has(c.brand)) {
      await db.adminBrandRole.delete({
        where: { adminUserId_brand: { adminUserId: userId, brand: c.brand } },
      })
    }
  }
  // Upsert wanted brands.
  for (const m of memberships) {
    await db.adminBrandRole.upsert({
      where: { adminUserId_brand: { adminUserId: userId, brand: m.brand } },
      update: { role: m.role },
      create: { adminUserId: userId, brand: m.brand, role: m.role },
    })
  }
  return one(userId)
}

/**
 * Legacy single-brand setter — kept for compatibility with the older Team UI
 * that patched one brand at a time. Prefer `setMemberships` for the new UI.
 */
export async function setBrandRole(
  callerRole: AdminRole,
  userId: string,
  brand: Brand,
  role: AdminRole,
): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const existing = await db.adminUser.findUnique({ where: { id: userId } })
  if (!existing) throw new NotFoundError()
  await db.adminBrandRole.upsert({
    where: { adminUserId_brand: { adminUserId: userId, brand } },
    update: { role },
    create: { adminUserId: userId, brand, role },
  })
  return one(userId)
}

export async function deactivateAdmin(callerRole: AdminRole, userId: string): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const existing = await db.adminUser.findUnique({ where: { id: userId } })
  if (!existing) throw new NotFoundError()
  await db.adminUser.update({ where: { id: userId }, data: { active: false } })
  return one(userId)
}

export async function activateAdmin(callerRole: AdminRole, userId: string): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const existing = await db.adminUser.findUnique({ where: { id: userId } })
  if (!existing) throw new NotFoundError()
  await db.adminUser.update({ where: { id: userId }, data: { active: true } })
  return one(userId)
}

// ─────────────────────────────── Helpers ────────────────────────────────

/** Reject two rows for the same brand in one payload — a UI bug would let this
 *  through, and Prisma's upsert loop would silently favour the last one. */
function dedupBrands(memberships: Membership[]) {
  const seen = new Set<Brand>()
  for (const m of memberships) {
    if (seen.has(m.brand)) throw new Error(`Duplicate brand in memberships: ${m.brand}`)
    seen.add(m.brand)
  }
}
