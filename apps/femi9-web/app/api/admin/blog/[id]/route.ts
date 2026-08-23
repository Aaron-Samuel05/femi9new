import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { requireAdmin } from '@femi9/core/admin-auth'
import {
  BlogPostInputSchema,
  deletePost,
  getPostAdmin,
  updatePost,
} from '@femi9/core/services/admin/blog-admin'

/**
 * /api/admin/blog/[id] — single-post endpoint.
 *   GET    → full post for the editor.
 *   PATCH  → update the post (auto-slug, body split from the textarea).
 *   DELETE → hard delete the post.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

/** Map known Prisma constraint failures to friendly 400s / 404s. */
function mapPrismaError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return badRequest('That slug is already taken')
    if (err.code === 'P2003') return badRequest('Please choose a valid category')
    if (err.code === 'P2025') return notFound('Post not found')
  }
  return null
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const post = await getPostAdmin('femi9', params.id)
    if (!post) return notFound('Post not found')
    return ok(post)
  })
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = BlogPostInputSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Please fix the errors below', parsed.error.flatten())

    try {
      return ok(await updatePost('femi9', params.id, parsed.data))
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err
    }
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireAdmin()
  if (!s) return unauthorized()

  return handle(async () => {
    try {
      return ok(await deletePost('femi9', params.id))
    } catch (err) {
      const mapped = mapPrismaError(err)
      if (mapped) return mapped
      throw err
    }
  })
}
