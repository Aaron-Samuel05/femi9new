import 'server-only'
import { z } from 'zod'
import { dbFor, type Brand } from '@femi9/db'
import { isManagedImageUrl, MANAGED_IMAGE_URL_MESSAGE } from '../../image-url'

/**
 * Admin blog/content service — the write-side CMS for BlogPost rows. Mirrors the
 * shape of src/lib/services/admin/products.ts so the console stays one system:
 * a zod-validated input, auto-unique slug derivation, and thin read/write fns
 * the route handlers call.
 *
 * The one blog-specific twist is `body`: the DB column is String[] (one entry per
 * paragraph, a leading "## " marking a heading and "> " a pull-quote — the same
 * convention the storefront renderer already reads). The editor is a single
 * textarea, so the service is the seam that turns newline-separated text into that
 * array on write and the pages join it back for the textarea on read.
 */

// ─────────────────────────── Validation (zod) ───────────────────────────
// z.coerce on readTime so a JSON payload carrying "4" (from an <input>) is
// accepted as well as 4 — the form sends strings for numeric fields.

export const BlogPostInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  // Blank slug => auto-derived from the title and made unique in the service.
  slug: z.string().trim().optional().default(''),
  categoryId: z.string().trim().min(1, 'Category is required'),
  // excerpt/author/tone are NOT NULL in the schema; default '' keeps the form
  // forgiving while still writing a valid row (same stance as the product form).
  excerpt: z.string().trim().default(''),
  author: z.string().trim().default(''),
  readTime: z.coerce.number().int().min(1, 'Read time must be ≥ 1').default(4),
  tone: z.string().trim().default(''),
  // Empty image => null so the column stays NULL rather than an empty string.
  // A present one must be an image WE host — the editor's cover field is an
  // upload button, and this is the half of that rule a crafted request meets.
  image: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((v) => !v || isManagedImageUrl(v), MANAGED_IMAGE_URL_MESSAGE),
  featured: z.boolean().default(false),
  status: z.enum(['pending', 'approved', 'hidden']).default('approved'),
  // Raw textarea text — one block per line; split into the String[] column below.
  body: z.string().default(''),
})

export type BlogPostInput = z.infer<typeof BlogPostInputSchema>

// ───────────────────────────── Slug helpers ─────────────────────────────

function slugify(source: string): string {
  return source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve a unique slug. Derives from `source`, then appends -2, -3, … until it
 * finds a free one. `excludeId` lets an edit keep its own slug. The DB unique
 * index is the real backstop (P2002 → 400) if two writes race.
 */
async function resolveSlug(brand: Brand, source: string, excludeId?: string): Promise<string> {
  const prisma = dbFor(brand)
  const base = slugify(source) || 'post'
  let candidate = base
  let n = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await prisma.blogPost.findFirst({
      where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
    if (!clash) return candidate
    candidate = `${base}-${n++}`
  }
}

/**
 * Split the textarea into the String[] body column. Each non-empty line is one
 * block; we trim so a stray indent can't hide the "## "/"> " markers the reader
 * keys on, and drop blank lines so they don't become empty paragraphs.
 */
function splitBody(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

// ─────────────────────────────── Reads ──────────────────────────────────

/** All posts (every status) newest first, each with its category name. */
export async function listPostsAdmin(brand: Brand) {
  const prisma = dbFor(brand)
  try {
    const rows = await prisma.blogPost.findMany({
      orderBy: { publishedAt: 'desc' },
      include: { category: { select: { name: true } } },
    })

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      author: r.author,
      status: r.status,
      featured: r.featured,
      categoryName: r.category.name,
      publishedAt: r.publishedAt,
    }))
  } catch {
    return []
  }
}

/** One post, fully loaded for the editor (includes its category). */
export async function getPostAdmin(brand: Brand, id: string) {
  const prisma = dbFor(brand)
  return prisma.blogPost.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  })
}

/** Categories for the editor's <select>, alphabetical. */
export async function listCategoriesAdmin(brand: Brand) {
  const prisma = dbFor(brand)
  try {
    return await prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
  } catch {
    return []
  }
}

// ─────────────────────────────── Writes ─────────────────────────────────

export async function createPost(brand: Brand, input: BlogPostInput) {
  const prisma = dbFor(brand)
  const slug = await resolveSlug(brand, input.slug || input.title)

  return prisma.blogPost.create({
    data: {
      slug,
      title: input.title,
      categoryId: input.categoryId,
      excerpt: input.excerpt,
      author: input.author,
      readTime: input.readTime,
      tone: input.tone,
      image: input.image || null,
      featured: input.featured,
      status: input.status,
      body: splitBody(input.body),
    },
    select: { id: true },
  })
}

export async function updatePost(brand: Brand, id: string, input: BlogPostInput) {
  const prisma = dbFor(brand)
  const slug = await resolveSlug(brand, input.slug || input.title, id)

  return prisma.blogPost.update({
    where: { id },
    data: {
      slug,
      title: input.title,
      categoryId: input.categoryId,
      excerpt: input.excerpt,
      author: input.author,
      readTime: input.readTime,
      tone: input.tone,
      image: input.image || null,
      featured: input.featured,
      status: input.status,
      body: splitBody(input.body),
    },
    select: { id: true },
  })
}

/** Hard delete — a post has no order/history dependents, so removal is clean. */
export async function deletePost(brand: Brand, id: string) {
  const prisma = dbFor(brand)
  return prisma.blogPost.delete({ where: { id }, select: { id: true } })
}
