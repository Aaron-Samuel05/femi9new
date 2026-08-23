import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, created, handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { allowsProductType } from '@femi9/core/brands'
import {
  ProductInputSchema,
  createProduct,
  listAdminProducts,
} from '@femi9/core/services/admin/products'

/**
 * /<brand>/api/products — collection endpoint for the products template.
 *   GET  → list every product (all statuses) for the admin table.
 *   POST → create a product with its images + variants.
 * Both guarded by requireAdmin; the (panel) shell also guards the pages.
 */

/** Map known Prisma constraint failures to friendly 400s the form can show. */
function mapPrismaError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(',') ?? ''
      const field = target.includes('sku') ? 'SKU' : target.includes('slug') ? 'slug' : 'value'
      return badRequest(`That ${field} is already taken`)
    }
  }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => ok(await listAdminProducts(brand)))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = ProductInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())
    // The Prisma enum is shared; this brand's catalogue is not.
    if (!allowsProductType(brand, parsed.data.type)) {
      return badRequest(`${brand} does not sell ${parsed.data.type} products`)
    }

    try {
      return created(await createProduct(brand, parsed.data))
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err // let handle() turn anything unexpected into a 500
    }
  })
}
