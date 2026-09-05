import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConsoleApi } from '@/lib/api-guard'
import { canManageAdmins } from '@femi9/core/admin-policy'
import {
  setBrandRole,
  deactivateAdmin,
  activateAdmin,
  NotFoundError,
  NotAllowedError,
} from '@femi9/core/services/admin/admin-users'

const PatchSchema = z.object({
  role: z
    .enum([
      'owner',
      'manager',
      'support',
      'readonly',
      'super_admin',
      'finance',
      'orders_manager',
      'content_manager',
    ])
    .optional(),
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

  // Guard against self-lockout: a super admin who deactivates themselves or
  // demotes themselves to a role without team-management access would be
  // signed in with no way to reverse it. Refuse both edits on the caller's
  // own row.
  if (id === auth.session.sub) {
    if (parsed.data.active === false) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account.' },
        { status: 400 },
      )
    }
    if (parsed.data.role && !canManageAdmins(parsed.data.role)) {
      return NextResponse.json(
        { error: 'You cannot demote your own account below super admin.' },
        { status: 400 },
      )
    }
  }

  try {
    let row
    if (parsed.data.role) {
      row = await setBrandRole(auth.session.role, id, auth.brand, parsed.data.role)
    }
    if (parsed.data.active === false) {
      row = await deactivateAdmin(auth.session.role, id)
    } else if (parsed.data.active === true) {
      row = await activateAdmin(auth.session.role, id)
    }
    return NextResponse.json({ row })
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 })
    if (e instanceof NotAllowedError) return new NextResponse(null, { status: 404 })
    if (e instanceof Error) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
