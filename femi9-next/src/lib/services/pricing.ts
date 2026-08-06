import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Regional-pricing resolver (read side).
 *
 * Given whatever location signal we have for a visitor, resolve their PriceZone
 * and apply its discount to a base price. The zone is chosen by the STRONGEST
 * available signal first (pincode → district → state), falling back to the
 * `isDefault` zone (standard price) when nothing matches — so an unknown
 * location always gets the standard price, never a broken one.
 *
 * The golden rule (see the proposal) is enforced here structurally: zones only
 * ever carry a *discount*, so a resolved price can only match or beat the base.
 * The admin never expresses a surcharge.
 *
 * This is where the storefront/checkout will call in (a later phase wires the
 * detection); it is pure + DB-backed so it's testable today.
 */

export interface ResolvedZone {
  id: string
  name: string
  discountPct: number
  isDefault: boolean
}

export interface LocationSignal {
  pincode?: string | null
  district?: string | null
  state?: string | null
}

/** Resolve the applicable zone for a location, or the default zone, or null. */
export async function resolveZone(signal: LocationSignal): Promise<ResolvedZone | null> {
  // Strongest signal first. Pincode is matched by its leading-3 prefix, since a
  // ZoneRegion of kind 'pincode' stores a prefix (e.g. "641" for the Coimbatore area).
  const candidates: { kind: 'pincode' | 'district' | 'state'; value: string }[] = []
  const pin = signal.pincode?.replace(/\D/g, '')
  if (pin && pin.length >= 3) candidates.push({ kind: 'pincode', value: pin.slice(0, 3) })
  if (signal.district?.trim()) candidates.push({ kind: 'district', value: signal.district.trim() })
  if (signal.state?.trim()) candidates.push({ kind: 'state', value: signal.state.trim() })

  for (const c of candidates) {
    const region = await prisma.zoneRegion.findFirst({
      where: {
        kind: c.kind,
        value: { equals: c.value, mode: 'insensitive' },
        zone: { active: true },
      },
      include: { zone: true },
    })
    if (region) {
      return {
        id: region.zone.id,
        name: region.zone.name,
        discountPct: region.zone.discountPct,
        isDefault: region.zone.isDefault,
      }
    }
  }

  const def = await prisma.priceZone.findFirst({ where: { isDefault: true, active: true } })
  return def ? { id: def.id, name: def.name, discountPct: def.discountPct, isDefault: true } : null
}

/** Apply a zone's discount to a base price (whole rupees). */
export function applyZonePrice(basePrice: number, zone: { discountPct: number } | null): number {
  const pct = Math.max(0, Math.min(100, zone?.discountPct ?? 0))
  return Math.round((basePrice * (100 - pct)) / 100)
}
