import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import {
  getOrder,
  updateOrderStatus,
  refundOrder,
  NotRefundableError,
  ORDER_STATUSES,
} from '@femi9/core/services/admin/orders'

/**
 * Single-order endpoints for the Ops console.
 *   GET   → full order (customer, address, line items)
 *   PATCH → either change status ({ status }) or refund ({ action: 'refund' }).
 *           Refund reverses the gateway payment, restores stock and reverses
 *           loyalty points (see refundOrder); it is separate from a raw status
 *           change so those side-effects can't be triggered by picking 'refunded'
 *           from the status dropdown.
 * Both admin-guarded. In Next 14.2 route-handler `params` is a plain object.
 */

const PatchSchema = z.union([
  z.object({ action: z.literal('refund') }),
  // Reuse the service's canonical list so the API can never accept a status the
  // domain doesn't know about.
  z.object({ status: z.enum(ORDER_STATUSES) }),
])

export async function GET(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const auth = await requireConsoleApi((await props.params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const order = await getOrder(brand, params.id)
    if (!order) return notFound('Order not found')
    return ok(order)
  })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const auth = await requireConsoleApi((await props.params).brand)
    if (!auth.ok) return auth.response
    const { brand } = auth

    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    if ('action' in parsed.data) {
      try {
        const refunded = await refundOrder(brand, params.id)
        if (!refunded) return notFound('Order not found')
        return ok(refunded)
      } catch (err) {
        if (err instanceof NotRefundableError) return badRequest(err.message)
        throw err
      }
    }

    const updated = await updateOrderStatus(brand, params.id, parsed.data.status)
    if (!updated) return notFound('Order not found')
    return ok(updated)
  })
}
