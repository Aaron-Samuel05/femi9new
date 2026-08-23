import Link from 'next/link'
import { listAdminProducts } from '@femi9/core/services/admin/products'

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

export default async function AdminProductsPage() {
  const products = await listAdminProducts('femi9')

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            Products
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            {products.length} {products.length === 1 ? 'product' : 'products'} in the catalogue
          </p>
        </div>
        <Link className="adm-btn adm-btn--primary" href="/admin/products/new">
          + Add product
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No products yet</p>
          <p>Create your first product to start selling.</p>
          <Link className="adm-btn adm-btn--primary" href="/admin/products/new" style={{ marginTop: 8 }}>
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
                      href={`/admin/products/${p.id}`}
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
                  <td>
                    <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/admin/products/${p.id}`}>
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
