import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import { getEditableSettings, updateSettings } from '@femi9/core/services/admin/settings-admin'

/**
 * /<brand>/api/settings — the settings editor endpoint.
 *   GET   → current (defaulted) values for the form.
 *   PATCH → validate + upsert the changed keys, returning the fresh values.
 * Guarded by requireAdmin; the (panel) shell also guards the page.
 */

// z.coerce on numerics so the form's string <input> values ("999") validate the
// same as raw numbers. .partial() keeps PATCH semantics — only sent keys change.
const SettingsPatchSchema = z
  .object({
    freeShipThreshold: z.coerce.number().int().min(0),
    subscribeSavePct: z.coerce.number().int().min(0).max(100),
    whatsappNumber: z.string().trim().min(1, 'WhatsApp number is required'),
    pointsPerRupee: z.coerce.number().int().min(0),
    firstOrderBonusPoints: z.coerce.number().int().min(0),
  })
  .partial()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => ok(await getEditableSettings(brand)))
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'manager')
  if (!auth.ok) return auth.response
  const { brand, session } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = SettingsPatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    const updated = await updateSettings(brand, parsed.data)
    // Every field here is business config a shopper is charged by — the free
    // shipping threshold, the points rate, the welcome bonus. The changed keys
    // go in the log; they are numbers and thresholds, not anybody's data.
    await auditConsole(session, req, 'settings.update', undefined, parsed.data)
    return ok(updated)
  })
}
