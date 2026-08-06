import { PeriodsWall } from '@/screens/PeriodsWall'
import { listApprovedPosts } from '@/lib/services/wall'

// Server component: approved wall posts are fetched from Postgres and handed to
// the (client) PeriodsWall screen as props. Force-dynamic so a freshly approved
// story shows on the next visit without a stale cache.
export const dynamic = 'force-dynamic'

export default async function PeriodsWallPage() {
  const posts = await listApprovedPosts()
  return <PeriodsWall posts={posts} />
}
