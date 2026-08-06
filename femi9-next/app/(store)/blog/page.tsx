import type { Metadata } from 'next'
import { Blog } from '@/screens/Blog'
import { listPosts, listCategories } from '@/lib/services/blog'

export const metadata: Metadata = {
  title: 'Journal · Femi9',
  description:
    'Stories, guides, and honest talk on periods, organic care, and living well — the Femi9 Journal.',
}

// Journal posts come from Postgres — render at request time, not at build (the
// DB isn't reachable while the container image is being built).
export const dynamic = 'force-dynamic'

// Server component: the journal list and its category chips are fetched from
// Postgres and handed to the (client) Blog screen as props.
export default async function BlogPage() {
  const [posts, categories] = await Promise.all([listPosts(), listCategories()])
  return <Blog posts={posts} categories={categories} />
}
