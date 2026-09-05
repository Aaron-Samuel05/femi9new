import type { NextRequest } from 'next/server'
import { handle, ok } from '@femi9/core/api'
import { hasModule } from '@femi9/core/brands'
import { listParentingLeads, parentingStats } from '@femi9/core/services/admin/parenting'
import { moduleGate, requireConsoleApi } from '@/lib/api-guard'

/**
 * /<brand>/api/parenting/leads — who asked for a care plan, and how the tools
 * are being used.
 *
 * GET only. These rows exist because a parent typed an address and asked us to
 * send them something; nothing in the console creates, edits or re-sends them,
 * and adding a "resend" button here would be a message they did not ask for.
 *
 * The stats ride along rather than living on their own endpoint: the page draws
 * them above the same table, so two requests would be two chances for the
 * numbers and the list to disagree on screen.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'readonly', 'parenting')
  if (!auth.ok) return auth.response
  const gate = moduleGate(hasModule(auth.brand, 'parenting'))
  if (gate) return gate

  return handle(async () => {
    // Garbage or absent means the default. A bad query param degrades to a
    // sensible list rather than erroring, the same way the reviews filter does.
    const raw = Number(req.nextUrl.searchParams.get('take'))
    const take = Number.isFinite(raw) && raw > 0 ? raw : undefined

    const [leads, stats] = await Promise.all([
      listParentingLeads(auth.brand, { take }),
      parentingStats(auth.brand),
    ])
    return ok({ leads, stats })
  })
}
