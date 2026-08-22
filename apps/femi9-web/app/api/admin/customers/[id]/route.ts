import type { NextRequest } from 'next/server'
import { handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import { getCustomer } from '@femi9/core/services/admin/customers'
import { adjustCustomerPoints, changeCustomerRole } from '@femi9/core/services/admin/customers'
import { badRequest } from '@femi9/core/api'
import { z } from 'zod'

/** GET /api/admin/customers/[id] — full customer profile. Next 14.2: params is sync. */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const s = await requireAdmin()
    if (!s) return unauthorized()

    const customer = await getCustomer(params.id)
    if (!customer) return notFound('Customer not found')

    return ok(customer)
  })
}

const MutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('adjust-points'), delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0), reason: z.string().trim().min(3).max(160) }),
  z.object({ action: z.literal('change-role'), role: z.enum(['customer', 'affiliate', 'partner', 'staff', 'admin']) }),
])

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin()
    if (!admin) return unauthorized()
    const parsed = MutationSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid customer update', parsed.error.flatten())
    const id = (await props.params).id
    const changed = parsed.data.action === 'adjust-points'
      ? await adjustCustomerPoints(id, parsed.data.delta, parsed.data.reason)
      : await changeCustomerRole(id, parsed.data.role)
    if (!changed) return notFound('Customer not found')
    return ok({ ok: true })
  })
}
