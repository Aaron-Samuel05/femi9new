import type { Metadata } from 'next'
import Link from 'next/link'
import { listProducts } from '@/lib/services/products'
import { ProductCard } from '@/components/ProductCard'

/**
 * /products — the full catalog.
 *
 * The landing page's "View All" button pointed at `/#products`, the anchor of
 * the section the button itself sits inside: clicking it scrolled nowhere and
 * implied a catalog route that did not exist. Rather than delete the control,
 * this is the page it was always promising.
 *
 * Deliberately built from the existing storefront primitives — `.wrap`,
 * `.eyebrow`, `.grid-products`, `<ProductCard>` — so it inherits the landing
 * page's card behaviour (hover lift, one-tap add, sold-out guard) without
 * restyling anything.
 */

export const metadata: Metadata = {
  title: 'Shop All Sanitary Pads | Femi9 Organic Period Care',
  description:
    'Every Femi9 pad in one place — light, regular and heavy flow, plus reusable period underwear. Cotton-soft, breathable and rash-free.',
}

// Reads the live catalog, so it renders per request (the DB is not reachable
// during the container image build).
export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const products = await listProducts().catch(() => [])

  return (
    <main className="wrap section">
      <span className="eyebrow">Shop</span>
      <h1 className="display" style={{ fontSize: 'clamp(2rem,4.5vw,3rem)', margin: '.35em 0 .5rem' }}>
        Every Femi9 pad, in one place.
      </h1>
      <p style={{ color: 'var(--muted)', maxWidth: '52ch', lineHeight: 1.55, marginBottom: 'clamp(28px,4vw,44px)' }}>
        Light, regular or heavy — choose the size and protection that matches your flow.
      </p>

      {products.length === 0 ? (
        <div style={{ padding: 'clamp(32px,5vw,56px) 0' }}>
          <p style={{ color: 'var(--muted)', marginBottom: 18 }}>
            Our catalog is being updated right now. Please check back shortly.
          </p>
          <Link href="/" className="btn btn-ghost">
            Back to home
          </Link>
        </div>
      ) : (
        <div className="grid-products">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} showInsideOnHover />
          ))}
        </div>
      )}
    </main>
  )
}
