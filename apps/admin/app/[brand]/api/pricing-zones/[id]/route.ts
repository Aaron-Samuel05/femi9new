import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import {
  CannotDeleteDefaultError,
  CannotUnsetDefaultError,
  UnknownPriceTargetError,
  ZoneNameTakenError,
  ZonePatchSchema,
  deleteZone,
  updateZone,
} from '@femi9/core/services/admin/pricing'

/**
 * /<brand>/api/pricing-zones/[id] — single-zone endpoint.
 *   PATCH  → update any subset of a zone's fields (and reconcile states).
 *   DELETE → hard delete (blocked for the default zone).
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

/** Map known service / Prisma failures to friendly responses. */
function mapZoneError(err: unknown) {
  if (err instanceof CannotDeleteDefaultError) return badRequest(err.message)
  if (err instanceof CannotUnsetDefaultError) return badRequest(err.message)
  if (err instanceof UnknownPriceTargetError) return badRequest(err.message)
  if (err instanceof ZoneNameTakenError) return badRequest(err.message)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return badRequest('That zone name is already in use')
    if (err.code === 'P2025') return notFound('Pricing zone not found')
  }
  return null
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = ZonePatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return ok(await updateZone(brand, params.id, parsed.data))
    } catch (err) {
      const mapped = mapZoneError(err)
      if (mapped) return mapped
      throw err
    }
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    try {
      return ok(await deleteZone(brand, params.id))
    } catch (err) {
      const mapped = mapZoneError(err)
      if (mapped) return mapped
      throw err
    }
  })
}
