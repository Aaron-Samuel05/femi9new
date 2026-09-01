import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, created, handle, ok, unauthorized } from '@femi9/core/api'
import { moduleGate, requireConsoleApi } from '@/lib/api-guard'
import { hasModule } from '@femi9/core/brands'
import {
  UnknownPriceTargetError,
  ZoneInputSchema,
  ZoneNameTakenError,
  createZone,
  listZones,
} from '@femi9/core/services/admin/pricing'

/**
 * /<brand>/api/pricing-zones — collection endpoint.
 *   GET  → list every zone (with its states + region count) for the admin table.
 *   POST → create a zone.
 * Both guarded by requireAdmin; the (panel) shell also guards the pages.
 *
 * And both gated on the `pricing` module. Lumi9 does not have it, so these
 * return 404 there — the page 404ing on its own would leave the writes reachable
 * to anyone who knows the URL, which is the whole hole module gating closes.
 */

/** Map known name-collision failures to a friendly 400 the form can show. */
function mapZoneError(err: unknown) {
  if (err instanceof ZoneNameTakenError) return badRequest(err.message)
  if (err instanceof UnknownPriceTargetError) return badRequest(err.message)
  // DB @unique backstop for a race between the check and the insert.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return badRequest('That zone name is already in use')
  }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  const gated = moduleGate(hasModule(brand, 'pricing'))
  if (gated) return gated

  return handle(async () => ok(await listZones(brand)))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'manager')
  if (!auth.ok) return auth.response
  const { brand } = auth

  const gated = moduleGate(hasModule(brand, 'pricing'))
  if (gated) return gated

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = ZoneInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return created(await createZone(brand, parsed.data))
    } catch (err) {
      const mapped = mapZoneError(err)
      if (mapped) return mapped
      throw err // let handle() turn anything unexpected into a 500
    }
  })
}
