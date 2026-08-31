import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import { allowsProductType } from '@femi9/core/brands'
import {
  FeaturedError,
  ProductInputSchema,
  archiveProduct,
  getAdminProduct,
  updateProduct,
} from '@femi9/core/services/admin/products'

/**
 * /<brand>/api/products/[id] — single-product endpoint.
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

export async function GET(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const product = await getAdminProduct(brand, params.id)
    if (!product) return notFound('Product not found')
    return ok(product)
  })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand, 'manager')
  if (!auth.ok) return auth.response
  const { brand, session } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = ProductInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())
    // The Prisma enum is shared; this brand's catalogue is not.
    if (!allowsProductType(brand, parsed.data.type)) {
      return badRequest(`${brand} does not sell ${parsed.data.type} products`)
    }

    try {
      const updated = await updateProduct(brand, params.id, parsed.data)
      // A catalogue edit sets prices. Log the slug and the base price rather
      // than the whole payload — enough to see what changed and when, without
      // copying every description into a second table.
      await auditConsole(session, req, 'product.update', params.id, {
        slug: parsed.data.slug || undefined,
        basePrice: parsed.data.basePrice,
        status: parsed.data.status,
        // Which products the homepage leads with is an editorial decision worth
        // being able to read back. Omitted when the payload did not touch it.
        featured: parsed.data.featured,
      })
      return ok(updated)
    } catch (err) {
      // The featured-rail rules are user-facing messages, not 500s.
      if (err instanceof FeaturedError) return badRequest(err.message)
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err
    }
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand, 'manager')
  if (!auth.ok) return auth.response
  const { brand, session } = auth

  return handle(async () => {
    try {
      const archived = await archiveProduct(brand, params.id)
      await auditConsole(session, _req, 'product.archive', params.id)
      return ok(archived)
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err
    }
  })
}
