import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Partner (reseller) lead capture — the storefront write path.
 *
 * The public "become a partner" form used to persist to localStorage, which
 * meant a submission never left the visitor's browser and the sales team had no
 * pipeline. This service turns each submission into a real PartnerApplication
 * lead so the admin CRM can work it (new → contacted → onboarded / rejected).
 *
 * Kept deliberately thin: it only creates the row (status defaults to `new` in
 * the schema). All admin-side reads/writes live in services/admin/partners.ts so
 * this public surface can never be used to enumerate or mutate existing leads.
 */

export interface CreateApplicationInput {
  name: string
  phone: string
  city: string
  // Optional free-text context — the situation dropdown and the "why" reason.
  situation?: string | null
  reason?: string | null
}

/** Persist a new partner lead. Status is left to the schema default (`new`). */
export async function createApplication(input: CreateApplicationInput) {
  return prisma.partnerApplication.create({
    data: {
      name: input.name,
      phone: input.phone,
      city: input.city,
      // Normalise empty/blank optionals to null so "unset" isn't stored as ''.
      situation: input.situation?.trim() || null,
      reason: input.reason?.trim() || null,
    },
  })
}
