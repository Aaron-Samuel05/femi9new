import 'server-only'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Admin pricing-zone service (write side; the read-side resolver lives in
 * ../pricing.ts). A PriceZone is a named bucket carrying a single discount off
 * the base price; STATE regions are attached via ZoneRegion. Two invariants
 * drive the design:
 *  - a region belongs to at most ONE zone (the @@unique([kind,value]) on
 *    ZoneRegion) — so attaching a state to a zone RE-POINTS it away from
 *    whichever zone held it before, never duplicates it.
 *  - exactly one zone is the `isDefault` fallback — setting a new default unsets
 *    the old one atomically, and the default can never be deleted.
 */

// ─────────────────────────── Validation (zod) ───────────────────────────
// z.coerce so the JSON payload from an <input> ("10") is accepted alongside 10.

export const ZoneInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long'),
  // 0–100 percent off the base price; a value outside that range is nonsensical.
  discountPct: z.coerce
    .number()
    .int('Whole numbers only')
    .min(0, 'Discount can’t be negative')
    .max(100, 'Discount can’t exceed 100'),
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  // State names attached to this zone (kind 'state').
  states: z.array(z.string().trim().min(1)).default([]),
})

export type ZoneInput = z.infer<typeof ZoneInputSchema>

// Update accepts any subset of the same fields (the form may PATCH just one).
export const ZonePatchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60, 'Name is too long').optional(),
  discountPct: z.coerce
    .number()
    .int('Whole numbers only')
    .min(0, 'Discount can’t be negative')
    .max(100, 'Discount can’t exceed 100')
    .optional(),
  active: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  states: z.array(z.string().trim().min(1)).optional(),
})

export type ZonePatch = z.infer<typeof ZonePatchSchema>

// ─────────────────────────────── Errors ─────────────────────────────────

/** Thrown when a zone name collides. The route maps this to a friendly 400. */
export class ZoneNameTakenError extends Error {
  constructor(name: string) {
    super(`A pricing zone named “${name}” already exists`)
    this.name = 'ZoneNameTakenError'
  }
}

/** Thrown when a delete targets the default zone. The route maps this to a 400. */
export class CannotDeleteDefaultError extends Error {
  constructor() {
    super('The default pricing zone can’t be deleted')
    this.name = 'CannotDeleteDefaultError'
  }
}

/** True when `err` is a P2002 unique violation involving the given column. */
function isUniqueOn(err: unknown, field: string): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = err.meta?.target
    if (Array.isArray(target)) return target.includes(field)
    if (typeof target === 'string') return target.includes(field)
  }
  return false
}

// ─────────────────────────────── Reads ──────────────────────────────────

/** Every zone in display order, with its attached STATE names + a region count. */
export async function listZones() {
  const zones = await prisma.priceZone.findMany({
    orderBy: { position: 'asc' },
    include: { regions: true, _count: { select: { regions: true } } },
  })
  return zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    discountPct: zone.discountPct,
    isDefault: zone.isDefault,
    active: zone.active,
    position: zone.position,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
    states: zone.regions.filter((r) => r.kind === 'state').map((r) => r.value),
    regionCount: zone._count.regions,
  }))
}

// ─────────────────────────────── Writes ─────────────────────────────────

const dedupeStates = (states: string[]) =>
  [...new Set(states.map((s) => s.trim()).filter(Boolean))]

/**
 * Make this zone's STATE regions exactly `states`. Each wanted state is upserted
 * by its unique [kind,value] to point at THIS zone (moving it off any other zone
 * that held it), and this zone's state regions no longer wanted are removed.
 */
async function reconcileStates(tx: Prisma.TransactionClient, zoneId: string, states: string[]) {
  const wanted = dedupeStates(states)

  for (const value of wanted) {
    await tx.zoneRegion.upsert({
      where: { kind_value: { kind: 'state', value } },
      create: { zoneId, kind: 'state', value },
      update: { zoneId },
    })
  }

  if (wanted.length === 0) {
    await tx.zoneRegion.deleteMany({ where: { zoneId, kind: 'state' } })
  } else {
    await tx.zoneRegion.deleteMany({ where: { zoneId, kind: 'state', value: { notIn: wanted } } })
  }
}

export async function createZone(input: ZoneInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      // A single default: promoting this one demotes every other.
      if (input.isDefault) {
        await tx.priceZone.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
      }
      const zone = await tx.priceZone.create({
        data: {
          name: input.name,
          discountPct: input.discountPct,
          active: input.active,
          isDefault: input.isDefault,
        },
      })
      await reconcileStates(tx, zone.id, input.states)
      return zone
    })
  } catch (err) {
    if (isUniqueOn(err, 'name')) throw new ZoneNameTakenError(input.name)
    throw err
  }
}

export async function updateZone(id: string, patch: ZonePatch) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (patch.isDefault === true) {
        await tx.priceZone.updateMany({
          where: { isDefault: true, NOT: { id } },
          data: { isDefault: false },
        })
      }

      const data: Prisma.PriceZoneUpdateInput = {}
      if (patch.name !== undefined) data.name = patch.name
      if (patch.discountPct !== undefined) data.discountPct = patch.discountPct
      if (patch.active !== undefined) data.active = patch.active
      if (patch.isDefault !== undefined) data.isDefault = patch.isDefault

      // A missing row surfaces as P2025 → the route 404s.
      const zone = await tx.priceZone.update({ where: { id }, data })

      // Only reconcile when the caller actually sent a state list.
      if (patch.states !== undefined) await reconcileStates(tx, id, patch.states)

      return zone
    })
  } catch (err) {
    if (isUniqueOn(err, 'name')) throw new ZoneNameTakenError(patch.name ?? '')
    throw err
  }
}

export async function deleteZone(id: string) {
  const zone = await prisma.priceZone.findUnique({ where: { id }, select: { isDefault: true } })
  // Never orphan the fallback — a store must always have a default price.
  if (zone?.isDefault) throw new CannotDeleteDefaultError()
  // If the zone is already gone, delete throws P2025 → the route 404s.
  // Regions cascade via the FK's onDelete: Cascade.
  return prisma.priceZone.delete({ where: { id }, select: { id: true } })
}
