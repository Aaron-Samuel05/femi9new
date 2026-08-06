import type { NextRequest } from 'next/server'
import { handle, notFound, ok } from '@/lib/api'
import { getGuestToken } from '@/lib/session'
import { likePost } from '@/lib/services/wall'

/**
 * /api/wall/[id]/like — POST increments a post's like count.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 *
 * The guest cookie is passed through for parity with the service signature, but
 * guests have no durable identity so likes aren't deduped (see likePost).
 */
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const token = await getGuestToken()
    const likeCount = await likePost(params.id, token)
    // null → post missing or not approved (can't like a pending/hidden story).
    if (likeCount === null) return notFound('Post not found')
    return ok({ likeCount })
  })
}
