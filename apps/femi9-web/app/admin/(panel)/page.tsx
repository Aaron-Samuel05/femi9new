import Link from 'next/link'
import type { OrderStatus } from '@prisma/client'
import { getOverview } from '@femi9/core/services/admin/analytics'
import { RevenueArea, CityBars, StatusDonut } from './_charts'

/**
 * Admin overview (/admin). Async server component: it reads live aggregates from
 * the analytics service and renders them into the shared .adm-* system. Only the
 * three charts cross into a client boundary (./_charts); everything else — tiles,
 * lists, tables — is server-rendered. Every card is empty-safe.
 */

// Rupee / integer formatters (en-IN grouping) — kept local so this server module
// doesn't import the charts' util (which pulls React hooks).
const inr = (n: number) => 'Rs.' + Math.round(n).toLocaleString('en-IN')
const num = (n: number) => n.toLocaleString('en-IN')

// Status → editorial label + chart color + badge class. Colors match the
// validated chart palette so the donut and the badges read as one system.
const STATUS_META: Record<OrderStatus, { label: string; color: string; badge: string }> = {
  pending: { label: 'Pending', color: '#A86E0A', badge: 'adm-badge--amber' },
  paid: { label: 'Paid', color: '#834BAA', badge: 'adm-badge--plum' },
  processing: { label: 'Processing', color: '#3E71C6', badge: 'adm-badge--plum' },
  shipped: { label: 'Shipped', color: '#0E9E94', badge: 'adm-badge--green' },
  delivered: { label: 'Delivered', color: '#1E824F', badge: 'adm-badge--green' },
  cancelled: { label: 'Cancelled', color: '#C24A34', badge: 'adm-badge--red' },
  refunded: { label: 'Refunded', color: '#8592a8', badge: 'adm-badge--gray' },
}

export default async function AdminDashboardPage() {
  const o = await getOverview('femi9')

  const cityBars = o.ordersByCity.slice(0, 6).map((c) => ({ label: c.city, value: c.orders }))
  const statusData = o.ordersByStatus.map((s) => ({
    label: STATUS_META[s.status].label,
    value: s.orders,
    color: STATUS_META[s.status].color,
  }))
  const totalOrdersAll = o.ordersByStatus.reduce((s, r) => s + r.orders, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── KPI tiles ─────────────────────────────────────────────── */}
      <section className="adm-grid" aria-label="Key metrics">
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Revenue</span>
            <span className="adm-stat-value">{inr(o.totalRevenue)}</span>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              Paid &amp; fulfilled orders
            </span>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Orders</span>
            <span className="adm-stat-value">{num(o.orderCount)}</span>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              Committed to revenue
            </span>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Customers</span>
            <span className="adm-stat-value">{num(o.customerCount)}</span>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              Registered shoppers
            </span>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Avg order value</span>
            <span className="adm-stat-value">{inr(o.avgOrderValue)}</span>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              Per order
            </span>
          </div>
        </div>
      </section>

      {/* ── Revenue trend (full width) ────────────────────────────── */}
      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-card-title">Revenue</h2>
          <span className="adm-cell-muted" style={{ fontSize: 12 }}>
            Last {o.revenueByMonth.length} months
          </span>
        </div>
        {o.totalRevenue > 0 ? (
          <RevenueArea
            labels={o.revenueByMonth.map((m) => m.label)}
            values={o.revenueByMonth.map((m) => m.revenue)}
          />
        ) : (
          <div className="adm-empty">
            <span className="adm-empty-title">No revenue yet</span>
            <span>Orders will chart here as they come in.</span>
          </div>
        )}
      </section>

      {/* ── Geography + status split ──────────────────────────────── */}
      <section className="adm-grid">
        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Where customers are</h2>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              Orders by city
            </span>
          </div>
          {cityBars.length ? (
            <>
              <CityBars data={cityBars} />
              {/* The bar chart prints its values only in a hover tooltip, which a
                  touch device cannot reach. Below 900px this list carries them
                  instead (the donut card already lists its own values). */}
              <ul className="adm-chart-values">
                {cityBars.map((c) => (
                  <li key={c.label}>
                    <span>{c.label}</span>
                    <span className="adm-td-num adm-cell-muted">{num(c.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="adm-empty">
              <span className="adm-empty-title">No locations yet</span>
            </div>
          )}
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Orders by status</h2>
          </div>
          {totalOrdersAll > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
              <StatusDonut data={statusData} />
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: '1 1 160px' }}>
                {o.ordersByStatus.map((s) => (
                  <li
                    key={s.status}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 0',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: STATUS_META[s.status].color,
                        flex: 'none',
                      }}
                    />
                    <span>{STATUS_META[s.status].label}</span>
                    <span
                      className="adm-td-num adm-cell-muted"
                      style={{ marginLeft: 'auto', fontSize: 12 }}
                    >
                      {num(s.orders)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="adm-empty">
              <span className="adm-empty-title">No orders yet</span>
            </div>
          )}
        </div>
      </section>

      {/* ── Top products + low stock ──────────────────────────────── */}
      <section className="adm-grid">
        <div className="adm-card" style={{ padding: 0 }}>
          <div className="adm-card-head" style={{ padding: '18px 20px 0' }}>
            <h2 className="adm-card-title">Top products</h2>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              By revenue
            </span>
          </div>
          {o.topProducts.length ? (
            <div className="adm-table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th className="adm-td-num">Units</th>
                    <th className="adm-td-num">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {o.topProducts.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td>
                      <td className="adm-td-num adm-cell-muted">{num(p.units)}</td>
                      <td className="adm-td-num">{inr(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="adm-empty" style={{ margin: '0 20px 20px' }}>
              <span className="adm-empty-title">No sales yet</span>
            </div>
          )}
        </div>

        <div className="adm-card" style={{ padding: 0 }}>
          <div className="adm-card-head" style={{ padding: '18px 20px 0' }}>
            <h2 className="adm-card-title">Low stock</h2>
            <Link className="adm-btn adm-btn--ghost adm-btn--sm" href="/admin/inventory">
              Manage →
            </Link>
          </div>
          {o.lowStockVariants.length ? (
            <div className="adm-table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>SKU</th>
                    <th className="adm-td-num">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lowStockVariants.map((v) => (
                    <tr key={v.sku ?? v.slug + v.label}>
                      <td>
                        {v.productName}
                        <span className="adm-cell-muted"> · {v.label}</span>
                      </td>
                      <td className="adm-cell-muted">{v.sku ?? '-'}</td>
                      <td className="adm-td-num">
                        {/* Under 15 is urgent (red), otherwise a low-stock warning. */}
                        <span
                          className={
                            'adm-badge ' + (v.stock < 15 ? 'adm-badge--red' : 'adm-badge--amber')
                          }
                        >
                          {num(v.stock)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="adm-empty" style={{ margin: '0 20px 20px' }}>
              <span className="adm-empty-title">All well stocked</span>
              <span>No variant is below 40 units.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
