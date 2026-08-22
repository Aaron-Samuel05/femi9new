import { describe, it, expect } from 'vitest'
import { parseIp, v6Groups, v6PrefixKeys, v4PrefixKey, prefixKeyFor, V6_PREFIX_BITS } from '@femi9/core/geo/ip'

/**
 * Address parsing is the foundation every geo tier stands on: get the family
 * wrong and a mobile IPv6 viewer is gated as if she were on CGNAT'd IPv4, which
 * is the exact bug this work exists to fix. None of it is reachable without a
 * CDN in front of the app, so it is only ever exercised here.
 */
describe('parseIp', () => {
  it('reads the shapes the proxy chain actually sends', () => {
    expect(parseIp('49.207.1.2')).toMatchObject({ address: '49.207.1.2', version: 'v4' })
    // CloudFront-Viewer-Address appends the source port.
    expect(parseIp('49.207.1.2:51234')).toMatchObject({ address: '49.207.1.2', version: 'v4' })
    expect(parseIp('[2405:201:1:2::5]:51234')).toMatchObject({
      address: '2405:201:1:2::5',
      version: 'v6',
    })
    expect(parseIp('2405:201:1:2::5')).toMatchObject({ version: 'v6' })
  })

  it('unwraps v4-mapped v6 rather than keying it to a meaningless prefix', () => {
    // A dual-stack listener reports IPv4 clients like this. Treating it as v6
    // would file the viewer under a ::ffff: prefix that means nothing.
    expect(parseIp('::ffff:49.207.1.2')).toMatchObject({ address: '49.207.1.2', version: 'v4' })
  })

  it('flags addresses that can never be geo-located', () => {
    expect(parseIp('127.0.0.1')?.isPrivate).toBe(true)
    expect(parseIp('10.0.0.4')?.isPrivate).toBe(true)
    expect(parseIp('172.16.0.1')?.isPrivate).toBe(true)
    expect(parseIp('172.32.0.1')?.isPrivate).toBe(false) // just outside 172.16/12
    expect(parseIp('192.168.1.1')?.isPrivate).toBe(true)
    // 100.64/10 is the range carriers CGNAT *behind*; seeing it as a viewer
    // address means an internal hop leaked, not that a client is there.
    expect(parseIp('100.64.0.1')?.isPrivate).toBe(true)
    expect(parseIp('fd00::1')?.isPrivate).toBe(true)
    expect(parseIp('fe80::1')?.isPrivate).toBe(true)
    expect(parseIp('::1')?.isPrivate).toBe(true)
    expect(parseIp('2405:201:1::5')?.isPrivate).toBe(false)
  })

  it('returns null rather than guessing at rubbish', () => {
    // `clientIp()` falls back to this literal when no proxy header is present.
    expect(parseIp('unknown')).toBeNull()
    expect(parseIp('')).toBeNull()
    expect(parseIp(null)).toBeNull()
    expect(parseIp('999.1.1.1')).toBeNull()
    expect(parseIp('1.2.3')).toBeNull()
    expect(parseIp('2405::1::2')).toBeNull() // two "::" runs
    expect(parseIp('gggg::1')).toBeNull()
  })
})

describe('v6Groups', () => {
  it('expands "::" to the right number of zero groups', () => {
    expect(v6Groups('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(v6Groups('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(v6Groups('2405::')).toEqual([0x2405, 0, 0, 0, 0, 0, 0, 0])
    expect(v6Groups('2405:201::5')).toEqual([0x2405, 0x201, 0, 0, 0, 0, 0, 5])
  })

  it('accepts a fully written address and rejects a wrong-length one', () => {
    expect(v6Groups('2405:0201:0001:0002:0000:0000:0000:0005')).toEqual([
      0x2405, 0x201, 1, 2, 0, 0, 0, 5,
    ])
    expect(v6Groups('2405:201:1:2:0:0:0')).toBeNull() // seven groups, no "::"
    expect(v6Groups('2405:201:1:2:0:0:0:5:9')).toBeNull() // nine groups
  })
})

describe('IPv6 prefix keys', () => {
  it('produces nibble-aligned keys, longest first', () => {
    const keys = v6PrefixKeys(v6Groups('2405:201:1234:5678::1')!)
    expect(keys).toEqual([
      '240502011234/48',
      '24050201123/44',
      '2405020112/40',
      '240502011/36',
      '24050201/32',
    ])
    // Longest-first ordering is what makes the single-query lookup in
    // circles.ts a longest-prefix match.
    expect(keys.map((k) => Number(k.split('/')[1]))).toEqual([...V6_PREFIX_BITS])
  })

  it('gives two addresses in the same carrier block the same /32 key', () => {
    const a = v6PrefixKeys(v6Groups('2405:201:1000::1')!)
    const b = v6PrefixKeys(v6Groups('2405:201:9999::abcd')!)
    // Same allocation, different subscriber sites: the /32 agrees, the /48 does
    // not. That is exactly the spread a circle lookup relies on.
    expect(a.at(-1)).toBe(b.at(-1))
    expect(a[0]).not.toBe(b[0])
  })
})

describe('prefixKeyFor', () => {
  it('keys IPv4 at /24 and IPv6 at the subscriber site (/48)', () => {
    expect(v4PrefixKey([49, 207, 1, 2])).toBe('49.207.1.0/24')
    expect(prefixKeyFor(parseIp('49.207.1.2')!)).toBe('49.207.1.0/24')
    expect(prefixKeyFor(parseIp('2405:201:1234:5678::1')!)).toBe('240502011234/48')
  })
})
