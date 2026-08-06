import type { NextRequest } from 'next/server'
import { handle, notFound, ok, unauthorized } from '@/lib/api'
import { requireAdmin } from '@/lib/admin-auth'
import { getCustomer } from '@/lib/services/admin/customers'

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
