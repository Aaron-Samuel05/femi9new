import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { safeNext } from '../../src/lib/safe-next'

/**
 * `next` comes back from a URL the user controls and ends up in a Location
 * header. Anything that escapes the site, or crosses into the other brand's
 * console, must fall back rather than be followed.
 */
describe('safeNext', () => {
  it('keeps a same-brand path', () => {
    expect(safeNext('/femi9/orders', 'femi9')).toBe('/femi9/orders')
    expect(safeNext('/lumi9/products?page=2', 'lumi9')).toBe('/lumi9/products?page=2')
  })

  it('refuses to leave the site', () => {
    for (const evil of [
      'https://evil.example.com',
      'http://evil.example.com',
      '//evil.example.com',
      '///evil.example.com',
      'javascript:alert(1)',
      '\\evil.example.com',
      '/\evil.example.com',
    ]) {
      expect(safeNext(evil, 'femi9')).toBe('/femi9')
    }
  })

  // A Femi9 session must not be walked into the Lumi9 console by a crafted link.
  it('refuses to cross into the other brand', () => {
    expect(safeNext('/lumi9/orders', 'femi9')).toBe('/femi9')
    expect(safeNext('/femi9/orders', 'lumi9')).toBe('/lumi9')
  })

  it('falls back for anything missing or not a brand path', () => {
    for (const v of [null, undefined, '', 'orders', '/', '/notabrand/x', '/FEMI9/x']) {
      expect(safeNext(v, 'femi9')).toBe('/femi9')
    }
  })

  /**
   * The gap this file did not close for a long time: every assertion above
   * passed while NOTHING in the app imported the function.
   *
   * `login/page.tsx` did its own check — `next.startsWith('/')` — which
   * `//evil.example` satisfies, and `LoginCard` pushed that value straight into
   * `router.push`. A protocol-relative path there is an off-site navigation, so
   * `/login?brand=lumi9&next=//evil.example` signed an admin in and then landed
   * them on somebody else's page. Verified against a running console before the
   * fix: the browser ended up on `http://example.com/phish`.
   *
   * A validator nobody calls is worse than no validator: it makes the code read
   * as though the question has been dealt with. So this asserts the call site,
   * not just the function.
   */
  it('is actually called on the login redirect', () => {
    const card = readFileSync(join(process.cwd(), 'app', 'login', 'LoginCard.tsx'), 'utf8')
    expect(card).toContain('safeNext')
    // Specifically: the value handed to router.push must be the validated one.
    expect(card).toMatch(/router\.push\(\s*safeNext\(/)
    expect(card).not.toMatch(/router\.push\(\s*next\s*\?\?/)
  })
})
