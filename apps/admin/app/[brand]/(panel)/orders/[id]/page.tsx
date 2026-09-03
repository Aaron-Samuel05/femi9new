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

/**
 * Statuses where a change of address can still reach the parcel.
 *
 * Retyped rather than imported from `ADDRESS_EDITABLE_STATUSES`, because that
 * constant lives in a `server-only` module and importing the VALUE here would
 * pull the service — and its Prisma client — into a client bundle. The server
 * is what enforces it; this only keeps the card from claiming an order is
 * editable when the service would refuse.
 */
const EDITABLE_STATUSES: string[] = ['pending', 'paid', 'processing']

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
  /** The coupon this order was placed with. Null when it carried none — and
   *  also when the coupon has since been hard-deleted, which nulls `couponId`
   *  and leaves the discount with nothing naming it. */
  coupon: { code: string; type: 'flat' | 'percent'; value: number } | null
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
  /** The customer's one-time address correction. `open` folds in the status
   *  check, so a grant on a shipped order reads as not open. */
  addressEdit: {
    grantedAt: string | null
    grantedBy: string | null
    usedAt: string | null
    open: boolean
  }
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

          <AddressEditControl
            orderId={order.id}
            status={order.status}
            state={order.addressEdit}
            onChanged={(addressEdit) => setOrder((o) => (o ? { ...o, addressEdit } : o))}
          />
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
        {order.discount > 0 && (
          /* Name the coupon, not just the money. The row said only "Discount",
             so a support call about "why is this order ₹50 less" could not be
             answered from the order at all — the code lived on the storefront's
             quote and nowhere the console could see. Falls back to the bare
             label when there is no coupon row to name: a deleted coupon nulls
             the relation and leaves the discount behind. */
          <TotalRow
            label={order.coupon ? `Discount (${order.coupon.code})` : 'Discount'}
            value={'−' + inr(order.discount)}
          />
        )}
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

/**
 * Open or close the customer's ONE-TIME address correction.
 *
 * Support's side of `services/order-address.ts`. It lives under Shipping rather
 * than beside the status dropdown deliberately: it is a fact about the ADDRESS,
 * and the person reaching for it is looking at the address that is wrong.
 *
 * Three states are worth telling apart on a call, which is why the copy is not
 * just an on/off label:
 *  - never granted     → the normal state; offer to open it.
 *  - granted, unused   → she can change it now; say who opened it, and offer to
 *                        close it again in case it was opened by mistake.
 *  - already used      → she has had her one change. Opening it again is a
 *                        deliberate second grant, and the button says so.
 *
 * `state.open` already folds in the order status, so a grant left on an order
 * that has since shipped reports as not actionable rather than as available —
 * the service refuses it either way, and support should not promise it.
 */
function AddressEditControl({
  orderId,
  status,
  state,
  onChanged,
}: {
  orderId: string
  status: OrderStatus
  state: OrderDetail['addressEdit']
  onChanged: (next: OrderDetail['addressEdit']) => void
}) {
  const { brand } = useParams<{ brand: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const granted = state.grantedAt !== null
  const used = state.usedAt !== null
  // Granted and unspent, but the parcel has gone. Naming this separately is the
  // difference between support saying "it's open" and "it's too late".
  const staleGrant = granted && !used && !state.open

  async function set(next: boolean) {
    if (busy) return
    if (next && used && !confirm('She has already used her one change. Open a second one?')) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'address-edit', granted: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error ?? 'Could not change that.')
      }
      const body = (await res.json()) as { grantedAt: string | null; usedAt: string | null }
      onChanged({
        grantedAt: body.grantedAt,
        grantedBy: next ? state.grantedBy : null,
        usedAt: body.usedAt,
        // Recomputed the same way the server does, so the card does not claim
        // an order that has shipped is editable.
        open: body.grantedAt !== null && body.usedAt === null && EDITABLE_STATUSES.includes(status),
      })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(52,32,78,.1)', paddingTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 13 }}>Customer address change</strong>
        {state.open && <span className="adm-badge adm-badge--green">open</span>}
        {used && <span className="adm-badge adm-badge--gray">used</span>}
        {staleGrant && <span className="adm-badge adm-badge--amber">too late</span>}
      </div>

      <p className="adm-help" style={{ margin: '6px 0 10px' }}>
        {used
          ? `She changed the address herself${state.usedAt ? ' on ' + fmtDateTime(state.usedAt) : ''}. One change per grant — open another only if she has asked again.`
          : state.open
            ? `She can change the delivery address once, from her order page${state.grantedBy ? ' — opened by ' + state.grantedBy : ''}.`
            : staleGrant
              ? `This order is ${status}, so the address can no longer be changed even though a change was opened. The parcel has already gone.`
              : 'Closed. Open it and she can correct the delivery address once, from her own order page — no need to read it out over the phone.'}
      </p>

      <button
        type="button"
        className={`adm-btn adm-btn--sm ${state.open ? 'adm-btn--secondary' : 'adm-btn--primary'}`}
        onClick={() => set(!granted)}
        disabled={busy}
      >
        {busy
          ? 'Saving…'
          : granted
            ? 'Close address change'
            : used
              ? 'Open another change'
              : 'Allow one address change'}
      </button>

      {error && <span className="adm-error" style={{ display: 'block', marginTop: 8 }}>{error}</span>}
    </div>
  )
}
