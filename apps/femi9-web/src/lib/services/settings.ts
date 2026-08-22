import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Settings service — the single source for editable business config, replacing
 * the hardcoded FREE_SHIP / SUBSCRIBE_PCT / WA_NUMBER constants that used to
 * live in src/data/products.ts. Values are stored as loose `Json` rows keyed by
 * name; this seam gives the rest of the app a typed, defaulted view so a missing
 * or malformed row can never break the storefront.
 */

export interface Settings {
  freeShipThreshold: number
  subscribeSavePct: number
  whatsappNumber: string
  pointsPerRupee: number
  firstOrderBonusPoints: number
}

/** Defaults mirror the original constants so behaviour is unchanged when a row is absent. */
const DEFAULTS: Settings = {
  freeShipThreshold: 999,
  subscribeSavePct: 15,
  whatsappNumber: '919042916499',
  pointsPerRupee: 1,
  firstOrderBonusPoints: 100,
}

/** Coerce a Json cell to the shape of its default, tolerating string/number drift. */
function coerce<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof fallback === 'number') {
    const n = typeof value === 'string' ? Number(value) : value
    return (typeof n === 'number' && Number.isFinite(n) ? n : fallback) as T
  }
  if (typeof fallback === 'string') {
    return (typeof value === 'string' ? value : String(value)) as T
  }
  return (value as T) ?? fallback
}

/** All settings as a typed object, filling any missing key from DEFAULTS. */
export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany()
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown]))
  return {
    freeShipThreshold: coerce(byKey.get('freeShipThreshold'), DEFAULTS.freeShipThreshold),
    subscribeSavePct: coerce(byKey.get('subscribeSavePct'), DEFAULTS.subscribeSavePct),
    whatsappNumber: coerce(byKey.get('whatsappNumber'), DEFAULTS.whatsappNumber),
    pointsPerRupee: coerce(byKey.get('pointsPerRupee'), DEFAULTS.pointsPerRupee),
    firstOrderBonusPoints: coerce(byKey.get('firstOrderBonusPoints'), DEFAULTS.firstOrderBonusPoints),
  }
}

/** One shoppable product, for the footer column and any other nav-level list. */
export interface ShopLink {
  slug: string
  name: string
}

/**
 * Everything the storefront chrome needs from the server in one call.
 *
 * Extends `Settings` with the two provider flags and the real catalog, because
 * every consumer of them is a client component:
 *  - `googleEnabled` stops /login rendering a prominent "Continue with Google"
 *    button that bounces the shopper back with ?error=google-config.
 *  - `tharaEnabled` lets Nav and Footer show /thara only when the programme is
 *    actually switched on. Until now nothing in the product linked to it at all.
 *  - `shopLinks` replaces three hardcoded slugs in the footer, which turned into
 *    404s on every page the moment a product was archived or renamed.
 */
export interface PublicSettingsPayload extends Settings {
  googleEnabled: boolean
  tharaEnabled: boolean
  shopLinks: ShopLink[]
}

export async function getPublicSettings(): Promise<PublicSettingsPayload> {
  // Imported lazily so this module stays free of the OAuth/feature-flag graph
  // for the many server callers that only want the business numbers.
  const [{ googleConfigured }, { isTharaEnabled }] = await Promise.all([
    import('@/lib/google-oauth'),
    import('@/lib/thara/feature'),
  ])
  const [settings, products] = await Promise.all([
    getSettings(),
    prisma.product.findMany({
      where: { status: 'active' },
      orderBy: [{ basePrice: 'desc' }],
      take: 3,
      select: { slug: true, name: true },
    }),
  ])
  return {
    ...settings,
    googleEnabled: googleConfigured(),
    tharaEnabled: isTharaEnabled(),
    shopLinks: products,
  }
}

/** Generic single-key getter — returns `fallback` when the row is missing or malformed. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return coerce(row?.value as unknown, fallback)
}
