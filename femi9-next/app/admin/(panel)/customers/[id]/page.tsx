import type { CSSProperties } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { OrderStatus } from '@prisma/client'
import { getCustomer } from '@/lib/services/admin/customers'
import { IPin } from '@/components/AppIcons'
import { AdjustPoints } from './_adjust-points'

/**
 * Customer profile — async server component. Reads the service directly and
 * 404s (via notFound) when the id isn't a customer. Location from the primary
 * address is surfaced up front as the "where they're from" signal.
 */

export const dynamic = 'force-dynamic'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})
const num = new Intl.NumberFormat('en-IN')
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// Serif section titles keep the editorial Femi9 rhythm (page/section titles only).
const sectionTitle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--ink)',
  margin: '0 0 12px',
}

const STATUS_BADGE: Record<OrderStatus, { cls: string; label: string }> = {
  pending: { cls: 'adm-badge--amber', label: 'Pending' },
  paid: { cls: 'adm-badge--plum', label: 'Paid' },
  processing: { cls: 'adm-badge--plum', label: 'Processing' },
  shipped: { cls: 'adm-badge--plum', label: 'Shipped' },
  delivered: { cls: 'adm-badge--green', label: 'Delivered' },
  cancelled: { cls: 'adm-badge--gray', label: 'Cancelled' },
  refunded: { cls: 'adm-badge--red', label: 'Refunded' },
}

function location(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(', ')
}

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await getCustomer(params.id)
  if (!c) notFound()

  const loc = location(c.city, c.state)
  const contact = [c.email, c.phone].filter(Boolean).join('  ·  ')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Link href="/admin/customers" className="adm-btn adm-btn--ghost adm-btn--sm" style={{ paddingLeft: 0 }}>
          ← All customers
        </Link>
      </div>

      {/* Identity header */}
      <div className="adm-card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}
        >
          <div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
              {c.name || 'Unnamed customer'}
            </h1>
            <p className="adm-cell-muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
              {contact || 'No contact details on file'}
            </p>
            <p className="adm-cell-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>
              Customer since {dateFmt.format(new Date(c.createdAt))}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            {c.tier ? <span className="adm-badge adm-badge--plum">{c.tier}</span> : null}
            {/* Location is the headline "where they're from" fact — give it a chip. */}
            <span className="adm-chip" title="Primary address location">
              <IPin aria-hidden="true" style={{ width: 14, height: 14 }} />
              {loc || 'Location unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="adm-grid">
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Orders placed</span>
            <span className="adm-stat-value">{num.format(c.orderCount)}</span>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Lifetime spend</span>
            <span className="adm-stat-value">{inr.format(c.lifetimeSpend)}</span>
          </div>
        </div>
        <div className="adm-card">
          <div className="adm-stat">
            <span className="adm-stat-label">Points balance</span>
            <span className="adm-stat-value">{num.format(c.pointsBalance)}</span>
          </div>
          <AdjustPoints customerId={c.id} balance={c.pointsBalance} />
        </div>
      </div>

      {/* Addresses */}
      <div className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-card-title">Addresses</h2>
          <span className="adm-cell-muted" style={{ fontSize: 12 }}>
            {c.addresses.length} on file
          </span>
        </div>
        {c.addresses.length === 0 ? (
          <p className="adm-cell-muted">No saved addresses.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {c.addresses.map((a) => (
              <div
                key={a.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  background: a.isPrimary ? 'var(--plum-tint)' : 'var(--canvas)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 12, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                    {a.label}
                  </strong>
                  {a.isPrimary ? <span className="adm-badge adm-badge--plum">Primary</span> : null}
                </div>
                <div style={{ lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600 }}>{a.name}</div>
                  <div>{a.line}</div>
                  <div>{location(a.city, a.state) || a.city}{a.pincode ? ` — ${a.pincode}` : ''}</div>
                  {a.phone ? <div className="adm-cell-muted">{a.phone}</div> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent orders */}
      <section>
        <h2 style={sectionTitle}>Recent orders</h2>
        {c.recentOrders.length === 0 ? (
          <div className="adm-empty">
            <p className="adm-empty-title">No orders yet</p>
            <p>This customer hasn&apos;t placed an order.</p>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Placed</th>
                  <th>Status</th>
                  <th className="adm-td-num">Items</th>
                  <th className="adm-td-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {c.recentOrders.map((o) => {
                  const badge = STATUS_BADGE[o.status]
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link
                          href={`/admin/orders/${o.id}`}
                          style={{ color: 'var(--plum)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {o.orderNo}
                        </Link>
                      </td>
                      <td className="adm-cell-muted">{dateFmt.format(new Date(o.placedAt))}</td>
                      <td>
                        <span className={`adm-badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="adm-td-num">{num.format(o.itemCount)}</td>
                      <td className="adm-td-num">{inr.format(o.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Points activity — only when there's ledger history to show. */}
      {c.points.length > 0 ? (
        <section>
          <h2 style={sectionTitle}>Points activity</h2>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Date</th>
                  <th className="adm-td-num">Change</th>
                  <th className="adm-td-num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {c.points.map((p) => (
                  <tr key={p.id}>
                    <td>{p.reason}</td>
                    <td className="adm-cell-muted">{dateFmt.format(new Date(p.createdAt))}</td>
                    <td className="adm-td-num" style={{ color: p.delta >= 0 ? 'var(--forest)' : 'var(--red)', fontWeight: 600 }}>
                      {p.delta >= 0 ? `+${num.format(p.delta)}` : num.format(p.delta)}
                    </td>
                    <td className="adm-td-num">{num.format(p.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
