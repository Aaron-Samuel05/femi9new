import { z } from 'zod'
import { badRequest, handle, notFound, ok } from '@femi9/core/api'
import { hasModule } from '@femi9/core/brands'
import { updateDose } from '@femi9/core/services/admin/parenting'
import { moduleGate, requireConsoleApi } from '@/lib/api-guard'

/**
 * /<brand>/api/parenting/doses/[id] — edit one dose.
 *
 * PATCH only. There is deliberately no DELETE: removing a dose cascades to
 * `BabyVaccination` and would erase a parent's record that their child had it,
 * and a vaccine withdrawn from the published schedule is still one that was
 * given. `active: false` is what "remove it from the list" means here — it
 * disappears from every parent's schedule while the history survives.
 *
 * `code` is not in the schema and cannot be patched. It is the key every
 * `BabyVaccination` points at, so changing it would silently detach every
 * parent's record of that dose: the row would look edited and a thousand
 * histories would quietly stop matching anything.
 */

const PatchSchema = z
  .object({
    vaccine: z.string().trim().min(1).max(80).optional(),
    dose: z.string().trim().min(1).max(60).optional(),
    ageUnit: z.enum(['weeks', 'months', 'years']).optional(),
    ageValue: z.number().int().min(0).max(100).optional(),
    tracks: z.array(z.enum(['UIP', 'IAP'])).min(1).optional(),
    note: z.string().trim().max(200).nullish(),
    position: z.number().int().min(0).max(10_000).optional(),
    active: z.boolean().optional(),
  })
  // An empty patch is a request the console should not be making, so it is a
  // 400 rather than a silent no-op that reports success.
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update.' })

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ brand: string; id: string }> },
) {
  const { brand, id } = await params
  // 'support': this changes a clinical date every parent using the tool reads.
  const auth = await requireConsoleApi(brand, 'support')
  if (!auth.ok) return auth.response
  const gate = moduleGate(hasModule(auth.brand, 'parenting'))
  if (gate) return gate

  return handle(async () => {
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Check the dose details.', parsed.error.flatten())

    const row = await updateDose(auth.brand, id, parsed.data)
    if (!row) return notFound('No such dose.')
    return ok({ dose: row })
  })
}
