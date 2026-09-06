import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { isBrand } from '@femi9/db'
import { platformDb } from '@femi9/db-platform'
import {
  adminCookieName,
  createAdminSession,
  getAdminSession,
  SESSION_SECONDS,
} from '@femi9/core/admin-identity'
import { hashPassword, verifyPassword } from '@femi9/core/admin-password'

/**
 * POST /<brand>/api/auth/change-password
 *
 * The one endpoint an admin can reach while `mustChangePassword` is still
 * true. Verifies the current password (so a stolen active session can't
 * silently swap in a new one), hashes the new one, clears the
 * mustChangePassword flag, and rewrites the session cookie so the proxy
 * stops corralling this request the next time it fires.
 */

const MIN_LENGTH = 12

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(MIN_LENGTH).max(1024),
})

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ brand: string }> },
) {
  const { brand } = await ctx.params
  if (!isBrand(brand)) return NextResponse.json({ error: 'Unknown brand' }, { status: 404 })

  const session = await getAdminSession(brand)
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_LENGTH} characters.` },
      { status: 400 },
    )
  }
  const { currentPassword, newPassword } = parsed.data

  if (currentPassword === newPassword) {
    return NextResponse.json(
      { error: 'New password must differ from the current one.' },
      { status: 400 },
    )
  }

  const db = platformDb()
  const admin = await db.adminUser.findUnique({ where: { id: session.sub } })
  if (!admin || !admin.active) {
    return NextResponse.json({ error: 'Account not found' }, { status: 401 })
  }

  const ok = await verifyPassword(currentPassword, admin.passwordHash)
  if (!ok) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
  }

  const passwordHash = await hashPassword(newPassword)
  await db.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash, mustChangePassword: false },
  })

  // Mint a fresh session WITHOUT mustChangePassword. Without this the next
  // request still carries the old claim and the proxy would keep redirecting.
  const token = await createAdminSession({
    sub: admin.id,
    email: admin.email,
    name: admin.name,
    brand,
    role: session.role,
    mustChangePassword: false,
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(adminCookieName(brand), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_SECONDS,
  })
  return res
}
