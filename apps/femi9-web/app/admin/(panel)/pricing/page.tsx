import { listPricingCatalog, listZones } from '@femi9/core/services/admin/pricing'
import PricingZonesScreen, { type CatalogProduct, type ZoneRow } from './_editor'

/**
 * Pricing Zones — what a shopper in a given region is charged.
 *
 * A zone prices two ways and the second wins where it is set: a blanket
 * percentage off every product, plus EXACT prices typed for individual products
 * or variants (the custom price setter). Both are edited on the same screen.
 *
 * Server component: it does the first read through the admin pricing service —
 * the zones and the catalogue those custom prices are set against — and hands
 * plain, serialisable rows to the client screen, which owns all the
 * interactivity (create / edit / delete via /api/admin/pricing-zones).
 *
 * `listZones` may expose a zone's attached states as a flat `states` array or as
 * `regions: [{ kind, value }]`; we flatten to the state values here so the
 * client only ever sees `states`. Always dynamic — this is live, per-request DB
 * data behind the admin auth guard.
 */
export const dynamic = 'force-dynamic'

// Structural (widened) view of a zone from the service, tolerant of either the
// `states` or the `regions` shape so this page compiles against whichever the
// service returns.
interface ServiceZone {
  id: string
  name: string
  discountPct: number
  isDefault: boolean
  active: boolean
  position?: number
  states?: string[]
  regions?: { kind: string; value: string }[]
  prices?: {
    products?: { productId: string; price: number }[]
    variants?: { variantId: string; price: number }[]
  }
}

function toRow(z: ServiceZone): ZoneRow {
  return {
    id: z.id,
    name: z.name,
    discountPct: z.discountPct,
    isDefault: z.isDefault,
    active: z.active,
    position: z.position ?? 0,
    states: z.states ?? (z.regions ?? []).filter((r) => r.kind === 'state').map((r) => r.value),
    // Flattened to plain id → price maps: that is how the editor's inputs are
    // keyed, and it keeps the client from re-deriving the same lookup per render.
    productPrices: Object.fromEntries((z.prices?.products ?? []).map((p) => [p.productId, p.price])),
    variantPrices: Object.fromEntries((z.prices?.variants ?? []).map((v) => [v.variantId, v.price])),
  }
}

export default async function PricingZonesPage() {
  const [zones, catalog] = await Promise.all([
    listZones() as Promise<ServiceZone[]>,
    listPricingCatalog(),
  ])
  const rows: ZoneRow[] = zones
    .map(toRow)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

  const products: CatalogProduct[] = catalog.map((p) => ({
    id: p.id,
    name: p.name,
    basePrice: p.basePrice,
    // Not-yet-live rows are shown, flagged: a price may already be set against
    // one, and the editor must never hide a box it would then delete.
    draft: p.status !== 'active',
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      price: v.price,
      inactive: !v.active,
    })),
  }))

  return (
    <>
      <div className="adm-toolbar" style={{ marginBottom: 8 }}>
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontSize: 21,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Pricing Zones
        </h2>
      </div>

      <p className="adm-help" style={{ maxWidth: 640, marginBottom: 20 }}>
        Set what shoppers in a region pay: a discount off every product, and/or an exact price for
        individual products. A custom price wins over the discount wherever you set one. The Default
        zone is used when a shopper’s location is unknown.
      </p>

      <PricingZonesScreen initial={rows} catalog={products} />
    </>
  )
}
