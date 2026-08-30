import { requireConsole } from '@/lib/guard'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminProduct } from '@femi9/core/services/admin/products'
import ProductForm, { type ProductFormValues } from '../_form'

/**
 * Edit-product screen. Server component: loads the full product, maps the DB row
 * onto the form's value shape, and hands it to the same shared <ProductForm/> in
 * edit mode. Next 14.2: `params` is a plain synchronous object.
 */
export const dynamic = 'force-dynamic'

export default async function EditProductPage(props: { params: Promise<{ brand: string; id: string }> }) {
  const { brand } = await requireConsole((await props.params).brand, 'catalog')
  const params = await props.params;
  const p = await getAdminProduct(brand, params.id)
  if (!p) notFound()

  const initial: ProductFormValues = {
    name: p.name,
    slug: p.slug,
    type: p.type,
    basePrice: p.basePrice,
    meta: p.meta,
    flow: p.flow,
    description: p.description,
    longDescription: p.longDescription ?? '',
    tag: p.tag ?? '',
    status: p.status,
    images: p.images.map((i) => i.url),
    features: p.features.map((f) => ({ title: f.title, body: f.body })),
    specs: p.specs.map((sp) => ({ key: sp.key, value: sp.value })),
    variants: p.variants.map((v) => ({
      id: v.id,
      kind: v.kind,
      label: v.label,
      packCount: v.packCount,
      size: v.size,
      price: v.price,
      sku: v.sku ?? '',
      stock: v.stock,
      active: v.active,
    })),
  }

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            Edit product
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            {p.name}
          </p>
        </div>
        <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/${brand}/products`}>
          ← Back to products
        </Link>
      </div>

      <ProductForm mode="edit" productId={p.id} initial={initial} />
    </>
  )
}
