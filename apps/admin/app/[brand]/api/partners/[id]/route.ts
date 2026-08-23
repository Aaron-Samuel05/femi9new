import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { addNote, updateStatus } from '@femi9/core/services/admin/partners'

/**
 * /<brand>/api/partners/[id] — single-lead endpoint.
 *   PATCH → `{ status }` advances the pipeline, or `{ notes }` saves call notes.
 * Exactly one of the two is expected per call (the table edits them separately).
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

const PatchSchema = z
  .object({
    status: z.enum(['new', 'contacted', 'onboarded', 'rejected']).optional(),
    // Free-text; a blank string clears the note. Capped to keep rows sane.
    notes: z.string().max(4000).optional(),
  })
  // Reject empty/ambiguous bodies so a no-op can't masquerade as success.
  .refine((v) => v.status !== undefined || v.notes !== undefined, {
    message: 'Provide a status or notes to update.',
  })

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    // Notes and status are edited independently; apply whichever was sent and
    // return the reconciled row. Status takes precedence if somehow both arrive.
    const { status, notes } = parsed.data
    const row =
      status !== undefined
        ? await updateStatus(brand, params.id, status)
        : await addNote(brand, params.id, notes ?? '')

    // Service returns null when the lead id doesn't exist.
    if (!row) return notFound('Application not found')
    return ok({ row })
  })
}
