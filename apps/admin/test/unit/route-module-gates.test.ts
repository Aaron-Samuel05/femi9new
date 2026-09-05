import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BRANDS, brandConfig, hasModule, type AdminModule } from '@femi9/core/brands'

/**
 * Every route that belongs to a brand-specific module must actually GATE on it.
 *
 * `module-gating.test.ts` next door pins the LISTS — which brand's console
 * contains what. This file pins the ENFORCEMENT, which is a different thing and
 * is the half that was missing: the lists were correct, `hasModule` was correct,
 * and `/lumi9/thara`, `/lumi9/partners` and `/lumi9/community` still rendered in
 * full for a Lumi9 admin, because their pages never called the guard with a
 * module name and their API routes never called `moduleGate` at all.
 *
 * The reason was structural rather than careless. `requireConsole(brand, module)`
 * can only be called from a server component, and every one of those pages is a
 * client component — so the gate had nowhere to live and quietly went missing,
 * while the nav kept hiding the link and made it look handled. Hiding a nav link
 * is decoration; this is the enforcement, and a test is what keeps the two from
 * drifting apart again.
 *
 * `/lumi9/api/thara/*` was the worst of them and shows why an eyeball review is
 * not enough here: those routes DID have a gate, `isTharaEnabled()`, which reads
 * a GLOBAL env var. One console serves both brands, so the day Thara is switched
 * on for Femi9 every Thara endpoint starts answering for Lumi9 too. It read as
 * gated and was not, and `infra/terraform/variables.tf` documented the opposite
 * ("Lumi9's brand config does not include the module, so the console 404s it
 * there regardless of this") — a comment that was simply untrue.
 *
 * ── What is checked, and why only these ─────────────────────────────────────
 * The set of modules under test is DERIVED, never hand-listed: it is every
 * module that at least one brand lacks. A module both consoles have cannot leak
 * across brands, so requiring a gate there would be ceremony. If a module is
 * ever removed from one brand's list, it joins this set automatically and these
 * tests start demanding its routes be gated — which is the moment you need to
 * be told, not a release later.
 */

const PANEL = join(process.cwd(), 'app', '[brand]', '(panel)')
const API = join(process.cwd(), 'app', '[brand]', 'api')

/**
 * Route directory → the module it belongs to.
 *
 * Kept explicit because the mapping is not derivable: `products/` is `catalog`,
 * `blog/` is `content`, `wall/` is `community`, `pricing-zones/` is `pricing`.
 * A new directory that appears in neither map fails the census test below, so
 * adding a route forces a decision about which module owns it.
 */
const PANEL_MODULE: Record<string, AdminModule> = {
  affiliates: 'affiliates',
  community: 'community',
  content: 'content',
  coupons: 'coupons',
  customers: 'customers',
  inventory: 'inventory',
  orders: 'orders',
  parenting: 'parenting',
  partners: 'partners',
  pricing: 'pricing',
  products: 'catalog',
  reviews: 'reviews',
  settings: 'settings',
  subscriptions: 'subscriptions',
  team: 'team',
  thara: 'thara',
}

const API_MODULE: Record<string, AdminModule | null> = {
  affiliates: 'affiliates',
  'admin-users': 'team',
  blog: 'content',
  coupons: 'coupons',
  customers: 'customers',
  inventory: 'inventory',
  orders: 'orders',
  parenting: 'parenting',
  partners: 'partners',
  'pricing-zones': 'pricing',
  products: 'catalog',
  reviews: 'reviews',
  settings: 'settings',
  subscriptions: 'subscriptions',
  thara: 'thara',
  wall: 'community',
  // Not a module of its own: the image uploader serves the product form and the
  // blog cover field, and is reachable from any console that has either.
  upload: null,
}

/** Every module at least one brand does NOT have — the ones a gate protects. */
const BRAND_SPECIFIC: AdminModule[] = [
  ...new Set(BRANDS.flatMap((b) => brandConfig(b).modules)),
].filter((m) => !BRANDS.every((b) => hasModule(b, m)))

const dirs = (root: string) =>
  existsSync(root)
    ? readdirSync(root).filter((d) => !d.startsWith('_') && statSync(join(root, d)).isDirectory())
    : []

/** Every route.ts under a directory, at any depth. */
function routeFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (entry === 'route.ts') out.push(p)
    }
  }
  if (existsSync(root)) walk(root)
  return out
}

describe('route module gates', () => {
  it('has brand-specific modules to protect', () => {
    // A guard on the guard: if this ever empties, every test below passes
    // vacuously and would stop protecting anything.
    expect(BRAND_SPECIFIC.length).toBeGreaterThan(0)
  })

  it('gates every panel page whose module a brand lacks', () => {
    const ungated: string[] = []
    for (const dir of dirs(PANEL)) {
      const moduleName = PANEL_MODULE[dir]
      if (!moduleName || !BRAND_SPECIFIC.includes(moduleName)) continue

      // The gate lives in page.tsx when the page is a server component, and in
      // a sibling layout.tsx when it is a client one. Either satisfies this.
      const sources = ['page.tsx', 'layout.tsx']
        .map((f) => join(PANEL, dir, f))
        .filter(existsSync)
        .map((f) => readFileSync(f, 'utf8'))

      const gated = sources.some((s) => s.includes(`requireConsole(`) && s.includes(`'${moduleName}'`))
      if (!gated) ungated.push(`${dir} (module: ${moduleName})`)
    }
    expect(ungated).toEqual([])
  })

  it('gates every API route whose module a brand lacks', () => {
    const ungated: string[] = []
    for (const dir of dirs(API)) {
      const moduleName = API_MODULE[dir]
      if (!moduleName || !BRAND_SPECIFIC.includes(moduleName)) continue

      for (const file of routeFiles(join(API, dir))) {
        const src = readFileSync(file, 'utf8')
        // Either shape counts: `moduleGate(hasModule(brand, 'x'))`, or a plain
        // `if (!hasModule(brand, 'x')) return notFound()`. What must NOT count
        // is a global feature flag — see the Thara note at the top of this file.
        const gated = src.includes('hasModule(') && src.includes(`'${moduleName}'`)
        if (!gated) ungated.push(`${file.slice(file.indexOf('api'))} (module: ${moduleName})`)
      }
    }
    expect(ungated).toEqual([])
  })

  it('classifies every route directory, so a new one cannot slip in unclassified', () => {
    const unknownPanel = dirs(PANEL).filter((d) => !(d in PANEL_MODULE))
    const unknownApi = dirs(API).filter((d) => !(d in API_MODULE))
    // The console's root page.tsx is the dashboard and has no directory.
    expect({ unknownPanel, unknownApi }).toEqual({ unknownPanel: [], unknownApi: [] })
  })

  it('never lets a global feature flag stand in for a per-brand check', () => {
    // isTharaEnabled() answers "is the programme built and switched on", which
    // is not the same question as "does THIS brand run it". A route that asks
    // only the first one answers for both brands.
    const flagged = routeFiles(join(API, 'thara')).filter((f) => {
      const src = readFileSync(f, 'utf8')
      return src.includes('isTharaEnabled') && !src.includes("hasModule(brand, 'thara')")
    })
    expect(flagged).toEqual([])
  })
})
