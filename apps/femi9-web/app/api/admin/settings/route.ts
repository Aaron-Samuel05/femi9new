import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { getEditableSettings, updateSettings } from '@/lib/services/admin/settings-admin'

/**
 * /api/admin/settings — the settings editor endpoint.
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

export async function GET() {
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => ok(await getEditableSettings()))
}

export async function PATCH(req: NextRequest) {
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = SettingsPatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    return ok(await updateSettings(parsed.data))
  })
}
