import { describe, it, expect } from 'vitest'
import { hasModule, brandConfig, ADMIN_MODULES, type AdminModule } from '@femi9/core/brands'

/**
 * Which console contains what.
 *
 * The nav renders from these lists, but the lists are not decoration — the page
 * guard and the API guard both consult `hasModule`, and a module a brand does
 * not have returns 404. These tests pin the lists so a module cannot be added
 * to a brand by accident.
 */

const FEMI9_ONLY: AdminModule[] = ['thara', 'community', 'affiliates', 'partners']

describe('module gating', () => {
  it('keeps Femi9-only programmes out of Lumi9 entirely', () => {
    for (const m of FEMI9_ONLY) {
      expect(hasModule('femi9', m)).toBe(true)
      expect(hasModule('lumi9', m)).toBe(false)
    }
  })

  it('gives both brands the commerce modules', () => {
    for (const m of ['dashboard', 'catalog', 'inventory', 'orders', 'customers',
                     'coupons', 'pricing', 'subscriptions', 'content', 'reviews',
                     'settings'] as AdminModule[]) {
      expect(hasModule('femi9', m)).toBe(true)
      expect(hasModule('lumi9', m)).toBe(true)
    }
  })

  it('lists only known modules — a typo would silently gate nothing', () => {
    for (const brand of ['femi9', 'lumi9'] as const) {
      for (const m of brandConfig(brand).modules) {
        expect(ADMIN_MODULES).toContain(m)
      }
    }
  })

  it('Lumi9 is a strict subset of Femi9', () => {
    const femi9 = new Set<string>(brandConfig('femi9').modules)
    for (const m of brandConfig('lumi9').modules) expect(femi9.has(m)).toBe(true)
    expect(brandConfig('lumi9').modules.length).toBeLessThan(brandConfig('femi9').modules.length)
  })

  it('gives each brand a distinct accent, so the console is visually unmistakable', () => {
    expect(brandConfig('femi9').accent).not.toBe(brandConfig('lumi9').accent)
  })
})
