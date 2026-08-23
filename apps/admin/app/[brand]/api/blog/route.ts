import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, created, handle, ok, unauthorized } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import {
  BlogPostInputSchema,
  createPost,
  listPostsAdmin,
} from '@femi9/core/services/admin/blog-admin'

/**
 * /<brand>/api/blog — collection endpoint for the content CMS.
 *   GET  → list every post (all statuses) for the admin table.
 *   POST → create a post (auto-slug, body split from the textarea).
 * Both guarded by requireAdmin; the (panel) shell also guards the pages.
 */

/** Map known Prisma constraint failures to friendly 400s the form can show. */
function mapPrismaError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Slug collision that beat the in-service uniqueness check (rare race).
    if (err.code === 'P2002') return badRequest('That slug is already taken')
    // categoryId pointing at a category that doesn't exist.
    if (err.code === 'P2003') return badRequest('Please choose a valid category')
  }
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => ok(await listPostsAdmin(brand)))
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand)
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = BlogPostInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return created(await createPost(brand, parsed.data))
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err // let handle() turn anything unexpected into a 500
    }
  })
}
