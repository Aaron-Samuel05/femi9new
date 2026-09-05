import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import {
  getOrder,
  updateOrderStatus,
  refundOrder,
  setOrderAddressEditGrant,
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
  // Open or close the customer's one-time address correction. A separate action
  // rather than a field on the status object: it changes what the CUSTOMER may
  // do, not what the order is, and it must not be settable as a side effect of
  // picking a status from a dropdown.
  z.object({ action: z.literal('address-edit'), granted: z.boolean() }),
  // Reuse the service's canonical list so the API can never accept a status the
  // domain doesn't know about.
  z.object({ status: z.enum(ORDER_STATUSES) }),
])

export async function GET(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const auth = await requireConsoleApi((await props.params).brand, 'readonly', 'orders')
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
    const auth = await requireConsoleApi((await props.params).brand, 'manager', 'orders')
    if (!auth.ok) return auth.response
    const { brand, session } = auth

    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    if ('action' in parsed.data && parsed.data.action === 'address-edit') {
      const { granted } = parsed.data
      const result = await setOrderAddressEditGrant(brand, params.id, granted, session.email)
      if (!result) return notFound('Order not found')
      // Worth logging on both edges. Opening it lets a customer change where a
      // paid parcel goes, which is the kind of thing that gets asked about
      // afterwards; closing it explains why she suddenly could not.
      //
      // The grant now also messages her, so the audit row records WHETHER she
      // was reached and on which channel. Without it, "we opened it and she
      // never used it" and "we opened it and she was never told" read the same
      // way weeks later, and only one of those is the customer's doing.
      await auditConsole(
        session,
        req,
        granted ? 'order.address-edit.grant' : 'order.address-edit.revoke',
        result.orderNo,
        result.notified
          ? {
              email: result.notified.email.sent ? 'sent' : (result.notified.email.reason ?? 'skipped'),
              whatsapp: result.notified.whatsapp.sent
                ? 'sent'
                : (result.notified.whatsapp.reason ?? 'skipped'),
            }
          : undefined,
      )
      return ok(result)
    }

    if ('action' in parsed.data) {
      try {
        const refunded = await refundOrder(brand, params.id)
        if (!refunded) return notFound('Order not found')
        // The single most disputable action this console takes. Recorded after
        // the gateway reversal succeeds, keyed on the order NUMBER rather than
        // the row id so the log reads the same way the customer's email does.
        await auditConsole(session, req, 'order.refund', refunded.orderNo, {
          total: refunded.total,
        })
        return ok(refunded)
      } catch (err) {
        if (err instanceof NotRefundableError) return badRequest(err.message)
        throw err
      }
    }

    const updated = await updateOrderStatus(brand, params.id, parsed.data.status)
    if (!updated) return notFound('Order not found')
    await auditConsole(session, req, 'order.status', updated.orderNo, {
      status: parsed.data.status,
    })
    return ok(updated)
  })
}
