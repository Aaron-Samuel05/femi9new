import type { NextRequest } from 'next/server'
import type { PartnerStatus } from '@prisma/client'
import { handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
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
