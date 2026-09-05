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

/** Modules only Femi9's console has. `pricing` is here because Lumi9 does not
 *  run price zones at all — see the note on the lumi9 module list. */
const FEMI9_ONLY: AdminModule[] = ['thara', 'community', 'partners', 'pricing']

/**
 * Modules only LUMI9's console has.
 *
 * `parenting` is the first, and it broke the "Lumi9 is a strict subset"
 * assumption this file used to encode. That assumption was never a rule — it was
 * a description of where the migration happened to have got to, true because
 * Lumi9's console had so far only ever been Femi9's with things removed. Lumi9
 * runs a surface Femi9 does not have (`/parenting-tools`: the vaccination
 * schedule and its care-plan leads), so it now needs a console screen Femi9 has
 * no page behind.
 *
 * The invariant that actually matters is the one below it: every module a brand
 * lists is a REAL module, and a module one brand lacks returns 404 there.
 */
const LUMI9_ONLY: AdminModule[] = ['parenting']

/** Modules BOTH consoles have. Sharing a module name is not sharing data: each
 *  console reads its own brand's schema, so `affiliates` here means two
 *  separate creator rosters reviewed through one screen. */
const SHARED: AdminModule[] = [
  'dashboard',
  'catalog',
  'inventory',
  'orders',
  'customers',
  'coupons',
  'subscriptions',
  'content',
  'reviews',
  'affiliates',
  'settings',
  // Team (admin user management) — both brands have the module; whether a
  // given ROLE sees it is decided in admin-policy.ts (super_admin + owner only).
  'team',
]

describe('module gating', () => {
  it('keeps Femi9-only programmes out of Lumi9 entirely', () => {
    for (const m of FEMI9_ONLY) {
      expect(hasModule('femi9', m)).toBe(true)
      expect(hasModule('lumi9', m)).toBe(false)
    }
  })

  it('gives both brands the commerce modules, affiliates included', () => {
    for (const m of SHARED) {
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

  it('keeps Lumi9-only surfaces out of Femi9 entirely', () => {
    for (const m of LUMI9_ONLY) {
      expect(hasModule('lumi9', m)).toBe(true)
      expect(hasModule('femi9', m)).toBe(false)
    }
  })

  it('accounts for every module either console lists', () => {
    // The replacement for "Lumi9 is a strict subset of Femi9", which stopped
    // being true when Lumi9 gained the parenting tools. This is the stronger
    // check anyway: it fails when a module is added to a brand WITHOUT being
    // classified above, which is the accident the old assertion was reaching
    // for and only caught in one direction.
    const classified = new Set<string>([...FEMI9_ONLY, ...LUMI9_ONLY, ...SHARED])
    for (const brand of ['femi9', 'lumi9'] as const) {
      for (const m of brandConfig(brand).modules) {
        expect(classified.has(m)).toBe(true)
      }
    }
    expect(classified.size).toBe(ADMIN_MODULES.length)
  })

  it('gives each brand a distinct accent, so the console is visually unmistakable', () => {
    expect(brandConfig('femi9').accent).not.toBe(brandConfig('lumi9').accent)
  })
})
