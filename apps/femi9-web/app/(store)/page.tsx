import type { Metadata } from 'next'
import { Home } from '@/screens/Home'
import { listProducts, type ProductWithVariants } from '@femi9/core/services/products'
import { listPosts, type BlogPostDTO } from '@femi9/core/services/blog'

export const metadata: Metadata = {
  title: 'Femi9 Sanitary Pads | Rash-Free, Cotton-Soft Period Care India',
  description:
    'Shop Femi9 sanitary pads-cotton-soft, breathable, and reliably absorbent. Discover rash-free period care designed for everyday confidence. Made in India.',
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
  // Testimonials are no longer fetched here: the landing rail plays the customer
  // video clips (see VideoTestimonials), and the moderated Review table is read
  // by the product page, where the written reviews are shown.
  const [products, posts] = await Promise.all([listProducts('femi9'), listPosts('femi9')])
  return <Home products={products} posts={posts} />
}
