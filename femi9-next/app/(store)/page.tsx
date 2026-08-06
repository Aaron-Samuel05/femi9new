import type { Metadata } from 'next'
import { Home } from '@/screens/Home'
import { listProducts } from '@/lib/services/products'
import { listPosts } from '@/lib/services/blog'

export const metadata: Metadata = {
  title: 'Femi9 — Organic, breathable period care',
  description:
    'Shop Femi9 ultra-thin, breathable organic cotton pads with a mood-lifting anion strip. Toxin-free, biodegradable period care made for real life.',
}

// The catalog + journal teaser come from Postgres, so this page must render at
// request time (the DB isn't reachable during the container image build).
export const dynamic = 'force-dynamic'

// Server component: the catalog grid and journal teaser are now sourced from
// Postgres. We fetch on the server and hand the data to the (client) Home
// screen as props, so the markup/behaviour is unchanged — only the source moved.
export default async function HomePage() {
  // Keep the public landing page available when the catalog database is
  // temporarily unreachable (for example, in a fresh local checkout). The
  // Figma-authored teaser cards have their own visual fallbacks, while valid
  // database connections still provide live product and journal links.
  const [products, posts] = await Promise.all([
    listProducts().catch(() => []),
    listPosts().catch(() => []),
  ])
  return <Home products={products} posts={posts} />
}
