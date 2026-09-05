import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { adjustStock, setStock } from '@femi9/core/services/admin/inventory'

/**
 * PATCH /<brand>/api/inventory/[variantId] — update one variant's stock.
 *
 * Accepts EITHER an absolute set `{ stock }` or a relative `{ delta }`. Modeled
 * as a union so exactly one shape is required; when both are sent, `stock`
 * (listed first) wins and `delta` is ignored.
 */
const PatchSchema = z.union([
  z.object({ stock: z.number().int().min(0) }),
  z.object({ delta: z.number().int() }),
])

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; variantId: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const auth = await requireConsoleApi((await props.params).brand, 'support', 'inventory')
    if (!auth.ok) return auth.response
    const { brand } = auth

    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const row =
      'stock' in parsed.data
        ? await setStock(brand, params.variantId, parsed.data.stock)
        : await adjustStock(brand, params.variantId, parsed.data.delta)

    // Service returns null when the variant id doesn't exist.
    if (!row) return notFound('Variant not found')
    return ok({ row })
  })
}
