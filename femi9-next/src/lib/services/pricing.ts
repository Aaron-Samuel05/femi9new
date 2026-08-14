import 'server-only'
import { cache } from 'react'
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
 * Two entry points, and the difference matters:
 *
 *   resolveZone(signal)   — explicit. `placeOrder` passes the DELIVERY ADDRESS,
 *                           which is the only signal that decides real money.
 *   resolveAmbientZone()  — best guess for a browsing visitor: her saved
 *                           address, else CloudFront edge geo, else default.
 *                           Request-cached, so a page that renders a grid, a
 *                           cart and a summary resolves it once.
 *
 * Display used to skip both and print `variant.price` raw, so a shopper in a
 * discounted zone saw the standard price on the card, in the cart and on the
 * checkout Total — and only found out at the Razorpay sheet that she was being
 * charged less. Every read path now goes through a zone.
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

/**
 * A Prisma client or an open transaction — callers already inside a
 * `$transaction` pass `tx` so this read joins their transaction instead of
 * borrowing a second pooled connection while the first is held.
 */
type Db = Pick<typeof prisma, 'zoneRegion' | 'priceZone'>

/** Resolve the applicable zone for a location, or the default zone, or null. */
export async function resolveZone(signal: LocationSignal, db: Db = prisma): Promise<ResolvedZone | null> {
  // Strongest signal first. Pincode is matched by its leading-3 prefix, since a
  // ZoneRegion of kind 'pincode' stores a prefix (e.g. "641" for the Coimbatore area).
  const candidates: { kind: 'pincode' | 'district' | 'state'; value: string }[] = []
  const pin = signal.pincode?.replace(/\D/g, '')
  if (pin && pin.length >= 3) candidates.push({ kind: 'pincode', value: pin.slice(0, 3) })
  if (signal.district?.trim()) candidates.push({ kind: 'district', value: signal.district.trim() })
  if (signal.state?.trim()) candidates.push({ kind: 'state', value: signal.state.trim() })

  for (const c of candidates) {
    const region = await db.zoneRegion.findFirst({
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

  const def = await db.priceZone.findFirst({ where: { isDefault: true, active: true } })
  return def ? { id: def.id, name: def.name, discountPct: def.discountPct, isDefault: true } : null
}

/** Apply a zone's discount to a base price (whole rupees). */
export function applyZonePrice(basePrice: number, zone: { discountPct: number } | null): number {
  const pct = Math.max(0, Math.min(100, zone?.discountPct ?? 0))
  return Math.round((basePrice * (100 - pct)) / 100)
}

/**
 * The zone to PRICE A BROWSING VISITOR at, from the best signal available
 * without asking her to type anything:
 *
 *   1. her saved primary address, if she is signed in — she has already told us
 *      where this ships, and it beats an IP guess (mobile carrier NAT routinely
 *      places a Chennai phone in Maharashtra);
 *   2. CloudFront edge geo for everyone else;
 *   3. the default zone.
 *
 * `cache()` scopes the result to one request, so the catalog grid, the cart and
 * the checkout summary agree with each other and cost one query between them.
 *
 * Never throws: any failure (no request scope, a DB blip, no session) degrades
 * to the default zone, i.e. the standard price.
 */
export const resolveAmbientZone = cache(async (): Promise<ResolvedZone | null> => {
  try {
    const saved = await savedAddressSignal()
    if (saved) {
      const zone = await resolveZone(saved)
      if (zone) return zone
    }

    // Imported lazily: this module is also loaded by cron/CLI paths that have no
    // request scope, and `next/headers` need not be dragged in for them.
    const { detectGeoSignal } = await import('@/lib/geo/detect')
    const geo = await detectGeoSignal()
    return await resolveZone(geo)
  } catch {
    return null
  }
})

/** The signed-in shopper's primary delivery address, as a location signal. */
async function savedAddressSignal(): Promise<LocationSignal | null> {
  const { getSession } = await import('@/lib/auth')
  const session = await getSession()
  if (!session) return null

  const address = await prisma.address.findFirst({
    where: { userId: session.sub, archivedAt: null },
    orderBy: [{ isPrimary: 'desc' }, { id: 'desc' }],
    select: { state: true, pincode: true },
  })
  if (!address?.state && !address?.pincode) return null
  return { state: address.state, pincode: address.pincode }
}
