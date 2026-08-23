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

/** The Prisma ProductType values. A brand sells some of them, never all. */
export const PRODUCT_TYPES = ['pad', 'panty', 'diaper'] as const
export type ProductTypeValue = (typeof PRODUCT_TYPES)[number]

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
  /**
   * Prefix for customer-facing order numbers. Brand-specific because the
   * shopper reads it back to support, and because the two brands' sequences
   * live in different schemas and must not look interchangeable.
   */
  orderPrefix: string
  /**
   * What this brand actually sells. The console's product form renders its
   * options from here, and the routes reject anything outside it — a Lumi9
   * admin has no business creating a sanitary pad, and the shared enum would
   * otherwise let them.
   */
  productTypes: readonly ProductTypeValue[]
}

export const BRAND_CONFIG: Record<Brand, BrandConfig> = {
  femi9: {
    key: 'femi9',
    name: 'Femi9',
    shortName: 'Femi9',
    host: 'femi9.in',
    accent: '#352D78',
    accentInk: '#ffffff',
    orderPrefix: 'FM',
    productTypes: ['pad', 'panty'],
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
    orderPrefix: 'LM',
    productTypes: ['diaper'],
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

/**
 * Whether a brand may sell this product type.
 *
 * The Prisma enum is shared across brands, so without this check a crafted
 * request could file a diaper under Femi9. Validation at the boundary knows the
 * union; only this knows which member belongs to whom.
 */
export function allowsProductType(brand: Brand, type: string): type is ProductTypeValue {
  return (BRAND_CONFIG[brand].productTypes as readonly string[]).includes(type)
}

/** The `FM-00001` / `LM-00001` prefix for this brand's order numbers. */
export function orderPrefix(brand: Brand): string {
  return BRAND_CONFIG[brand].orderPrefix
}
