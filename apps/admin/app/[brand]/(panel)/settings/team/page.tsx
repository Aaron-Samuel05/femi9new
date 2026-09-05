import { notFound } from 'next/navigation'
import { requireConsole } from '@/lib/guard'
import { canManageAdmins } from '@femi9/core/admin-policy'
import { listAdmins } from '@femi9/core/services/admin/admin-users'
import { TeamManager } from './TeamManager'

export const dynamic = 'force-dynamic'

/**
 * /[brand]/settings/team — the admin roster for this brand.
 *
 * Gated at the layer above by `canManageAdmins(session.role)`: super_admin and
 * owner see the page; every other role gets `notFound()` (deliberate — 404,
 * not 403, so the module's existence isn't confirmed to lower roles).
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ brand: string }>
}) {
  const { brand } = await params
  const { session } = await requireConsole(brand)
  if (!canManageAdmins(session.role)) notFound()

  const rows = await listAdmins(session.role, session.brand)
  return (
    <TeamManager
      brand={session.brand}
      currentUserId={session.sub}
      initialRows={rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        active: r.active,
        role:
          r.brandRoles.find((br) => br.brand === session.brand)?.role ?? 'readonly',
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  )
}
