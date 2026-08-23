import 'server-only'
import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import { isBrand, type Brand } from '@femi9/db'
import { platformDb, type AdminRole } from '@femi9/db-platform'
import { fakeVerify, verifyPassword } from './admin-password'

/**
 * Admin identity for the two-brand console.
 *
 * Sessions are per-brand: the cookie NAME carries the brand, so signing into
 * Femi9 in one tab and Lumi9 in another does not overwrite either. The token
 * also carries the brand as a claim, and the middleware compares that claim
 * against the brand in the URL — a token minted for one console is inert on the
 * other even if it is copied across by hand.
 */

export type { AdminRole }

export interface AdminSession {
  sub: string
  email: string
  name: string
  brand: Brand
  role: AdminRole
}

/** 8 hours. Ops sessions are short on purpose — this console can refund money. */
const SESSION_SECONDS = 60 * 60 * 8

export function adminCookieName(brand: Brand): string {
  return `f9_admin_${brand}`
}

function secretKey(): Uint8Array {
  const secret = process.env.ADMIN_AUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) throw new Error('ADMIN_AUTH_SECRET (or AUTH_SECRET) is not set')
  return new TextEncoder().encode(secret)
}

/** Audience is brand-specific, so a Femi9 token cannot verify as a Lumi9 one. */
function audienceFor(brand: Brand): string {
  return `femi9-admin-${brand}`
}

export async function createAdminSession(session: AdminSession): Promise<string> {
  return new SignJWT({
    email: session.email,
    name: session.name,
    brand: session.brand,
    role: session.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setAudience(audienceFor(session.brand))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(secretKey())
}

/** Verify a token FOR A SPECIFIC BRAND. Any failure reads as "not signed in". */
export async function verifyAdminSession(
  token: string,
  brand: Brand,
): Promise<AdminSession | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      audience: audienceFor(brand),
    })
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.name !== 'string' ||
      typeof payload.role !== 'string' ||
      payload.brand !== brand
    ) {
      return null
    }
    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      brand,
      role: payload.role as AdminRole,
    }
  } catch {
    return null
  }
}

/** Read + verify the current request's session for one brand. */
export async function getAdminSession(brand: Brand): Promise<AdminSession | null> {
  const token = (await cookies()).get(adminCookieName(brand))?.value
  if (!token) return null
  return verifyAdminSession(token, brand)
}

export interface SignInResult {
  ok: boolean
  session?: AdminSession
}

/**
 * Authenticate an admin FOR ONE BRAND.
 *
 * Three things must all hold: the account exists, it is active, and it holds a
 * role in the brand being asked for. Every failure returns the same shape, and
 * callers must render the same message for all of them — "this email exists but
 * not for Lumi9" is a staff directory for anyone with the login page.
 *
 * The brand argument comes from the login form's toggle, which is untrusted
 * client input. It is narrowed with `isBrand` here and the membership lookup is
 * what actually authorises; the toggle only ever states a request.
 */
export async function signInAdmin(
  brandInput: unknown,
  email: string,
  password: string,
): Promise<SignInResult> {
  if (!isBrand(brandInput)) {
    // Not a real brand. Still burn the time, so a bad brand is not a fast probe.
    await fakeVerify()
    return { ok: false }
  }
  const brand: Brand = brandInput

  const db = platformDb()
  const admin = await db.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { memberships: { where: { brand } } },
  })

  // No account, or a disabled one: spend the same time a real verify costs.
  if (!admin || !admin.active) {
    await fakeVerify()
    return { ok: false }
  }

  const passwordOk = await verifyPassword(password, admin.passwordHash)
  const membership = admin.memberships[0]

  // Both checks are evaluated before branching, and they collapse into one
  // answer, so a valid password for the wrong brand is indistinguishable from a
  // wrong password.
  if (!passwordOk || !membership) return { ok: false }

  await db.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } })

  return {
    ok: true,
    session: {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      brand,
      role: membership.role,
    },
  }
}

/** Which brands this admin may switch to, for the header switcher. */
export async function brandsFor(adminUserId: string): Promise<Brand[]> {
  const rows = await platformDb().adminBrandRole.findMany({
    where: { adminUserId, adminUser: { active: true } },
    select: { brand: true },
  })
  return rows.map((r) => r.brand as Brand)
}

/** Role ordering, strongest first. `readonly` may not mutate anything. */
const RANK: Record<AdminRole, number> = { owner: 3, manager: 2, support: 1, readonly: 0 }

export function hasAtLeast(role: AdminRole, required: AdminRole): boolean {
  return RANK[role] >= RANK[required]
}

/** Record an action against the brand's console. Never throws into a request. */
export async function audit(entry: {
  adminUserId: string | null
  brand: Brand
  action: string
  target?: string
  meta?: Record<string, unknown>
  ip?: string
}): Promise<void> {
  try {
    await platformDb().adminAuditLog.create({
      data: {
        adminUserId: entry.adminUserId,
        brand: entry.brand,
        action: entry.action,
        target: entry.target,
        meta: entry.meta as never,
        ip: entry.ip,
      },
    })
  } catch {
    // An audit write must never take down the action it is describing.
  }
}
