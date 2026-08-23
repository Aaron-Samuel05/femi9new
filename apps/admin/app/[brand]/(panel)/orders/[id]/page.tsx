'use client'
import { useParams } from 'next/navigation'

import { useEffect, useState, use } from 'react';
import Link from 'next/link'

/**
 * Order detail — client component. It reads the order from the GET endpoint and
 * hosts the status control (a select + Save that PATCHes) inline, since the
 * whole view needs client interactivity. In Next 14.2 a client page receives
 * `params` as a plain object prop.
 *
 * Types are declared locally (not imported from the server-only service) because
 * this module ships to the browser bundle; `placedAt` arrives as an ISO string
 * over JSON.
 */

// Kept in sync with schema.prisma's OrderStatus / the service's ORDER_STATUSES.
const ORDER_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const
type OrderStatus = (typeof ORDER_STATUSES)[number]

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'adm-badge--gray',
  paid: 'adm-badge--plum',
  processing: 'adm-badge--amber',
  shipped: 'adm-badge--plum',
  delivered: 'adm-badge--green',
  cancelled: 'adm-badge--red',
  refunded: 'adm-badge--gray',
}

interface OrderLine {
  id: string
  productName: string
  variantLabel: string
  unitPrice: number
  qty: number
  lineTotal: number
}
interface OrderDetail {
  id: string
  orderNo: string
  status: OrderStatus
  channel: string
  placedAt: string
  subtotal: number
  discount: number
  shipping: number
  total: number
  customer: { name: string; email: string | null; phone: string | null } | null
  address: {
    name: string
    line: string
    city: string
    state: string | null
    pincode: string | null
    phone: string | null
  } | null
  items: OrderLine[]
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN')
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { brand } = useParams<{ brand: string }>()
  const params = use(props.params);
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/${brand}/api/orders/${params.id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Order not found.' : 'Could not load order.')
        return (await res.json()) as OrderDetail
      })
      .then((data) => {
        if (alive) setOrder(data)
      })
      .catch((err: Error) => {
        if (alive) setLoadError(err.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="adm-empty">
        <div className="adm-empty-title">Loading order…</div>
      </div>
    )
  }

  if (loadError || !order) {
    return (
      <div>
        <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/${brand}/orders`} style={{ marginBottom: 12 }}>
          ← Orders
        </Link>
        <div className="adm-empty">
          <div className="adm-empty-title">{loadError ?? 'Order not found'}</div>
          <p>The order may have been removed.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link className="adm-btn adm-btn--ghost adm-btn--sm" href={`/${brand}/orders`}>
        ← Orders
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          margin: '10px 0 20px',
        }}
      >
        <h2 className="adm-topbar-title">{order.orderNo}</h2>
        <span className={`adm-badge ${STATUS_BADGE[order.status]}`}>{order.status}</span>
        <span className="adm-cell-muted" style={{ marginLeft: 'auto' }}>
          Placed {fmtDateTime(order.placedAt)} · {order.channel}
        </span>
      </div>

      {/* Customer · Shipping · Status control */}
      <div className="adm-grid" style={{ marginBottom: 18 }}>
        <div className="adm-card">
          <div className="adm-card-head">
            <h3 className="adm-card-title">Customer</h3>
          </div>
          {order.customer ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{order.customer.name}</div>
              {order.customer.email && <div className="adm-cell-muted">{order.customer.email}</div>}
              {order.customer.phone && <div className="adm-cell-muted">{order.customer.phone}</div>}
            </div>
          ) : (
            <div className="adm-cell-muted">Guest checkout</div>
          )}
        </div>

        <div className="adm-card">
          <div className="adm-card-head">
            <h3 className="adm-card-title">Shipping</h3>
          </div>
          {order.address ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{order.address.name}</div>
              <div className="adm-cell-muted">{order.address.line}</div>
              <div className="adm-cell-muted">
                {[order.address.city, order.address.state, order.address.pincode].filter(Boolean).join(', ')}
              </div>
              {order.address.phone && <div className="adm-cell-muted">{order.address.phone}</div>}
            </div>
          ) : (
            <div className="adm-cell-muted">No shipping address on file</div>
          )}
        </div>

        <StatusControl
          orderId={order.id}
          current={order.status}
          onChanged={(status) => setOrder((o) => (o ? { ...o, status } : o))}
        />
      </div>

      {/* Line items */}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Variant</th>
              <th className="adm-td-num">Unit price</th>
              <th className="adm-td-num">Qty</th>
              <th className="adm-td-num">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it) => (
              <tr key={it.id}>
                <td style={{ fontWeight: 600 }}>{it.productName}</td>
                <td className="adm-cell-muted">{it.variantLabel}</td>
                <td className="adm-td-num">{inr(it.unitPrice)}</td>
                <td className="adm-td-num">{it.qty}</td>
                <td className="adm-td-num">{inr(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="adm-card" style={{ maxWidth: 320, marginLeft: 'auto', marginTop: 16 }}>
        <TotalRow label="Subtotal" value={inr(order.subtotal)} />
        {order.discount > 0 && <TotalRow label="Discount" value={'−' + inr(order.discount)} />}
        <TotalRow label="Shipping" value={order.shipping === 0 ? 'Free' : inr(order.shipping)} />
        <div style={{ borderTop: '1px solid var(--line)', margin: '8px 0' }} />
        <TotalRow label="Total" value={inr(order.total)} strong />
      </div>
    </div>
  )
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '5px 0',
        fontWeight: strong ? 700 : 500,
        fontSize: strong ? 15 : 13,
      }}
    >
      <span className={strong ? undefined : 'adm-cell-muted'}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

/** Status select + Save — PATCHes the order and reports the new status up. */
function StatusControl({
  orderId,
  current,
  onChanged,
}: {
  orderId: string
  current: OrderStatus
  onChanged: (status: OrderStatus) => void
}) {
  const { brand } = useParams<{ brand: string }>()
  const [selected, setSelected] = useState<OrderStatus>(current)
  const [saving, setSaving] = useState(false)
  const [refunding, setRefunding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState(false)

  // Keep the select in sync if the parent's status changes underneath us.
  useEffect(() => setSelected(current), [current])

  const dirty = selected !== current

  async function save() {
    if (!dirty || saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: selected }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not update status.')
      }
      onChanged(selected)
      setToast(true)
      setTimeout(() => setToast(false), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Refund reverses the payment, restores stock and claws back loyalty points —
  // a distinct action from a plain status change, and only valid while 'paid'.
  async function refund() {
    if (refunding) return
    if (!confirm('Refund this order? Stock is restored and loyalty points are reversed. This cannot be undone.')) return
    setRefunding(true)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'refund' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not refund this order.')
      }
      onChanged('refunded')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="adm-card">
      <div className="adm-card-head">
        <h3 className="adm-card-title">Status</h3>
        <span className={`adm-badge ${STATUS_BADGE[current]}`}>{current}</span>
      </div>

      <div className="adm-field">
        <label className="adm-label" htmlFor="order-status">
          Update status
        </label>
        <select
          id="order-status"
          className="adm-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value as OrderStatus)}
          disabled={saving}
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="adm-btn adm-btn--primary adm-btn--sm"
        onClick={save}
        disabled={!dirty || saving}
      >
        {saving ? 'Saving…' : 'Save status'}
      </button>

      {current === 'paid' && (
        <button
          type="button"
          className="adm-btn adm-btn--danger adm-btn--sm"
          onClick={refund}
          disabled={refunding}
          style={{ marginLeft: 8 }}
        >
          {refunding ? 'Refunding…' : 'Refund order'}
        </button>
      )}

      {toast && (
        <div className="adm-toast" role="status">
          Status updated
        </div>
      )}
    </div>
  )
}
