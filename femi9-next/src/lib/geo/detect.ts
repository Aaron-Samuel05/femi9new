import 'server-only'
import { headers } from 'next/headers'
import { INDIA_STATES } from './india-states'
import type { LocationSignal } from '@/lib/services/pricing'

/**
 * Where is this visitor? — read from the CDN, not from the shopper.
 *
 * CloudFront resolves the viewer's IP to a country/region/postcode at the edge
 * and can pass the result to the origin as `CloudFront-Viewer-*` request
 * headers. They only arrive when the distribution's ORIGIN REQUEST POLICY asks
 * for them (see infra/terraform/cloudfront.tf) — the managed
 * `AllViewerExceptHostHeader` policy forwards viewer headers but does NOT add
 * CloudFront-generated ones, which is why regional pricing silently resolved to
 * "unknown" for every visitor before that policy was replaced.
 *
 * Everything here degrades to `{}` rather than guessing: local dev, a direct
 * ALB hit, a bot with no geo match. An empty signal means the price resolver
 * falls back to the default zone, which is the standard (undiscounted) price —
 * so a missing header can only ever cost a shopper a discount, never overcharge
 * her.
 *
 * This is a HINT for browsing. The authoritative signal for an order is the
 * delivery address typed at checkout, which `placeOrder` resolves separately.
 */

/** Lowercased header names — Next normalises incoming headers to lowercase. */
const H = {
  country: 'cloudfront-viewer-country',
  regionCode: 'cloudfront-viewer-country-region',
  regionName: 'cloudfront-viewer-country-region-name',
  postal: 'cloudfront-viewer-postal-code',
  city: 'cloudfront-viewer-city',
} as const

/** Dev-only override so regional pricing can be exercised without a CDN in front. */
const DEV_STATE_HEADER = 'x-femi9-geo-state'
const DEV_PINCODE_HEADER = 'x-femi9-geo-pincode'

/**
 * ISO 3166-2:IN subdivision code → the state name used by ZoneRegion rows and
 * the admin editor. CloudFront sends the CODE in `-Country-Region`; the spelled
 * name in `-Country-Region-Name` is preferred when present, and this map is the
 * fallback for the many edges that send only the code.
 *
 * The pre-2020 codes for the merged UT (DN, DD) and the alternate Odisha code
 * (OD) are included because geo databases disagree on which vintage they emit.
 */
const IN_REGION_CODES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CT: 'Chhattisgarh',
  CG: 'Chhattisgarh',
  DH: 'Dadra and Nagar Haveli and Daman and Diu',
  DN: 'Dadra and Nagar Haveli and Daman and Diu',
  DD: 'Dadra and Nagar Haveli and Daman and Diu',
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JH: 'Jharkhand',
  JK: 'Jammu and Kashmir',
  KA: 'Karnataka',
  KL: 'Kerala',
  LA: 'Ladakh',
  LD: 'Lakshadweep',
  MH: 'Maharashtra',
  ML: 'Meghalaya',
  MN: 'Manipur',
  MP: 'Madhya Pradesh',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OR: 'Odisha',
  OD: 'Odisha',
  PB: 'Punjab',
  PY: 'Puducherry',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TG: 'Telangana',
  TS: 'Telangana',
  TN: 'Tamil Nadu',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UT: 'Uttarakhand',
  UK: 'Uttarakhand',
  WB: 'West Bengal',
}

/** Case-insensitive lookup of a spelled region name against the canonical list. */
const STATE_BY_LOWER = new Map(INDIA_STATES.map((s) => [s.toLowerCase(), s as string]))

/**
 * Turn CloudFront's region code/name pair into a canonical state name.
 * Exported for tests — this is the part that silently mis-maps if a geo
 * provider changes vintage, and it is not otherwise reachable without a CDN.
 */
export function toIndiaState(regionCode?: string | null, regionName?: string | null): string | undefined {
  const named = regionName?.trim().toLowerCase()
  if (named) {
    const exact = STATE_BY_LOWER.get(named)
    if (exact) return exact
  }
  const code = regionCode?.trim().toUpperCase()
  if (code && IN_REGION_CODES[code]) return IN_REGION_CODES[code]
  return undefined
}

/**
 * The visitor's location as far as the edge can tell. Returns `{}` outside a
 * request scope (cron, tests, build-time prerender) instead of throwing, so
 * every caller can treat geo as best-effort.
 */
export async function detectGeoSignal(): Promise<LocationSignal> {
  let h: Awaited<ReturnType<typeof headers>>
  try {
    h = await headers()
  } catch {
    // No request scope — nothing to detect.
    return {}
  }

  // A local/staging escape hatch: without a CDN in front there is no geo at all,
  // so regional pricing would be untestable outside production. Never honoured
  // in production, where these headers would be attacker-controlled input to a
  // price.
  if (process.env.NODE_ENV !== 'production') {
    const devState = h.get(DEV_STATE_HEADER)?.trim()
    const devPincode = h.get(DEV_PINCODE_HEADER)?.trim()
    if (devState || devPincode) {
      return { state: devState || undefined, pincode: devPincode || undefined }
    }
  }

  // Regional pricing is India-only. A viewer CloudFront places elsewhere gets
  // the default zone rather than a state match on a coincidentally equal name.
  const country = h.get(H.country)?.trim().toUpperCase()
  if (country && country !== 'IN') return {}

  const state = toIndiaState(h.get(H.regionCode), h.get(H.regionName))
  // Edge geo postcodes are coarse but the resolver only uses the leading 3
  // digits (the postal circle), which is the granularity zones are drawn at.
  const pincode = h.get(H.postal)?.replace(/\D/g, '') || undefined

  if (!state && !pincode) return {}
  return { state, pincode }
}
