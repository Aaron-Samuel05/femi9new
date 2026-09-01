import type { NextRequest } from 'next/server'
import type { PartnerStatus } from '@prisma/client'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { moduleGate, requireConsoleApi } from '@/lib/api-guard'
import { hasModule } from '@femi9/core/brands'
import { listApplications } from '@femi9/core/services/admin/partners'

/**
 * /<brand>/api/partners — collection endpoint for the partner-lead CRM.
 *   GET → list leads, optionally filtered by ?status=new|contacted|onboarded|rejected.
 * Guarded by requireAdmin; the (panel) shell also guards the page.
 */

const STATUSES: readonly PartnerStatus[] = ['new', 'contacted', 'onboarded', 'rejected']

export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  // A brand without this module has no rows here and must not learn it exists:
  // 404, the same answer requireConsole gives the page. Guarding only the page
  // left this endpoint answering for a brand whose console has no link to it.
  const gated = moduleGate(hasModule(brand, 'partners'))
  if (gated) return gated

  return handle(async () => {
    // Only a recognised status filters the list; anything else means "all", so a
    // stale/garbage query param degrades gracefully instead of erroring.
    const raw = req.nextUrl.searchParams.get('status')
    const status = STATUSES.includes(raw as PartnerStatus)
      ? (raw as PartnerStatus)
      : undefined
    return ok(await listApplications(brand, { status }))
  })
}
