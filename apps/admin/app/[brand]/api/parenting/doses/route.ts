import { z } from 'zod'
import { badRequest, conflict, created, handle, ok } from '@femi9/core/api'
import { hasModule } from '@femi9/core/brands'
import { createDose, listDoses } from '@femi9/core/services/admin/parenting'
import { moduleGate, requireConsoleApi } from '@/lib/api-guard'

/**
 * /<brand>/api/parenting/doses — the published immunisation schedule.
 *   GET  → every dose, active or not.
 *   POST → add one.
 *
 * Module-gated as well as session-guarded. Femi9 has no parenting tools, so this
 * endpoint 404s there rather than 403ing: hiding a link is decoration, and the
 * route is what actually decides.
 */

const DoseSchema = z.object({
  /**
   * The stable key. Slug-shaped and lowercase, matching the seeded ones
   * ("penta-1"), so a later re-seed of a corrected published table matches this
   * row instead of creating a duplicate beside it.
   */
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens'),
  vaccine: z.string().trim().min(1).max(80),
  dose: z.string().trim().min(1).max(60),
  ageUnit: z.enum(['weeks', 'months', 'years']),
  /**
   * Bounded at 0-100 in the stated unit. Zero is the birth dose and real; the
   * ceiling only has to be past "16 years", the last dose on the UIP schedule,
   * and low enough that a stray keystroke cannot date a dose beyond a lifetime.
   */
  ageValue: z.number().int().min(0).max(100),
  /**
   * At least one track. A dose on neither schedule is a row no parent can ever
   * see, which is a silent way to lose an edit somebody meant to publish.
   */
  tracks: z.array(z.enum(['UIP', 'IAP'])).min(1),
  note: z.string().trim().max(200).nullish(),
  active: z.boolean().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'readonly', 'parenting')
  if (!auth.ok) return auth.response
  const gate = moduleGate(hasModule(auth.brand, 'parenting'))
  if (gate) return gate

  return handle(async () => ok({ doses: await listDoses(auth.brand) }))
}

export async function POST(req: Request, { params }: { params: Promise<{ brand: string }> }) {
  // 'support', not the default 'readonly': this publishes a clinical date to
  // every parent using the tool.
  const auth = await requireConsoleApi((await params).brand, 'support', 'parenting')
  if (!auth.ok) return auth.response
  const gate = moduleGate(hasModule(auth.brand, 'parenting'))
  if (gate) return gate

  return handle(async () => {
    const parsed = DoseSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Check the dose details.', parsed.error.flatten())

    const result = await createDose(auth.brand, parsed.data)
    if (result.status === 'duplicate') {
      return conflict('A dose with that code already exists.', { field: 'code' })
    }
    return created({ dose: result.dose })
  })
}
