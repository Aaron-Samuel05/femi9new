import { listZones } from '@/lib/services/admin/pricing'
import PricingZonesScreen, { type ZoneRow } from './_editor'

/**
 * Pricing Zones — set a regional discount off the standard price.
 *
 * Server component: it does the first read through `listZones` (the admin
 * pricing service) and hands plain, serialisable rows to the client screen,
 * which owns all the interactivity (create / edit / delete via the
 * /api/admin/pricing-zones endpoints).
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
  }
}

export default async function PricingZonesPage() {
  const zones = (await listZones()) as ServiceZone[]
  const rows: ZoneRow[] = zones
    .map(toRow)
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

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
        Set a regional discount off the standard price. The Default zone is shown when a shopper’s
        location is unknown. (Storefront auto-detection is wired in a later phase.)
      </p>

      <PricingZonesScreen initial={rows} />
    </>
  )
}
