import { BRANDS, isBrand, type Brand } from '@femi9/db'

export { BRANDS, isBrand }
export type { Brand }

/**
 * What each brand's console is allowed to contain.
 *
 * A module absent from a brand's list is not merely hidden from the nav — the
 * route returns 404. Lumi9's staff should not learn that Thara exists by
 * guessing a URL, and 403 tells them it does. Hiding a link is decoration;
 * the check that matters is on the route.
 */
export const ADMIN_MODULES = [
  'dashboard',
  'catalog',
  'inventory',
  'orders',
  'customers',
  'coupons',
  'pricing',
  'subscriptions',
  'content',
  'reviews',
  'community',
  'affiliates',
  'partners',
  'thara',
  'settings',
] as const

export type AdminModule = (typeof ADMIN_MODULES)[number]

export interface BrandConfig {
  key: Brand
  name: string
  /** Shown on the login toggle and in the console header. */
  shortName: string
  /** Public storefront host, for "view site" links. */
  host: string
  accent: string
  accentInk: string
  modules: readonly AdminModule[]
}

export const BRAND_CONFIG: Record<Brand, BrandConfig> = {
  femi9: {
    key: 'femi9',
    name: 'Femi9',
    shortName: 'Femi9',
    host: 'femi9.in',
    accent: '#352D78',
    accentInk: '#ffffff',
    modules: [
      'dashboard',
      'catalog',
      'inventory',
      'orders',
      'customers',
      'coupons',
      'pricing',
      'subscriptions',
      'content',
      'reviews',
      'community',
      'affiliates',
      'partners',
      'thara',
      'settings',
    ],
  },
  lumi9: {
    key: 'lumi9',
    name: 'Lumi9',
    shortName: 'Lumi9',
    host: 'lumi9.in',
    accent: '#4F6F52',
    accentInk: '#ffffff',
    // No community, affiliates, partners or thara: those are Femi9 programmes,
    // and the Lumi9 database has no rows for them.
    modules: [
      'dashboard',
      'catalog',
      'inventory',
      'orders',
      'customers',
      'coupons',
      'pricing',
      'subscriptions',
      'content',
      'reviews',
      'settings',
    ],
  },
}

export function brandConfig(brand: Brand): BrandConfig {
  return BRAND_CONFIG[brand]
}

/** Whether a brand's console includes a module. The route guard calls this. */
export function hasModule(brand: Brand, moduleName: AdminModule): boolean {
  return BRAND_CONFIG[brand].modules.includes(moduleName)
}
