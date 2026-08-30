/**
 * Seed the Lumi9 Journal into the `lumi9` schema.
 *
 * `src/lib/journal.ts` is this seed's INPUT, exactly as `src/lib/catalog.ts` is
 * the catalogue seed's. The storefront reads the DATABASE through
 * `@femi9/core/services/blog`, so editing that module changes what a fresh seed
 * writes and nothing that is already live — a published article is edited in the
 * console, at /lumi9/content/blog.
 *
 *   DATABASE_URL_LUMI9=postgresql://…/db?schema=lumi9 npm run db:seed-journal
 *
 * Separate from `db:seed` on purpose, and for the same reason `db:seed-zones` is
 * separate: the catalogue seed REPLACES images, specs and variants wholesale, and
 * editorial content has no business being rewritten every time somebody re-seeds
 * a price. Running this one twice is safe — slugs are stable, so a rerun updates
 * in place.
 *
 * ⚠️ It DOES overwrite an article the console has since edited. That is the
 * trade for idempotence, and it is why this is its own command rather than part
 * of the deploy path: run it once to import, then edit in the console.
 */
import { dbFor } from '@femi9/db'
import { JOURNAL_CATEGORIES, POSTS } from '../src/lib/journal'

const BRAND = 'lumi9' as const

async function main() {
  const db = dbFor(BRAND)

  // ── Categories ────────────────────────────────────────────────────────────
  // Upserted by name, which is the unique key — the chips carry a colour and a
  // tint the article page reads for its accent rule, so a post whose category is
  // missing would render with no accent at all rather than fail loudly.
  for (const category of JOURNAL_CATEGORIES) {
    await db.blogCategory.upsert({
      where: { name: category.name },
      create: { name: category.name, color: category.color, tint: category.tint },
      update: { color: category.color, tint: category.tint },
    })
  }

  let created = 0
  let updated = 0

  for (const post of POSTS) {
    const category = await db.blogCategory.findUnique({
      where: { name: post.category },
      select: { id: true },
    })
    // Loud, not silent: a post filed under a category the module never declared
    // would otherwise be dropped from the import with nothing to say so.
    if (!category) throw new Error(`Missing blog category: ${post.category}`)

    const data = {
      title: post.title,
      categoryId: category.id,
      excerpt: post.excerpt,
      author: post.author,
      readTime: post.readTime,
      // Femi9's posts carry a one-word mood here. Lumi9's briefs have none, so
      // the category name stands in — a real value beats an empty NOT NULL column.
      tone: post.category,
      image: post.image,
      imageAlt: post.imageAlt,
      featured: post.featured ?? false,
      status: 'approved' as const,
      body: post.body,
      metaTitle: post.metaTitle,
      keywords: post.keywords,
      cta: post.cta ?? null,
      // The module's date is a plain `YYYY-MM-DD`. Anchored at UTC midnight so
      // the row lands on the day the brief says, whatever the seeding machine's
      // timezone is — a local-midnight parse in India files an article a day early.
      publishedAt: new Date(`${post.published}T00:00:00Z`),
    }

    const existing = await db.blogPost.findUnique({ where: { slug: post.slug }, select: { id: true } })
    const row = existing
      ? await db.blogPost.update({ where: { id: existing.id }, data })
      : await db.blogPost.create({ data: { ...data, slug: post.slug } })

    if (existing) updated++
    else created++

    // FAQs: replaced wholesale, since position is what orders them and the set
    // is a handful of rows. Same stance as the catalogue seed takes with images.
    await db.blogPostFaq.deleteMany({ where: { postId: row.id } })
    if (post.faqs?.length) {
      await db.blogPostFaq.createMany({
        data: post.faqs.map((faq, position) => ({
          postId: row.id,
          question: faq.q,
          answer: faq.a,
          position,
        })),
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        brand: BRAND,
        categories: JOURNAL_CATEGORIES.length,
        posts: { created, updated },
        faqs: POSTS.reduce((n, p) => n + (p.faqs?.length ?? 0), 0),
        slugs: POSTS.map((p) => p.slug),
      },
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
