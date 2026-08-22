import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import { resolveZone, applyZonePrice } from '@/lib/services/pricing'
import { createZone, updateZone, deleteZone, CannotDeleteDefaultError } from '@/lib/services/admin/pricing'

/**
 * Regional pricing: the read-side resolver picks a zone from a location signal
 * (falling back to the default), and the admin service maintains the golden
 * invariants — a state belongs to exactly one zone, and the default zone can
 * never be deleted. These tests assert against the DB directly so a reverted
 * guard fails a concrete line.
 */

/** Seed the two canonical zones with prisma directly (bypassing the service). */
async function seedZones() {
  const def = await prisma.priceZone.create({
    data: { name: 'Default', discountPct: 0, isDefault: true, active: true, position: 0 },
  })
  const tn = await prisma.priceZone.create({
    data: {
      name: 'Tamil Nadu',
      discountPct: 10,
      isDefault: false,
      active: true,
      position: 1,
      regions: { create: { kind: 'state', value: 'Tamil Nadu' } },
    },
  })
  return { def, tn }
}

describe('regional pricing resolver (integration)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('resolves the TN zone by state and applies its 10% discount', async () => {
    const { tn } = await seedZones()

    const zone = await resolveZone({ state: 'Tamil Nadu' })
    expect(zone?.id).toBe(tn.id)
    expect(zone?.discountPct).toBe(10)

    // 225 − 10% = 202.5 → rounded to 203.
    expect(applyZonePrice(225, zone)).toBe(203)
  })

  it('falls back to the Default zone for an unmapped state', async () => {
    const { def } = await seedZones()

    const zone = await resolveZone({ state: 'Karnataka' })
    expect(zone?.id).toBe(def.id)
    expect(zone?.discountPct).toBe(0)
    expect(applyZonePrice(225, zone)).toBe(225)
  })

  it('falls back to the Default zone when there is no location signal', async () => {
    const { def } = await seedZones()

    const zone = await resolveZone({})
    expect(zone?.id).toBe(def.id)
    expect(zone?.isDefault).toBe(true)
  })
})

describe('admin pricing service (integration)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('createZone attaches the given states as kind=state regions', async () => {
    const zone = await createZone({
      name: 'South',
      discountPct: 5,
      active: true,
      isDefault: false,
      states: ['Kerala', 'Karnataka'],
    })

    const regions = await prisma.zoneRegion.findMany({
      where: { zoneId: zone.id },
      orderBy: { value: 'asc' },
    })
    expect(regions.map((r) => r.value)).toEqual(['Karnataka', 'Kerala'])
    expect(regions.every((r) => r.kind === 'state')).toBe(true)
  })

  it('updateZone re-points a moved state so only one zone ever owns it', async () => {
    const a = await createZone({
      name: 'Zone A',
      discountPct: 5,
      active: true,
      isDefault: false,
      states: ['Kerala'],
    })
    const b = await createZone({
      name: 'Zone B',
      discountPct: 8,
      active: true,
      isDefault: false,
      states: [],
    })

    // Give 'Kerala' to zone B — it must leave zone A, never duplicate.
    await updateZone(b.id, { states: ['Kerala'] })

    const kerala = await prisma.zoneRegion.findMany({ where: { kind: 'state', value: 'Kerala' } })
    expect(kerala).toHaveLength(1)
    expect(kerala[0]!.zoneId).toBe(b.id)

    const aRegions = await prisma.zoneRegion.findMany({ where: { zoneId: a.id } })
    expect(aRegions).toHaveLength(0)
  })

  it('deleteZone blocks the default and succeeds (cascading regions) on a non-default', async () => {
    const def = await createZone({
      name: 'Default',
      discountPct: 0,
      active: true,
      isDefault: true,
      states: [],
    })
    const tn = await createZone({
      name: 'Tamil Nadu',
      discountPct: 10,
      active: true,
      isDefault: false,
      states: ['Tamil Nadu'],
    })

    await expect(deleteZone(def.id)).rejects.toBeInstanceOf(CannotDeleteDefaultError)

    await deleteZone(tn.id)
    expect(await prisma.priceZone.findUnique({ where: { id: tn.id } })).toBeNull()
    // Its state region cascaded away.
    expect(await prisma.zoneRegion.count({ where: { zoneId: tn.id } })).toBe(0)
  })
})
