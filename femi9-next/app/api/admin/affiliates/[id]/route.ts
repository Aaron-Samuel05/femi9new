import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { badRequest, created, handle, notFound, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { approve, createPayout, suspend } from '@/lib/services/admin/affiliates'

/**
 * PATCH /api/admin/affiliates/[id] — one endpoint, three review actions keyed by
 * the body's `action`:
 *   { action: 'approve' }  → approve + allocate the real promoCode
 *   { action: 'suspend' }  → suspend the creator
 *   { action: 'payout', amount, periodStart, periodEnd, reference? } → log a payout
 * Admin-guarded. Next 14.2: `params` is a plain synchronous object.
 */

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('suspend') }),
  z.object({
    action: z.literal('payout'),
    amount: z.coerce.number().int('Whole rupees only').positive('Amount must be greater than 0'),
    periodStart: z.coerce.date({ message: 'Invalid start date' }),
    periodEnd: z.coerce.date({ message: 'Invalid end date' }),
    reference: z.preprocess(blankToUndef, z.string().trim().max(120).optional()),
  }),
])

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const s = await requireAdmin()
    if (!s) return unauthorized()

    const raw = await req.json().catch(() => null)
    const parsed = BodySchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())
    const body = parsed.data

    try {
      if (body.action === 'approve') {
        const updated = await approve(params.id)
        if (!updated) return notFound('Affiliate not found')
        return ok(updated)
      }

      if (body.action === 'suspend') {
        const updated = await suspend(params.id)
        if (!updated) return notFound('Affiliate not found')
        return ok(updated)
      }

      // payout
      const payout = await createPayout(
        params.id,
        body.amount,
        body.periodStart,
        body.periodEnd,
        body.reference,
      )
      return created(payout)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Collision on the freshly-allocated promoCode (race with another approve).
        if (err.code === 'P2002') return badRequest('Could not allocate a unique code — please retry.')
        // Payout references an affiliate that no longer exists.
        if (err.code === 'P2003' || err.code === 'P2025') return notFound('Affiliate not found')
      }
      throw err // anything else → handle() turns it into a 500
    }
  })
}
