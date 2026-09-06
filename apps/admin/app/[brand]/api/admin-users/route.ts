import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireConsoleApi } from '@/lib/api-guard'
import { canManageAdmins } from '@femi9/core/admin-policy'
import {
  listAdmins,
  inviteAdmin,
  DuplicateEmailError,
  NotAllowedError,
  EmptyMembershipsError,
} from '@femi9/core/services/admin/admin-users'

// Manage roster of admins.
// - GET   returns ALL admins across BOTH brands (super_admin sees everyone
//         regardless of which brand's console URL they came from).
// - POST  invites (or grants brand roles to an existing account) with a
//         per-brand membership array — [femi9/finance, lumi9/content_manager]
//         is a valid grant.
//
// Gate is canManageAdmins(role) inside the service — super_admin/owner only;
// every other role gets 404 (not 403) via the requireConsoleApi(brand, tier,
// module='team') check, so the module's existence stays quiet.

const ROLES = [
  'owner',
  'manager',
  'support',
  'readonly',
  'super_admin',
  'finance',
  'orders_manager',
  'content_manager',
] as const

const MembershipSchema = z.object({
  brand: z.enum(['femi9', 'lumi9']),
  role: z.enum(ROLES),
})

const InviteSchema = z.object({
  email: z.string().trim().min(3).max(200),
  name: z.string().trim().min(1).max(120),
  memberships: z.array(MembershipSchema).min(1, 'At least one brand must be selected'),
})

export async function GET(_req: NextRequest, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params
  const auth = await requireConsoleApi(brand, 'readonly', 'team')
  if (!auth.ok) return auth.response
  if (!canManageAdmins(auth.session.role)) {
    return new NextResponse(null, { status: 404 })
  }
  try {
    // No brand filter — a super admin managing the team wants to see EVERY
    // admin across both brands, not just those with a role on the console
    // they happen to be signed into.
    const rows = await listAdmins(auth.session.role)
    return NextResponse.json({ rows })
  } catch (e) {
    if (e instanceof NotAllowedError) return new NextResponse(null, { status: 404 })
    throw e
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ brand: string }> }) {
  const { brand } = await ctx.params
  const auth = await requireConsoleApi(brand, 'readonly', 'team')
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
    // Login URL for each brand is inferred from the request Host so the email
    // points at the same origin the operator is on — dev/staging/prod all
    // work without a per-env env var. Falls back to the service defaults
    // inside inviteAdmin when the header is missing.
    const origin = new URL(req.url).origin
    // `invited=1` tells the login page to hide the brand toggle — the
    // invitee holds a role on ONE console (the one they were invited to)
    // and a toggle to somewhere they can't reach is noise.
    // `next=/<brand>/change-password` lands them straight on the forced-
    // change screen the proxy would corral them to anyway.
    const result = await inviteAdmin(auth.session.role, parsed.data, {
      loginUrlFor: (b) => `${origin}/login?brand=${b}&invited=1&next=%2F${b}%2Fchange-password`,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    if (e instanceof DuplicateEmailError) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof EmptyMembershipsError) return NextResponse.json({ error: e.message }, { status: 400 })
    if (e instanceof NotAllowedError) return new NextResponse(null, { status: 404 })
    if (e instanceof Error) return NextResponse.json({ error: e.message }, { status: 400 })
    throw e
  }
}
