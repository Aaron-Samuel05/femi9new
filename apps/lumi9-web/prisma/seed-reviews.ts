/**
 * Seed Lumi9's launch reviews into the `lumi9` schema.
 *
 * The storefront's social proof used to be two arrays in `src/lib/content.ts` —
 * `PARENT_REVIEWS` on the home rail and `PDP_REVIEWS` under every product —
 * printed under a "Verified buyer" badge and a "Loved by 40,000+ families"
 * heading. The console has had a moderation queue at /lumi9/reviews the whole
 * time, reading `Review` rows that no Lumi9 surface displayed: approving or
 * hiding a review changed nothing a shopper saw.
 *
 *   DATABASE_URL_LUMI9=postgresql://…/db?schema=lumi9 npm run db:seed-reviews
 *
 * ⚠️ These are the LAUNCH copy, carried over so the rails are not empty on day
 * one. They are `approved` and they are NOT verified purchases — `userId` is
 * null on every one, which is exactly why `listReviews` reports `verified:
 * false` and the badge no longer prints for them. Delete them in the console
 * once real reviews arrive.
 *
 * Idempotent by (product, name, body): a rerun updates the row in place rather
 * than stacking a second copy of the same quote.
 */
import { dbFor } from '@femi9/db'
import { PARENT_REVIEWS, PDP_REVIEWS } from '../src/lib/content'

const BRAND = 'lumi9' as const

/** `“…”` → `…`. The modules stored their own smart quotes; the card adds them. */
function unquote(text: string): string {
  return text.replace(/^[\s“"']+|[\s”"']+$/g, '')
}

async function main() {
  const db = dbFor(BRAND)

  // Ordered as the seed wrote them — NB, S, M, L, XL.
  const products = await db.product.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, slug: true },
  })
  if (products.length === 0) {
    throw new Error('No products in the lumi9 schema — run `npm run db:seed` first.')
  }

  /**
   * Which product a review belongs to.
   *
   * `Review` has a NOT NULL productId, and the home rail's quotes are about the
   * brand rather than a size. Spreading them round-robin across the sizes is the
   * honest compromise the schema allows: every quote stays visible on the
   * brand-wide rail, each one is attached to something a moderator can find, and
   * no single product accumulates all eight.
   */
  const rows = [
    ...PDP_REVIEWS.map((r, i) => ({
      name: r.name,
      place: r.role,
      body: unquote(r.quote),
      productId: products[i % products.length].id,
    })),
    ...PARENT_REVIEWS.map((r, i) => ({
      name: r.name,
      place: null,
      body: unquote(r.quote),
      // Offset so these do not all land on the same products as the PDP set.
      productId: products[(i + PDP_REVIEWS.length) % products.length].id,
    })),
  ]

  let created = 0
  let updated = 0

  for (const row of rows) {
    const data = {
      productId: row.productId,
      name: row.name,
      place: row.place,
      rating: 5,
      body: row.body,
      status: 'approved' as const,
      // Never a userId: these are launch copy, not purchases, and attaching one
      // would make `verified` true and print a badge that is not earned.
      userId: null,
    }

    const existing = await db.review.findFirst({
      where: { productId: row.productId, name: row.name, body: row.body },
      select: { id: true },
    })
    if (existing) {
      await db.review.update({ where: { id: existing.id }, data })
      updated++
    } else {
      await db.review.create({ data })
      created++
    }
  }

  /**
   * `Product.rating` and `reviewCount` are denormalised counters the cards read.
   * Recomputed here from the rows that actually exist, so a product's star line
   * cannot claim an average nothing in the queue supports.
   */
  for (const product of products) {
    const stats = await db.review.aggregate({
      where: { productId: product.id, status: 'approved' },
      _avg: { rating: true },
      _count: true,
    })
    await db.product.update({
      where: { id: product.id },
      data: {
        rating: Math.round((stats._avg.rating ?? 0) * 10) / 10,
        reviewCount: stats._count,
      },
    })
  }

  console.log(
    JSON.stringify(
      { brand: BRAND, reviews: { created, updated }, products: products.map((p) => p.slug) },
      null,
      2,
    ),
  )

  await db.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
