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

/**
 * What came back from the grant PATCH about telling the customer.
 *
 * Declared locally for the same reason as every other type in this file — the
 * service is `server-only` and this module ships to the browser. Mirrors
 * `AddressChangeNotifyResult` in packages/core.
 */
interface AddressChangeNotified {
  url: string
  email: { sent: boolean; reason: string | null }
  whatsapp: { sent: boolean; reason: string | null }
  unreachable: boolean
  /** The correction cannot work for this order at all — see NotifyOutcome. */
  blocked: 'guest-order' | null
}

/**
 * Why a channel did not carry the message, in words an operator can act on.
 *
 * `template-not-approved` is the one that will be showing for a while: there
 * is no approved WhatsApp template for an address request yet, so until one
 * exists this reads on every grant and is not a fault in the customer's record.
 */
const NOTIFY_REASON: Record<string, string> = {
  'template-not-approved': 'no approved WhatsApp template yet',
  'no-email': 'no email on the account',
  'no-phone': 'no phone on the account or the address',
  'send-failed': 'the provider refused it',
}

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
  /** Whether the service would accept a refund. Computed server-side — the
   *  rule is no longer `status === 'paid'`, see the note on StatusControl. */
  refundable: boolean
  /** What happened to the money, which the status alone does not say. */
  money: {
    captured: number | null
    gatewayPaymentId: string | null
    refundedAt: string | null
    gatewayRefundId: string | null
    paidThenCancelled: boolean
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
          refundable={order.refundable}
          money={order.money}
          // Both PATCH branches answer with the refreshed order, so the whole
          // thing is replaced rather than patching `status` in by hand. That
          // used to be a local `{ ...o, status }`, which left every DERIVED
          // field describing the order as it was a moment ago — `refundable`
          // most of all, since a paid order marked shipped is no longer one.
          onRefreshed={setOrder}
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

/** Status select + Save — PATCHes the order and hands the refreshed one up. */
function StatusControl({
  orderId,
  current,
  refundable,
  money,
  onRefreshed,
}: {
  orderId: string
  current: OrderStatus
  /**
   * Whether the service would accept a refund right now. Computed by
   * `getOrder`, never re-derived here: this used to read `current === 'paid'`,
   * which hid the Refund button on a CANCELLED order — the one case where the
   * money is still ours and there is no other way to give it back.
   */
  refundable: boolean
  /** The money story, so the card can say what the status cannot. */
  money: OrderDetail['money']
  onRefreshed: (order: OrderDetail) => void
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
    // Cancelling a PAID order does NOT return the money — it gives back the
    // stock and the coupon and never touches the gateway. That is how orders
    // ended up cancelled with the payment still ours, so say it before the
    // click rather than explaining it afterwards.
    if (selected === 'cancelled' && money.captured !== null && !money.refundedAt) {
      const ok = confirm(
        `This order was paid (${inr(money.captured)}). Cancelling does NOT return the money — ` +
          `it only gives back the stock and the coupon.

` +
          `To refund her, use "Refund order" instead. Cancel anyway?`,
      )
      if (!ok) return
    }
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
      onRefreshed((await res.json()) as OrderDetail)
      setToast(true)
      setTimeout(() => setToast(false), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // Refund reverses the payment and claws back loyalty points — a distinct
  // action from a plain status change, and valid on a paid order or on a
  // cancelled one whose money never went back.
  //
  // The confirm names the CANCELLED case separately because its side effects
  // are not the same: that order's stock was already restored when it was
  // cancelled, so the refund must not do it again, and an operator who is
  // promised a stock restore and does not get one will go looking for a bug.
  async function refund() {
    if (refunding) return
    const message =
      current === 'cancelled'
        ? 'Return the money for this cancelled order? Its stock came back when it was cancelled, so only the payment and the loyalty points are reversed. This cannot be undone.'
        : 'Refund this order? Stock is restored and loyalty points are reversed. This cannot be undone.'
    if (!confirm(message)) return
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
      onRefreshed((await res.json()) as OrderDetail)
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

      <MoneyTrail money={money} status={current} />

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

      {refundable && (
        <button
          type="button"
          className="adm-btn adm-btn--danger adm-btn--sm"
          onClick={refund}
          disabled={refunding}
          style={{ marginLeft: 8 }}
        >
          {refunding
            ? 'Refunding…'
            : current === 'cancelled'
              ? 'Return the money'
              : 'Refund order'}
        </button>
      )}

      {/* A cancelled order that still holds its money is not a state anybody
          chose — it is what the console produced every time an operator picked
          "cancelled" on a paid order, which returned nothing. Say so where it
          is discovered, not in a runbook. */}
      {refundable && current === 'cancelled' && (
        <p className="adm-help" style={{ margin: '8px 0 0' }}>
          This order was cancelled but the payment was never returned — cancelling gives the stock
          back, not the money. Use the button above.
        </p>
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
  // What went out when this operator opened the window. Held only for the life
  // of the screen: it describes THIS click, not the order, and a stale "we
  // messaged her" on a page reload would be a claim nothing had checked.
  const [notified, setNotified] = useState<AddressChangeNotified | null>(null)

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
      const body = (await res.json()) as {
        grantedAt: string | null
        usedAt: string | null
        notified: AddressChangeNotified | null
      }
      setNotified(body.notified)
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
              : 'Closed. Opening it messages her a link to her own order page and lets her correct the delivery address once — no need to read it out over the phone.'}
      </p>

      {notified && <NotifyOutcome notified={notified} />}

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

/**
 * What actually reached the customer when the window was opened.
 *
 * This is not decoration. Opening the window is a request for her to do
 * something, and the two ways it fails silently look identical from this
 * screen: she was told and has not got round to it, or she was never told at
 * all. The second is common today — there is no approved WhatsApp template for
 * an address request yet, and a phone-only account has no email — so an
 * operator who is not shown this will close the ticket believing a message went
 * out that did not.
 *
 * `unreachable` is therefore the loud state, and it names the remedy: the
 * telephone. Everything else is a quiet confirmation.
 */
function NotifyOutcome({ notified }: { notified: AddressChangeNotified }) {
  const reason = (value: string | null) => (value && NOTIFY_REASON[value]) || value || 'not sent'
  const channels = [
    notified.email.sent ? 'email' : null,
    notified.whatsapp.sent ? 'WhatsApp' : null,
  ].filter(Boolean)

  return (
    // Composes `adm-error` / `adm-help` rather than introducing a `.adm-note`
    // of its own: admin.css IS the design system here and feature modules do
    // not author component CSS. The box itself is inline because it is one
    // panel on one screen, not a pattern.
    <div
      className={notified.unreachable ? 'adm-error' : 'adm-help'}
      style={{
        margin: '0 0 10px',
        padding: '8px 10px',
        borderRadius: 6,
        lineHeight: 1.5,
        background: notified.unreachable ? 'rgba(200,60,40,.07)' : 'rgba(52,32,78,.05)',
      }}
    >
      {notified.blocked === 'guest-order' ? (
        <>
          <strong>This is a guest order, so she cannot use the correction at all.</strong> The
          edit is scoped to the account that owns the order and a guest checkout has no account,
          so no session could ever open the control. Nothing was sent, and closing the window
          again changes nothing. This one still has to be corrected in the database.
        </>
      ) : notified.unreachable ? (
        <>
          <strong>She has not been told.</strong> Email — {reason(notified.email.reason)}. WhatsApp —{' '}
          {reason(notified.whatsapp.reason)}. Call her, and read out the link below.
        </>
      ) : (
        <>
          <strong>Asked her by {channels.join(' and ')}.</strong>
          {!notified.email.sent && ` Email skipped — ${reason(notified.email.reason)}.`}
          {!notified.whatsapp.sent && ` WhatsApp skipped — ${reason(notified.whatsapp.reason)}.`}
        </>
      )}
      {/* The link is shown either way: an operator on a call needs to be able to
          read it out, and it is the same URL the message carries. */}
      <div style={{ marginTop: 4, wordBreak: 'break-all', opacity: 0.8 }}>{notified.url}</div>
    </div>
  )
}

/**
 * What happened to the money, said plainly.
 *
 * The status badge above cannot say either of these things. `cancelled` covers
 * both "she never paid" and "she paid and we are still holding it" — and until
 * refundableFrom existed there was no way back from the second. `refunded` says
 * the money went somewhere without saying WHICH gateway refund returned it,
 * which is the only useful fact when one is disputed weeks later.
 *
 * The ids are rendered as selectable monospace text rather than a link: the
 * Razorpay dashboard URL differs by account and mode, and a link that lands on
 * the wrong account is worse than a string somebody pastes into its search box.
 */
function MoneyTrail({ money, status }: { money: OrderDetail['money']; status: OrderStatus }) {
  // An order that never took money has nothing to report, and an empty panel on
  // every pending order is noise on the screen that matters most.
  if (money.captured === null) {
    return status === 'cancelled' ? (
      <p className="adm-help" style={{ margin: '0 0 12px' }}>
        No payment was ever captured for this order — nothing to return.
      </p>
    ) : null
  }

  return (
    <div
      className={money.paidThenCancelled ? 'adm-error' : 'adm-help'}
      style={{
        margin: '0 0 14px',
        padding: '9px 11px',
        borderRadius: 6,
        lineHeight: 1.6,
        background: money.paidThenCancelled ? 'rgba(200,60,40,.07)' : 'rgba(52,32,78,.05)',
      }}
    >
      {money.paidThenCancelled ? (
        <div style={{ marginBottom: 6 }}>
          <strong>Paid {inr(money.captured)} — cancelled, money NOT returned.</strong> Cancelling
          gives back the stock and the coupon and never touches the gateway. She is still owed this.
        </div>
      ) : money.refundedAt ? (
        <div style={{ marginBottom: 6 }}>
          <strong>Paid {inr(money.captured)}, refunded in full</strong> on{' '}
          {fmtDateTime(money.refundedAt)}.
        </div>
      ) : (
        <div style={{ marginBottom: 6 }}>
          <strong>Paid {inr(money.captured)}.</strong> Held.
        </div>
      )}

      {money.gatewayPaymentId && <IdRow label="Payment" value={money.gatewayPaymentId} />}
      {money.gatewayRefundId && <IdRow label="Refund" value={money.gatewayRefundId} />}
      {/* A refund booked before the ids were recorded, or one adopted without
          the gateway naming it. Better to admit the gap than to render a blank
          row that reads as "there is no refund". */}
      {money.refundedAt && !money.gatewayRefundId && (
        <div style={{ opacity: 0.75 }}>No gateway refund id was recorded for this one.</div>
      )}
    </div>
  )
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span style={{ opacity: 0.75, minWidth: 58 }}>{label}</span>
      <code style={{ fontSize: 11, wordBreak: 'break-all', userSelect: 'all' }}>{value}</code>
    </div>
  )
}
