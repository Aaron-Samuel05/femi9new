import type { Metadata } from 'next'
import { Home } from '@/screens/Home'
import { listProducts, type ProductWithVariants } from '@/lib/services/products'
import { listPosts, type BlogPostDTO } from '@/lib/services/blog'
import { listFeaturedReviews } from '@/lib/services/reviews-public'

export const metadata: Metadata = {
  title: 'Femi9 Sanitary Pads | Rash-Free, Cotton-Soft Period Care India',
  description:
    'Shop Femi9 sanitary pads—cotton-soft, breathable, and reliably absorbent. Discover rash-free period care designed for everyday confidence. Made in India.',
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
  // Testimonials come from the moderated Review table now; the authored set in
  // Home.tsx is only the fallback for a catalog with fewer than three approved
  // reviews. A failure here must not take the landing page down.
  const [products, posts, featuredReviews] = await Promise.all([
    listProducts(),
    listPosts(),
    listFeaturedReviews(6).catch(() => []),
  ])
  return <Home products={products} posts={posts} featuredReviews={featuredReviews} />
}
