import { notFound } from 'next/navigation'
import { requireConsole } from '@/lib/guard'
import { canManageAdmins } from '@femi9/core/admin-policy'
import { listAdmins } from '@femi9/core/services/admin/admin-users'
import { TeamManager } from './TeamManager'

export const dynamic = 'force-dynamic'

/**
 * /[brand]/team — cross-brand admin roster.
 *
 * Even though the URL sits under `[brand]`, the roster is deliberately
 * CROSS-BRAND: a super admin managing their team wants to see everyone,
 * regardless of which brand's console they happen to be signed into. Guards
 * still fire per-brand — you have to be a super admin on THIS brand's console
 * to reach the page — but the payload is everyone.
 *
 * Every non-super-admin role gets `notFound()` (404, not 403): the module
 * classifier hides `team` from every other role, and the page shouldn't
 * reveal that the module exists via a different HTTP code.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ brand: string }>
}) {
  const { brand } = await params
  const { session } = await requireConsole(brand, 'team')
  if (!canManageAdmins(session.role)) notFound()

  const rows = await listAdmins(session.role) // no brand filter → both brands
  return (
    <TeamManager
      viewingBrand={session.brand}
      currentUserId={session.sub}
      initialRows={rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        active: r.active,
        createdAt: r.createdAt.toISOString(),
        memberships: r.memberships,
      }))}
    />
  )
}
