import { describe, it, expect } from 'vitest'
import { Buffer } from 'node:buffer'
import { extractMmdb } from '../../scripts/fetch-geoip.mjs'

/**
 * The tar reader in scripts/fetch-geoip.mjs.
 *
 * Hand-rolled binary parsing is the riskiest code in this change, and it runs at
 * IMAGE BUILD TIME: if it silently returns the wrong bytes, the container ships
 * with a corrupt GeoLite2 database, every lookup fails closed, and the only
 * symptom is that the carrier gate quietly stops working in production. MaxMind
 * serves nothing but .tar.gz, and shelling out to `tar` would behave differently
 * on an Alpine build stage and a developer's Windows machine — hence both the
 * parser and this test.
 */

const BLOCK = 512

/** Build a minimal ustar archive from `{ name, body }` members. */
function tar(members: { name: string; body: Buffer }[]): Buffer {
  const chunks: Buffer[] = []
  for (const { name, body } of members) {
    const header = Buffer.alloc(BLOCK)
    header.write(name, 0, 100, 'utf8')
    // Size is a NUL-terminated octal string in a 12-byte field.
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8')
    header.write('0', 156, 1, 'utf8') // typeflag: regular file
    chunks.push(header, body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK))
  }
  // Two zero blocks terminate the archive.
  chunks.push(Buffer.alloc(BLOCK * 2))
  return Buffer.concat(chunks)
}

describe('extractMmdb', () => {
  it('finds the .mmdb past the members MaxMind puts in front of it', () => {
    // A real GeoLite2 archive leads with a dated directory, a COPYRIGHT and a
    // LICENSE before the database — taking the first member would return those.
    const database = Buffer.from('MMDB-PAYLOAD-CONTENTS')
    const archive = tar([
      { name: 'GeoLite2-ASN_20260811/COPYRIGHT.txt', body: Buffer.from('(c) MaxMind') },
      { name: 'GeoLite2-ASN_20260811/LICENSE.txt', body: Buffer.from('CC BY-SA 4.0') },
      { name: 'GeoLite2-ASN_20260811/GeoLite2-ASN.mmdb', body: database },
    ])
    expect(extractMmdb(archive)?.equals(database)).toBe(true)
  })

  it('returns exactly the payload, with no block padding attached', () => {
    // The body is padded to a 512-byte boundary on the wire. Returning the
    // padding would append NUL bytes to the database and corrupt it — a failure
    // that only shows up when `maxmind` tries to read the file.
    const database = Buffer.from('x'.repeat(700))
    const extracted = extractMmdb(tar([{ name: 'a/GeoLite2-City.mmdb', body: database }]))
    expect(extracted).toHaveLength(700)
    expect(extracted?.equals(database)).toBe(true)
  })

  it('handles a payload that lands exactly on a block boundary', () => {
    const database = Buffer.from('y'.repeat(BLOCK * 2))
    const extracted = extractMmdb(
      tar([
        { name: 'a/README.txt', body: Buffer.from('z'.repeat(BLOCK)) },
        { name: 'a/GeoLite2-City.mmdb', body: database },
      ]),
    )
    expect(extracted?.equals(database)).toBe(true)
  })

  it('returns null for an archive with no database in it', () => {
    // What an HTML error page gunzips to, or an edition the account cannot
    // access. The caller turns this into a build-visible error rather than
    // writing a zero-byte .mmdb.
    expect(extractMmdb(tar([{ name: 'a/COPYRIGHT.txt', body: Buffer.from('nope') }]))).toBeNull()
    expect(extractMmdb(Buffer.alloc(BLOCK * 2))).toBeNull()
    expect(extractMmdb(Buffer.alloc(0))).toBeNull()
  })

  it('throws on a corrupt size field rather than reading past it', () => {
    const archive = tar([{ name: 'a/GeoLite2-ASN.mmdb', body: Buffer.from('data') }])
    archive.write('not-octal!!!', 124, 12, 'utf8')
    expect(() => extractMmdb(archive)).toThrow(/Corrupt tar header/)
  })
})
