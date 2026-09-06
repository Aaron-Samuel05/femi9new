import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConsoleApi } from '@/lib/api-guard'
import { canManageAdmins } from '@femi9/core/admin-policy'
import {
  setMemberships,
  deactivateAdmin,
  activateAdmin,
  NotFoundError,
  NotAllowedError,
  EmptyMembershipsError,
} from '@femi9/core/services/admin/admin-users'

const ROLES = [
  'owner', 'manager', 'support', 'readonly',
  'super_admin', 'finance', 'orders_manager', 'content_manager',
] as const

const MembershipSchema = z.object({
  brand: z.enum(['femi9', 'lumi9']),
  role: z.enum(ROLES),
})

const PatchSchema = z.object({
  memberships: z.array(MembershipSchema).optional(),
  active: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ brand: string; id: string }> },
) {
  const { brand, id } = await ctx.params
  const auth = await requireConsoleApi(brand, 'readonly', 'team')
  if (!auth.ok) return auth.response
  if (!canManageAdmins(auth.session.role)) {
    return new NextResponse(null, { status: 404 })
  }

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // Self-lockout: refuse edits that would strand the caller. Deactivate is
  // easy (same-id + active:false). The "remove all admin access" case is
  // harder: any incoming memberships array that leaves the caller without
  // a canManageAdmins role on ANY brand is refused.
  if (id === auth.session.sub) {
    if (parsed.data.active === false) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account.' },
        { status: 400 },
      )
    }
    if (parsed.data.memberships) {
      const stillManages = parsed.data.memberships.some((m) => canManageAdmins(m.role))
      if (!stillManages) {
        return NextResponse.json(
          { error: 'You cannot remove your own super admin role from every brand.' },
          { status: 400 },
        )
      }
    }
  }

  try {
    let row
    if (parsed.data.memberships) {
      row = await setMemberships(auth.session.role, id, parsed.data.memberships)
    }
    if (parsed.data.active === false) {
      row = await deactivateAdmin(auth.session.role, id)
    } else if (parsed.data.active === true) {
      row = await activateAdmin(auth.session.role, id)
    }
    return NextResponse.json({ row })
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    if (e instanceof EmptyMembershipsError)
      return NextResponse.json({ error: e.message }, { status: 400 })
    if (e instanceof NotAllowedError) return new NextResponse(null, { status: 404 })
    if (e instanceof Error) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
