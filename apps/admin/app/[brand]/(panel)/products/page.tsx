import { requireConsole } from '@/lib/guard'
import Link from 'next/link'
import { featuredSlots } from '@femi9/core/brands'
import { listAdminProducts } from '@femi9/core/services/admin/products'
import { FeatureToggle } from './_feature-toggle'

/**
 * Products index — the admin catalogue table. Server component: reads the
 * service directly (no fetch hop). Shows every status so drafts/archived rows
 * are manageable, with an "Add product" primary action and per-row Edit links.
 */

export const dynamic = 'force-dynamic' // always reflect the latest catalogue

const inr = new Intl.NumberFormat('en-IN')

const STATUS_BADGE: Record<string, string> = {
  active: 'adm-badge--green',
  draft: 'adm-badge--amber',
  archived: 'adm-badge--gray',
}

export default async function AdminProductsPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await requireConsole((await params).brand, 'catalog')
  const products = await listAdminProducts(brand)

  // How many products this brand's landing page leads with. `0` means it has no
  // featured rail (Lumi9's homepage product section is the size run), and then
  // the column is not rendered at all rather than offering a control that
  // changes nothing a shopper sees. See BrandConfig.featuredSlots.
  const slots = featuredSlots(brand)
  const featuredCount = products.filter((p) => p.featured).length

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            Products
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            {products.length} {products.length === 1 ? 'product' : 'products'} in the catalogue
            {slots > 0 && (
              <>
                {' · '}
                <strong style={{ color: featuredCount === slots ? 'var(--plum)' : 'inherit' }}>
                  {featuredCount} of {slots}
                </strong>{' '}
                featured on the landing page
              </>
            )}
          </p>
        </div>
        <Link className="adm-btn adm-btn--primary" href={`/${brand}/products/new`}>
          + Add product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No products yet</p>
          <p>Create your first product to start selling.</p>
          <Link className="adm-btn adm-btn--primary" href={`/${brand}/products/new`} style={{ marginTop: 8 }}>
            + Add product
          </Link>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: 52 }}>{/* thumb */}</th>
                <th>Product</th>
                <th>Type</th>
                <th className="adm-td-num">Price</th>
                <th className="adm-td-num">Variants</th>
                <th className="adm-td-num">Stock</th>
                <th>Status</th>
                {slots > 0 && <th style={{ width: 116 }}>Landing page</th>}
                <th style={{ width: 64 }}>{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span
                      aria-hidden
                      style={{
                        display: 'block',
                        width: 40,
                        height: 40,
                        borderRadius: 8,
                        border: '1px solid var(--line)',
                        background: p.thumb
                          ? `center / cover no-repeat url(${JSON.stringify(p.thumb)})`
                          : 'var(--plum-tint)',
                      }}
                    />
                  </td>
                  <td>
                    <Link
                      href={`/${brand}/products/${p.id}`}
                      style={{ color: 'var(--ink)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {p.name}
                    </Link>
                    <div className="adm-cell-muted" style={{ fontSize: 12 }}>
                      {p.slug}
                    </div>
                  </td>
                  <td>
                    <span className="adm-badge adm-badge--plum">{p.type}</span>
                  </td>
                  <td className="adm-td-num">₹{inr.format(p.basePrice)}</td>
                  <td className="adm-td-num">{p.variantCount}</td>
                  <td className="adm-td-num">{inr.format(p.totalStock)}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[p.status] ?? 'adm-badge--gray'}`}>
                      {p.status}
                    </span>
                  </td>
                  {slots > 0 && (
                    <td>
                      <FeatureToggle
                        productId={p.id}
                        featured={p.featured}
                        // Every slot taken by some OTHER product. A featured row
                        // is never "full" against itself — it can always be
                        // switched off, which is how a slot is freed.
                        full={featuredCount >= slots}
                        publishable={p.status === 'active'}
                        limit={slots}
                      />
                    </td>
                  )}
                  <td>
                    <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/${brand}/products/${p.id}`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
