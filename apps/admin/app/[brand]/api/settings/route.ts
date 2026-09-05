import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import { getEditableSettings, updateSettings } from '@femi9/core/services/admin/settings-admin'
import { isManagedImageUrl, MANAGED_IMAGE_URL_MESSAGE } from '@femi9/core/image-url'
import { LAUNCH_POPUP_MAX_SECONDS } from '@femi9/core/services/settings'
import { hasLaunchPopup } from '@femi9/core/brands'

/**
 * /<brand>/api/settings — the settings editor endpoint.
 *   GET   → current (defaulted) values for the form.
 *   PATCH → validate + upsert the changed keys, returning the fresh values.
 * Guarded by requireAdmin; the (panel) shell also guards the page.
 */

/**
 * The launch popup, validated as a WHOLE object — it is one Setting row, and a
 * half-sent one would be stored as a half-popup.
 *
 * `imageUrl` goes through the same `isManagedImageUrl` predicate the product
 * and blog images do. The console's field is an upload button, but the field is
 * UI and this is the enforcement: without it a crafted PATCH could point the
 * popup at any origin and put a third party's image, full-screen and modal, in
 * front of every visitor on their first page view.
 */
const LaunchPopupSchema = z.object({
  enabled: z.boolean(),
  imageUrl: z
    .union([
      // An empty box in the form means "no image", not an empty string that
      // would fail the predicate and block a save that is switching the popup
      // OFF after the artwork was removed.
      z.literal('').transform(() => null),
      z.null(),
      z.string().trim().refine(isManagedImageUrl, MANAGED_IMAGE_URL_MESSAGE),
    ]),
  alt: z.string().trim().max(200),
  // 0 is deliberate and documented in the form: stay until she closes it.
  seconds: z.coerce.number().int().min(0).max(LAUNCH_POPUP_MAX_SECONDS),
})

// z.coerce on numerics so the form's string <input> values ("999") validate the
// same as raw numbers. .partial() keeps PATCH semantics — only sent keys change.
const SettingsPatchSchema = z
  .object({
    freeShipThreshold: z.coerce.number().int().min(0),
    subscribeSavePct: z.coerce.number().int().min(0).max(100),
    whatsappNumber: z.string().trim().min(1, 'WhatsApp number is required'),
    pointsPerRupee: z.coerce.number().int().min(0),
    firstOrderBonusPoints: z.coerce.number().int().min(0),
    launchPopup: LaunchPopupSchema,
  })
  .partial()

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'readonly', 'settings')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => ok(await getEditableSettings(brand)))
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'manager', 'settings')
  if (!auth.ok) return auth.response
  const { brand, session } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = SettingsPatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    // The form hides this card for a brand whose storefront cannot show a popup,
    // but a form is not an authorisation boundary. Refuse the field rather than
    // storing a row that brand will never read — a saved-and-invisible promo is
    // exactly the kind of change nothing anywhere reports as wrong.
    if (parsed.data.launchPopup !== undefined && !hasLaunchPopup(brand)) {
      return badRequest("This brand's storefront does not show a launch popup.")
    }

    const updated = await updateSettings(brand, parsed.data)
    // Every field here is business config a shopper is charged by — the free
    // shipping threshold, the points rate, the welcome bonus — or, for the
    // popup, what every visitor sees first. The changed keys go in the log;
    // they are numbers, thresholds and an image URL, not anybody's data.
    await auditConsole(session, req, 'settings.update', undefined, parsed.data)
    return ok(updated)
  })
}
