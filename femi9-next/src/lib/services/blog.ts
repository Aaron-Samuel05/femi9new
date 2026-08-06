import 'server-only'
import { prisma } from '@/lib/db'
import { CATEGORIES, CATEGORY_META, POSTS } from '@/data/blog'

/**
 * Blog service — the single seam between the database and the marketing pages.
 *
 * DB rows are mapped back onto the existing `BlogPost` shape (src/data/blog.ts)
 * so the blog list/detail components consume live content with no structural
 * change. `category` is flattened to the category *name* via the BlogCategory
 * relation, and `date` is a display string derived from `publishedAt` (the DB
 * keeps a real timestamp; the UI only ever showed the formatted label).
 */

export interface BlogPostDTO {
  slug: string
  title: string
  category: string
  excerpt: string
  author: string
  date: string
  readTime: number
  tone: string
  image?: string
  featured?: boolean
  body: string[]
}

export interface BlogCategoryDTO {
  name: string
  color: string
  tint: string
}

// featured first, then newest — the order the storefront grid expects.
const POST_ORDER = [{ featured: 'desc' }, { publishedAt: 'desc' }] as const

function loadRows() {
  return prisma.blogPost.findMany({
    where: { status: 'approved' },
    orderBy: [...POST_ORDER],
    include: { category: true },
  })
}

type Row = Awaited<ReturnType<typeof loadRows>>[number]

/** Map a DB row → the `BlogPost` shape the cards/detail page expect. */
function toPost(row: Row): BlogPostDTO {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category.name,
    excerpt: row.excerpt,
    author: row.author,
    // e.g. 'July 2, 2026' — matches the display strings the static data shipped.
    date: row.publishedAt.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    readTime: row.readTime,
    tone: row.tone,
    image: row.image ?? undefined,
    featured: row.featured,
    body: row.body,
  }
}

const fallbackPosts: BlogPostDTO[] = POSTS.map((post) => ({ ...post }))
const fallbackCategories: BlogCategoryDTO[] = CATEGORIES.map((name) => ({
  name,
  color: CATEGORY_META[name].color,
  tint: CATEGORY_META[name].tint,
}))

/** All approved posts, featured first then newest. */
export async function listPosts(): Promise<BlogPostDTO[]> {
  try {
    const rows = await loadRows()
    return rows.length ? rows.map(toPost) : fallbackPosts
  } catch {
    return fallbackPosts
  }
}

/** One approved post by slug, or null. */
export async function getPost(slug: string): Promise<BlogPostDTO | null> {
  try {
    const row = await prisma.blogPost.findFirst({
      where: { slug, status: 'approved' },
      include: { category: true },
    })
    return row ? toPost(row) : fallbackPosts.find((post) => post.slug === slug) ?? null
  } catch {
    return fallbackPosts.find((post) => post.slug === slug) ?? null
  }
}

/** Category chips — mirrors CATEGORY_META (name → color / tint). */
export async function listCategories(): Promise<BlogCategoryDTO[]> {
  try {
    const cats = await prisma.blogCategory.findMany({ orderBy: { name: 'asc' } })
    return cats.length ? cats.map((c) => ({ name: c.name, color: c.color, tint: c.tint })) : fallbackCategories
  } catch {
    return fallbackCategories
  }
}

/** Up to `n` related posts: same category first, then most-recent others. */
export async function relatedPosts(slug: string, n = 3): Promise<BlogPostDTO[]> {
  try {
    const current = await prisma.blogPost.findFirst({
      where: { slug, status: 'approved' },
      select: { categoryId: true },
    })
    if (!current) {
      const fallback = fallbackPosts.find((post) => post.slug === slug)
      return fallback
        ? fallbackPosts.filter((post) => post.slug !== slug && post.category === fallback.category).slice(0, n)
        : fallbackPosts.filter((post) => post.slug !== slug).slice(0, n)
    }

  const sameCat = await prisma.blogPost.findMany({
    where: { status: 'approved', slug: { not: slug }, categoryId: current.categoryId },
    orderBy: { publishedAt: 'desc' },
    include: { category: true },
    take: n,
  })

  const picked = [...sameCat]
  // Backfill from other categories when the same category can't fill `n`.
  if (picked.length < n) {
    const excludeSlugs = [slug, ...picked.map((p) => p.slug)]
    const others = await prisma.blogPost.findMany({
      where: { status: 'approved', slug: { notIn: excludeSlugs } },
      orderBy: { publishedAt: 'desc' },
      include: { category: true },
      take: n - picked.length,
    })
    picked.push(...others)
  }

    return picked.map(toPost)
  } catch {
    return fallbackPosts.filter((post) => post.slug !== slug).slice(0, n)
  }
}
