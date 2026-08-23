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
})
