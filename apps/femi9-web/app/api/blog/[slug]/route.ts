import { ok, notFound, handle } from '@/lib/api'
import { getPost } from '@/lib/services/blog'

/** GET /api/blog/:slug — one approved post, or 404. */
export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const post = await getPost(params.slug)
    if (!post) return notFound()
    return ok(post)
  })
}
