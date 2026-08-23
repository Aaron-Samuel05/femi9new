import Link from 'next/link'
import { requireConsole } from '@/lib/guard'
import ProductForm from '../_form'

/** Create-product screen — renders the shared form in create mode. */
export default async function NewProductPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await requireConsole((await params).brand, 'catalog')
  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            New product
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            Add product details and at least one purchasable variant.
          </p>
        </div>
        <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/${brand}/products`}>
          ← Back to products
        </Link>
      </div>

      <ProductForm mode="create" />
    </>
  )
}
