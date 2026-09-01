import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { dbFor, disconnectAll } from '@femi9/db'
import { featuredSlots } from '@femi9/core/brands'
import {
  FeaturedError,
  FeaturedLimitError,
  archiveProduct,
  createProduct,
  getFeaturedCapacity,
  setProductFeatured,
  updateProduct,
} from '@femi9/core/services/admin/products'
import { listFeaturedProducts } from '@femi9/core/services/products'

/**
 * The landing page leads with a FIXED number of products, and the console picks
 * them.
 *
 * The cap is the whole feature, and it is the part that cannot live in the
 * schema: Postgres has no way to say "at most five rows where featured" without
 * a trigger, and how many is a per-brand layout fact (`featuredSlots`), not a
 * property of the schema the two brands share. So it is enforced in the service,
 * inside the write transaction — which makes it exactly the kind of rule that
 * silently stops holding when somebody adds a sixth write path.
 *
 * Requires the femi9 test schema migrated — see apps/admin/CLAUDE.md.
 */

const db = dbFor('femi9')
const SLOTS = featuredSlots('femi9')

// Marker products, so the test never depends on what the seed happens to hold.
const MARK = 'featured-test'

let ids: string[] = []

async function makeProduct(n: number, status: 'active' | 'draft' = 'active') {
  const product = await createProduct('femi9', {
    name: `Featured Test ${n}`,
    slug: `${MARK}-${n}`,
    type: 'pad',
    basePrice: 199,
    meta: '9 pads',
    flow: 'Heavy',
    description: 'featured rail fixture',
    status,
    images: [],
    variants: [],
  } as never)
  return product.id
}

async function cleanup() {
  await db.productVariant.deleteMany({ where: { product: { slug: { startsWith: MARK } } } })
  await db.product.deleteMany({ where: { slug: { startsWith: MARK } } })
  // Nothing seeds `featured`, but a half-finished earlier run could leave a row
  // holding a slot and every assertion below would then be off by one.
  await db.product.updateMany({ where: { featured: true }, data: { featured: false, featuredAt: null } })
}

beforeAll(async () => {
  await cleanup()
  ids = []
  for (let n = 0; n < SLOTS + 1; n++) ids.push(await makeProduct(n))
})

afterAll(async () => {
  await cleanup()
  await disconnectAll()
})

describe('the featured rail holds exactly as many products as the page has slots', () => {
  it('accepts the first SLOTS and refuses the next one', async () => {
    for (let n = 0; n < SLOTS; n++) {
      const row = await setProductFeatured('femi9', ids[n], true)
      expect(row?.featured).toBe(true)
    }

    expect(await getFeaturedCapacity('femi9')).toEqual({ limit: SLOTS, used: SLOTS, remaining: 0 })

    // The one that would make it SLOTS + 1.
    await expect(setProductFeatured('femi9', ids[SLOTS], true)).rejects.toBeInstanceOf(
      FeaturedLimitError,
    )
    expect((await getFeaturedCapacity('femi9')).used).toBe(SLOTS)
  })

  it('does not count a product against its own slot when it is re-saved', async () => {
    // The rail is full and ids[0] is one of the five. Editing it must not fail
    // the cap check — it is not asking for a slot, it already has one.
    await expect(
      updateProduct('femi9', ids[0], {
        name: 'Featured Test 0 (edited)',
        slug: `${MARK}-0`,
        type: 'pad',
        basePrice: 249,
        meta: '9 pads',
        flow: 'Heavy',
        description: 'featured rail fixture',
        status: 'active',
        featured: true,
        images: [],
        variants: [],
      } as never),
    ).resolves.toBeTruthy()

    expect((await getFeaturedCapacity('femi9')).used).toBe(SLOTS)
  })

  it('leaves the flag alone when a payload omits it', async () => {
    // `featured` is optional with no default precisely so a client that does not
    // send it cannot silently pull a product off the homepage.
    await updateProduct('femi9', ids[1], {
      name: 'Featured Test 1',
      slug: `${MARK}-1`,
      type: 'pad',
      basePrice: 199,
      meta: '9 pads',
      flow: 'Heavy',
      description: 'no featured key in this payload',
      status: 'active',
      images: [],
      variants: [],
    } as never)

    const row = await db.product.findUnique({ where: { id: ids[1] }, select: { featured: true } })
    expect(row?.featured).toBe(true)
  })

  it('frees the slot when a featured product is unpublished or archived', async () => {
    await archiveProduct('femi9', ids[2])
    const archived = await db.product.findUnique({
      where: { id: ids[2] },
      select: { featured: true, featuredAt: true },
    })
    // Otherwise the flag outlives the product: the storefront's `status: active`
    // filter hides the card, the rail quietly renders four, and the console goes
    // on counting a slot nobody can free.
    expect(archived).toEqual({ featured: false, featuredAt: null })

    expect((await getFeaturedCapacity('femi9')).used).toBe(SLOTS - 1)

    // Which means the sixth product can now take the free slot.
    await expect(setProductFeatured('femi9', ids[SLOTS], true)).resolves.toMatchObject({
      featured: true,
    })
  })

  it('refuses to feature a product that is not published', async () => {
    const draftId = await makeProduct(99, 'draft')
    await setProductFeatured('femi9', ids[3], false) // make room first
    await expect(setProductFeatured('femi9', draftId, true)).rejects.toBeInstanceOf(FeaturedError)
  })

  it('is idempotent — asking for the state it is already in is not an error', async () => {
    // Two clicks on a slow connection send two requests; the second must not be
    // the one that reports the rail is full.
    const before = (await getFeaturedCapacity('femi9')).used
    await expect(setProductFeatured('femi9', ids[0], true)).resolves.toMatchObject({
      featured: true,
    })
    expect((await getFeaturedCapacity('femi9')).used).toBe(before)
  })

  it('returns 404-ish null for an id that does not exist', async () => {
    expect(await setProductFeatured('femi9', 'no-such-product', true)).toBeNull()
  })
})

describe('what the storefront reads', () => {
  it('serves the flagged products, oldest-featured first, capped at the slots', async () => {
    const rail = await listFeaturedProducts('femi9')
    expect(rail.length).toBeLessThanOrEqual(SLOTS)

    const flagged = await db.product.findMany({
      where: { status: 'active', featured: true },
      orderBy: [{ featuredAt: 'asc' }, { createdAt: 'asc' }],
      take: SLOTS,
      select: { slug: true },
    })
    expect(rail.map((p) => p.id)).toEqual(flagged.map((p) => p.slug))
  })

  it('falls back to the head of the catalogue when nothing is featured', async () => {
    await db.product.updateMany({
      where: { featured: true },
      data: { featured: false, featuredAt: null },
    })

    const rail = await listFeaturedProducts('femi9')
    const head = await db.product.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' },
      take: SLOTS,
      select: { slug: true },
    })
    // An empty homepage rail is a worse answer than the creation-ordered slice
    // this replaced, so the fallback is deliberate — see listFeaturedProducts.
    expect(rail.map((p) => p.id)).toEqual(head.map((p) => p.slug))
  })
})
