import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import {
  CouponCodeTakenError,
  CouponInputSchema,
  deleteCoupon,
  toggleActive,
  updateCoupon,
} from '@femi9/core/services/admin/coupons'

/**
 * /api/admin/coupons/[id] — single-coupon endpoint.
 *   PATCH  → `{ toggle: true }` flips active (the list's quick switch), otherwise
 *            a full coupon body replaces the coupon's fields.
 *   DELETE → hard delete.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

/** Map known Prisma / service failures to friendly responses. */
function mapCouponError(err: unknown) {
  if (err instanceof CouponCodeTakenError) return badRequest(err.message)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return badRequest('That coupon code is already in use')
    if (err.code === 'P2025') return notFound('Coupon not found')
    // Left in case a future schema makes the order→coupon relation restrictive.
    if (err.code === 'P2003') {
      return badRequest("This coupon can't be deleted while orders reference it")
    }
  }
  return null
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const raw = await req.json().catch(() => null)

    // Quick toggle path — the list row flips active without resending everything.
    if (raw && typeof raw === 'object' && (raw as { toggle?: unknown }).toggle === true) {
      const updated = await toggleActive('femi9', params.id)
      if (!updated) return notFound('Coupon not found')
      return ok(updated)
    }

    const parsed = CouponInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return ok(await updateCoupon('femi9', params.id, parsed.data))
    } catch (err) {
      const mapped = mapCouponError(err)
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
      return ok(await deleteCoupon('femi9', params.id))
    } catch (err) {
      const mapped = mapCouponError(err)
      if (mapped) return mapped
      throw err
    }
  })
}
