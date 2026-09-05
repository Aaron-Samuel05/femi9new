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
 * A user can hold roles on ONE brand or BOTH; the AdminBrandRole join table
 * carries a row per (adminUserId, brand). Editing a role on brand X does not
 * touch a role on brand Y.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface AdminUserRow {
  id: string
  email: string
  name: string
  active: boolean
  createdAt: Date
  brandRoles: { brand: Brand; role: AdminRole }[]
}

/** List admins visible to this brand's console (i.e. anyone with a role here). */
export async function listAdmins(callerRole: AdminRole, brand: Brand): Promise<AdminUserRow[]> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const rows = await db.adminUser.findMany({
    where: { memberships: { some: { brand } } },
    include: { memberships: true },
    orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
  })
  return rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    active: u.active,
    createdAt: u.createdAt,
    brandRoles: u.memberships.map((br) => ({ brand: br.brand, role: br.role })),
  }))
}

export interface InviteAdminInput {
  email: string
  name: string
  brand: Brand
  role: AdminRole
  /** Initial password. Minimum 12 chars — mirrored on the schema in the route. */
  password: string
}

/** Create a new admin OR grant this brand's role to an existing one. */
export async function inviteAdmin(callerRole: AdminRole, input: InviteAdminInput): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const email = input.email.trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new Error('Invalid email.')
  if (input.password.length < 12) throw new Error('Password must be at least 12 characters.')
  const db = platformDb()

  const passwordHash = await hashPassword(input.password)
  const existing = await db.adminUser.findUnique({ where: { email } })

  // Existing account: DO NOT reset their password when granting a new brand
  // role — matches create-admin's stance. Update the display name only.
  const user = existing
    ? await db.adminUser.update({
        where: { id: existing.id },
        data: { name: input.name, active: true },
      })
    : await db.adminUser.create({ data: { email, name: input.name, passwordHash } })

  await db.adminBrandRole.upsert({
    where: { adminUserId_brand: { adminUserId: user.id, brand: input.brand } },
    update: { role: input.role },
    create: { adminUserId: user.id, brand: input.brand, role: input.role },
  })

  return one(user.id)
}

/** Change a user's role on THIS brand. */
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

/** Deactivate — soft delete. Sessions expire (short TTL) so effect is prompt. */
export async function deactivateAdmin(callerRole: AdminRole, userId: string): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const existing = await db.adminUser.findUnique({ where: { id: userId } })
  if (!existing) throw new NotFoundError()
  await db.adminUser.update({ where: { id: userId }, data: { active: false } })
  return one(userId)
}

/** Re-activate a previously deactivated admin. */
export async function activateAdmin(callerRole: AdminRole, userId: string): Promise<AdminUserRow> {
  if (!canManageAdmins(callerRole)) throw new NotAllowedError()
  const db = platformDb()
  const existing = await db.adminUser.findUnique({ where: { id: userId } })
  if (!existing) throw new NotFoundError()
  await db.adminUser.update({ where: { id: userId }, data: { active: true } })
  return one(userId)
}

async function one(id: string): Promise<AdminUserRow> {
  const db = platformDb()
  const u = await db.adminUser.findUnique({
    where: { id },
    include: { memberships: true },
  })
  if (!u) throw new NotFoundError()
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    active: u.active,
    createdAt: u.createdAt,
    brandRoles: u.memberships.map((br) => ({ brand: br.brand, role: br.role })),
  }
}
