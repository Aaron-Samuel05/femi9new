import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { auditConsole } from '@/lib/audit'
import { allowsFeatured } from '@femi9/core/brands'
import { FeaturedError, setProductFeatured } from '@femi9/core/services/admin/products'

/**
 * PATCH /<brand>/api/products/[id]/featured — put a product on the landing
 * page's featured rail, or take it off.
 *
 * Its own endpoint rather than a PATCH of the whole product, because the caller
 * is a star button in a LIST: that row knows an id and nothing else, and
 * `ProductInputSchema` demands a whole product. Routing the toggle through the
 * product editor's payload would mean the list either failing validation or
 * sending a half-built product that wipes the fields it could not supply.
 *
 * `manager`, like every other catalogue write — this decides what most shoppers
 * see first, which is the same tier of decision as a price.
 */
const PatchSchema = z.object({ featured: z.boolean() })

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ brand: string; id: string }> },
) {
  const params = await props.params
  const auth = await requireConsoleApi(params.brand, 'manager', 'catalog')
  if (!auth.ok) return auth.response
  const { brand, session } = auth

  return handle(async () => {
    // A brand with no rail has no such endpoint — 404 rather than 403, the same
    // call `hasModule` makes: there is nothing here to be refused access to.
    if (!allowsFeatured(brand)) return notFound('Not found')

    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    try {
      const product = await setProductFeatured(brand, params.id, parsed.data.featured)
      // The service returns null when the id does not exist.
      if (!product) return notFound('Product not found')

      await auditConsole(
        session,
        req,
        parsed.data.featured ? 'product.feature' : 'product.unfeature',
        params.id,
      )
      return ok(product)
    } catch (err) {
      // Full rail, or a draft somebody tried to feature. Both are answers.
      if (err instanceof FeaturedError) return badRequest(err.message)
      throw err // handle() turns anything unexpected into a 500
    }
  })
}
