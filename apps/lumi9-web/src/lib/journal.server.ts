import 'server-only'
import {
  getPost as getPostFor,
  listCategories as listCategoriesFor,
  listPosts as listPostsFor,
  relatedPosts as relatedPostsFor,
  type BlogCategoryDTO,
  type BlogPostDTO,
} from '@femi9/core/services/blog'

/**
 * The Journal, from the `lumi9` schema.
 *
 * `src/lib/journal.ts` used to BE the journal; it is now the seed's input, the
 * same relationship `catalog.ts` has to `catalog.server.ts`. Editing that module
 * changes what `npm run db:seed-journal` writes and nothing that is already
 * live — a published article is edited in the console, at /lumi9/content/blog.
 *
 * These are thin wrappers over the brand-agnostic loaders in
 * `@femi9/core/services/blog` and exist for one reason: the brand literal is
 * written ONCE. A page that passed `'femi9'` here would read the other brand's
 * schema and render its articles under Lumi9's chrome, and nothing about the
 * call site would look wrong.
 *
 * ⚠️ Every caller must stay `force-dynamic`, which the whole tree already is.
 * The Docker build stage has no database credentials, so anything that reads
 * these at build time — `generateStaticParams`, a prerendered route — turns a
 * content query into a build failure. That is why the article route no longer
 * declares its slug set statically.
 */

export type JournalArticle = BlogPostDTO
export type JournalCategoryDTO = BlogCategoryDTO

const BRAND = 'lumi9' as const

/** Every approved post, featured first then newest. */
export function listJournalPosts(): Promise<JournalArticle[]> {
  return listPostsFor(BRAND)
}

/** One approved post by slug, or null. */
export function getJournalPost(slug: string): Promise<JournalArticle | null> {
  return getPostFor(BRAND, slug)
}

/**
 * The chips above the grid.
 *
 * Note this returns EVERY category the brand has, where the module it replaced
 * only returned the ones with a post behind them. That filter belongs to the
 * caller now — it has the posts in hand, and a category the console created for
 * next week's article should not vanish from a listing query.
 */
export function listJournalCategories(): Promise<JournalCategoryDTO[]> {
  return listCategoriesFor(BRAND)
}

/** Up to `n` related reads: same category first, then the most recent others. */
export function relatedJournalPosts(slug: string, n = 3): Promise<JournalArticle[]> {
  return relatedPostsFor(BRAND, slug, n)
}
