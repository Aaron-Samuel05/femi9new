import type { NextRequest } from 'next/server'
import { handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import { getCustomer } from '@femi9/core/services/admin/customers'
import { adjustCustomerPoints, changeCustomerRole } from '@femi9/core/services/admin/customers'
import { badRequest } from '@femi9/core/api'
import { z } from 'zod'

/** GET /<brand>/api/customers/[id] — full customer profile. Next 14.2: params is sync. */
export async function GET(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const auth = await requireConsoleApi((await props.params).brand, 'readonly', 'customers')
    if (!auth.ok) return auth.response
    const { brand } = auth

    const customer = await getCustomer(brand, params.id)
    if (!customer) return notFound('Customer not found')

    return ok(customer)
  })
}

const MutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('adjust-points'), delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0), reason: z.string().trim().min(3).max(160) }),
  z.object({ action: z.literal('change-role'), role: z.enum(['customer', 'affiliate', 'partner', 'staff', 'admin']) }),
])

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  return handle(async () => {
    const auth = await requireConsoleApi((await props.params).brand, 'manager', 'customers')
    if (!auth.ok) return auth.response
    const { brand, session } = auth
    const parsed = MutationSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid customer update', parsed.error.flatten())
    const id = (await props.params).id
    const changed = parsed.data.action === 'adjust-points'
      ? await adjustCustomerPoints(brand, id, parsed.data.delta, parsed.data.reason)
      : await changeCustomerRole(brand, id, parsed.data.role)
    if (!changed) return notFound('Customer not found')

    // Both branches change something a customer can dispute later: a points
    // balance is money-adjacent, and 'change-role' decides what an account may
    // do. Recorded AFTER the write, so the log never claims an action that then
    // failed.
    await auditConsole(session, req, `customer.${parsed.data.action}`, id,
      parsed.data.action === 'adjust-points'
        ? { delta: parsed.data.delta, reason: parsed.data.reason }
        : { role: parsed.data.role })

    return ok({ ok: true })
  })
}
