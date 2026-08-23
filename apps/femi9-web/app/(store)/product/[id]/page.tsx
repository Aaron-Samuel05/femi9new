import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProduct, listProducts } from '@femi9/core/services/products'
import { ProductDetail } from '@/screens/ProductDetail'

// Per-page SEO: reuse the same loader the page uses, mapping the resolved
// product onto title/description/Open-Graph. Never throws — an unresolved slug
// gets a sensible fallback title (the page itself still renders notFound()).
export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params;
  const data = await getProduct('femi9', params.id)
  if (!data) return { title: 'Product not found · Femi9' }
  const { product } = data
  const title = `${product.name} · Femi9`
  const description = product.desc
  const images = product.img ? [product.img] : undefined
  return {
    title,
    description,
    openGraph: { title, description, images },
  }
}

// Server component: the slug lives in the URL, so we resolve the product from
// Postgres on the server and hand it to the (client) detail screen as props.
export default async function ProductPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const [data, products] = await Promise.all([getProduct('femi9', params.id), listProducts('femi9')])
  if (!data) notFound()
  return <ProductDetail product={data.product} extra={data.extra} reviews={data.reviews} relatedProducts={products.filter((p) => p.id !== params.id).slice(0, 4)} />
}
