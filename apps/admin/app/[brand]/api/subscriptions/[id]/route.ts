import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import { cancelSubscription } from '@femi9/core/services/admin/subscriptions'

/**
 * /<brand>/api/subscriptions/[id] — the console's one write on a subscription.
 *
 *   PATCH { action: 'cancel' } → stop the plan and the mandate.
 *
 * Everything else about a plan (pause / resume / skip) stays the customer's
 * own — there is no PATCH branch for them here, deliberately, matching
 * `services/subscriptions.ts`'s module doc: cancel is the one exception.
 *
 * `manager`, the same tier `order.refund` sits behind: this stops a recurring
 * debit and reverses a customer's expectation of continued deliveries, so it
 * is not a `support`-tier action. See ADMIN_CANCELLABLE_STATUSES in the
 * service for which plans can even reach this — `cancelSubscription` reports
 * "not found" for the rest, the same 404 a stale id gets.
 */
const PatchSchema = z.object({ action: z.literal('cancel') })

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params
  return handle(async () => {
    const auth = await requireConsoleApi(params.brand, 'manager', 'subscriptions')
    if (!auth.ok) return auth.response
    const { brand, session } = auth

    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const result = await cancelSubscription(brand, params.id)
    if (!result) return notFound('Subscription not found')

    // The mandate is being stopped and deliveries end — worth the same audit
    // weight as a refund. Keyed on the subscription id; there is no order
    // number to key it on the way `order.refund` does.
    await auditConsole(session, req, 'subscription.cancel', result.id)
    return ok(result)
  })
}
