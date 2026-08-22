import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import {
  ProductInputSchema,
  archiveProduct,
  getAdminProduct,
  updateProduct,
} from '@femi9/core/services/admin/products'

/**
 * /api/admin/products/[id] — single-product endpoint.
 *   GET    → full product for the editor.
 *   PATCH  → update scalars + diff images/variants.
 *   DELETE → archive (soft delete), keeping order history intact.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

/** Map known Prisma constraint failures to friendly 400s the form can show. */
function mapPrismaError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(',') ?? ''
      const field = target.includes('sku') ? 'SKU' : target.includes('slug') ? 'slug' : 'value'
      return badRequest(`That ${field} is already taken`)
    }
    // A variant still referenced by an order/cart/subscription can't be deleted.
    if (err.code === 'P2003' || err.code === 'P2014') {
      return badRequest("A variant can't be removed while it's used by existing orders")
    }
    if (err.code === 'P2025') return notFound('Product not found')
  }
  return null
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const product = await getAdminProduct(params.id)
    if (!product) return notFound('Product not found')
    return ok(product)
  })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = ProductInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return ok(await updateProduct(params.id, parsed.data))
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err
    }
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    try {
      return ok(await archiveProduct(params.id))
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err
    }
  })
}
