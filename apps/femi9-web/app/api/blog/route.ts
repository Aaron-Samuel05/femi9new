import { ok, handle } from '@/lib/api'
import { listPosts, listCategories } from '@/lib/services/blog'

export const dynamic = 'force-dynamic'

/** GET /api/blog — the full blog index: posts + category chips. */
export async function GET() {
  return handle(async () => {
    const [posts, categories] = await Promise.all([listPosts(), listCategories()])
    return ok({ posts, categories })
  })
}
