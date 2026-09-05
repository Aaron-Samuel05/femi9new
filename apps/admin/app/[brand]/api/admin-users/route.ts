import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConsoleApi } from '@/lib/api-guard'
import { canManageAdmins } from '@femi9/core/admin-policy'
import {
  listAdmins,
  inviteAdmin,
  DuplicateEmailError,
  NotAllowedError,
} from '@femi9/core/services/admin/admin-users'

// Manage roster of admins for THIS brand. Gate is canManageAdmins(role) inside
// the service — super_admin/owner only; anyone else gets 404 (not 403) to keep
// the module's existence quiet.

export async function GET(_req: NextRequest, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params
  const auth = await requireConsoleApi(brand)
  if (!auth.ok) return auth.response
  if (!canManageAdmins(auth.session.role)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    const rows = await listAdmins(auth.session.role, auth.brand)
    return NextResponse.json({ rows })
  } catch (e) {
    if (e instanceof NotAllowedError) return new NextResponse(null, { status: 404 })
    throw e
  }
}

const InviteSchema = z.object({
  email: z.string().trim().min(3).max(200),
  name: z.string().trim().min(1).max(120),
  role: z.enum([
    'owner',
    'manager',
    'support',
    'readonly',
    'super_admin',
    'finance',
    'orders_manager',
    'content_manager',
  ]),
  password: z.string().min(12).max(200),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params
  const auth = await requireConsoleApi(brand)
  if (!auth.ok) return auth.response
  if (!canManageAdmins(auth.session.role)) {
    return new NextResponse(null, { status: 404 })
  }
  const parsed = InviteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  try {
    const row = await inviteAdmin(auth.session.role, {
      ...parsed.data,
      brand: auth.brand,
    })
    return NextResponse.json({ row }, { status: 201 })
  } catch (e) {
    if (e instanceof DuplicateEmailError) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof NotAllowedError) return new NextResponse(null, { status: 404 })
    if (e instanceof Error) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
