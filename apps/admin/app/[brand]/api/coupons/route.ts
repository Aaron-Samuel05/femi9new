import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, created, handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import {
  CouponCodeTakenError,
  CouponInputSchema,
  createCoupon,
  listCoupons,
} from '@femi9/core/services/admin/coupons'

/**
 * /<brand>/api/coupons — collection endpoint.
 *   GET  → list every coupon (active + inactive) for the admin table.
 *   POST → create a coupon.
 * Both guarded by requireAdmin; the (panel) shell also guards the pages.
 */

/** Map known code-collision failures to a friendly 400 the form can show. */
function mapCouponError(err: unknown) {
  if (err instanceof CouponCodeTakenError) return badRequest(err.message)
  // DB @unique backstop for a race between the check and the insert.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return badRequest('That coupon code is already in use')
  }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => ok(await listCoupons(brand)))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'manager')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = CouponInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return created(await createCoupon(brand, parsed.data))
    } catch (err) {
      const mapped = mapCouponError(err)
      if (mapped) return mapped
      throw err // let handle() turn anything unexpected into a 500
    }
  })
}
