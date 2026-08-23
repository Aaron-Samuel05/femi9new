import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dbFor, disconnectAll } from '@femi9/db'
import { listAdminProducts, createProduct } from '@femi9/core/services/admin/products'
import { listInventory } from '@femi9/core/services/admin/inventory'

/**
 * The claim the whole architecture rests on: one codebase, two brands, and no
 * way for a query to reach the wrong one's data.
 *
 * Isolation here is not a `where` clause — it is the connection. Each brand's
 * client is bound to its own Postgres schema, so these tests are checking a
 * property of the plumbing rather than the discipline of whoever wrote the
 * query. That is the point: a forgotten filter cannot cause a leak, because
 * there is no filter to forget.
 *
 * Requires both brand schemas migrated and seeded — see apps/admin/CLAUDE.md.
 */

const femi9 = dbFor('femi9')
const lumi9 = dbFor('lumi9')

// Marker products, so the test does not depend on seed contents staying fixed.
const MARK = 'iso-test'

beforeAll(async () => {
  for (const db of [femi9, lumi9]) {
    await db.productVariant.deleteMany({ where: { sku: { startsWith: MARK } } })
    await db.product.deleteMany({ where: { slug: { startsWith: MARK } } })
  }
})

afterAll(async () => {
  for (const db of [femi9, lumi9]) {
    await db.productVariant.deleteMany({ where: { sku: { startsWith: MARK } } })
    await db.product.deleteMany({ where: { slug: { startsWith: MARK } } })
  }
  await disconnectAll()
})

describe('the two brands cannot see each other', () => {
  it('writes through the SAME service land in different databases', async () => {
    await createProduct('femi9', {
      name: 'Isolation Pad',
      slug: `${MARK}-pad`,
      type: 'pad',
      basePrice: 199,
      meta: '9 pads',
      flow: 'Heavy',
      description: 'femi9 side',
      status: 'active',
      images: [],
      variants: [{ kind: 'pack', label: '9 pcs', packCount: 9, price: 199, sku: `${MARK}-pad-9`, stock: 5, active: true }],
    } as never)

    await createProduct('lumi9', {
      name: 'Isolation Diaper',
      slug: `${MARK}-diaper`,
      type: 'diaper',
      basePrice: 449,
      meta: '24 diapers',
      flow: '7–12 kg',
      description: 'lumi9 side',
      status: 'active',
      images: [],
      variants: [{ kind: 'pack', label: '24 pcs', packCount: 24, price: 449, sku: `${MARK}-diaper-24`, stock: 5, active: true }],
    } as never)

    const f = await listAdminProducts('femi9')
    const l = await listAdminProducts('lumi9')

    // Each brand sees its own …
    expect(f.some((p) => p.slug === `${MARK}-pad`)).toBe(true)
    expect(l.some((p) => p.slug === `${MARK}-diaper`)).toBe(true)

    // … and NOT the other's. This is the assertion that matters.
    expect(f.some((p) => p.slug === `${MARK}-diaper`)).toBe(false)
    expect(l.some((p) => p.slug === `${MARK}-pad`)).toBe(false)
  })

  it('lets both brands use the SAME slug without colliding', async () => {
    // `Product.slug` is globally unique — but "globally" means within one
    // Postgres schema, and each brand has its own. A discriminator column would
    // have needed a composite unique and a migration on live auth-adjacent data.
    const shared = `${MARK}-same-slug`
    for (const [brand, type, price] of [
      ['femi9', 'pad', 149],
      ['lumi9', 'diaper', 349],
    ] as const) {
      await createProduct(brand, {
        name: `Shared ${brand}`,
        slug: shared,
        type,
        basePrice: price,
        meta: 'x',
        flow: 'y',
        description: brand,
        status: 'active',
        images: [],
        variants: [{ kind: 'pack', label: '1', packCount: 1, price, sku: `${MARK}-${brand}-1`, stock: 1, active: true }],
      } as never)
    }

    const f = (await listAdminProducts('femi9')).find((p) => p.slug === shared)
    const l = (await listAdminProducts('lumi9')).find((p) => p.slug === shared)
    expect(f).toBeDefined()
    expect(l).toBeDefined()
    // Same slug, different rows, different prices.
    expect(f!.id).not.toBe(l!.id)
  })

  it('scopes inventory per brand too', async () => {
    const f = await listInventory('femi9')
    const l = await listInventory('lumi9')
    expect(f.some((r) => r.sku === `${MARK}-pad-9`)).toBe(true)
    expect(l.some((r) => r.sku === `${MARK}-pad-9`)).toBe(false)
    expect(l.some((r) => r.sku === `${MARK}-diaper-24`)).toBe(true)
  })
})

describe('the seeded catalogs are what each brand actually sells', () => {
  it('gives Femi9 period care and Lumi9 diapers, with no overlap of type', async () => {
    const f = (await listAdminProducts('femi9')).filter((p) => !p.slug.startsWith(MARK))
    const l = (await listAdminProducts('lumi9')).filter((p) => !p.slug.startsWith(MARK))

    expect(f.length).toBeGreaterThan(0)
    expect(l.length).toBe(5) // NB · S · M · L · XL

    expect(l.every((p) => p.slug.startsWith('cloud-soft-'))).toBe(true)
    // Femi9 never sells a diaper; Lumi9 sells nothing else.
    expect(f.some((p) => p.slug.startsWith('cloud-soft-'))).toBe(false)
  })
})
