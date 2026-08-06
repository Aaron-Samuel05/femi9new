import Link from 'next/link'
import type { OrderStatus } from '@prisma/client'
import { listOrders, ORDER_STATUSES } from '@/lib/services/admin/orders'

/**
 * Orders list — async server component. Reads filters straight from
 * searchParams and calls the service directly (no client JS needed: the status
 * chips are links and the search box is a plain GET form). Always dynamic since
 * orders and the query change per request.
 */
export const dynamic = 'force-dynamic'

type Search = { status?: string; q?: string; page?: string }

// Badge tone per status — delivered green, shipped/paid plum, processing amber,
// cancelled red, refunded/pending gray. Mirrors the module spec.
const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: 'adm-badge--gray',
  paid: 'adm-badge--plum',
  processing: 'adm-badge--amber',
  shipped: 'adm-badge--plum',
  delivered: 'adm-badge--green',
  cancelled: 'adm-badge--red',
  refunded: 'adm-badge--gray',
}

const inr = (n: number) => '₹' + n.toLocaleString('en-IN')
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Build a querystring for chip/pager links, preserving the active filters. */
function href({ status, q, page }: { status?: string; q?: string; page?: number }) {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  if (q) p.set('q', q)
  if (page && page > 1) p.set('page', String(page))
  const s = p.toString()
  return '/admin/orders' + (s ? `?${s}` : '')
}

export default async function OrdersPage(props: { searchParams: Promise<Search> }) {
  const searchParams = await props.searchParams;
  const status = searchParams.status
  const q = searchParams.q?.trim() || undefined
  const page = Number(searchParams.page) || 1

  const { orders, total, page: current, pageCount } = await listOrders({ status, q, page })

  const chips: { label: string; value?: string }[] = [
    { label: 'All' },
    ...ORDER_STATUSES.map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v })),
  ]

  return (
    <div>
      <div className="adm-toolbar">
        {/* Status filter chips (links keep this a server component). */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((c) => {
            const active = (c.value ?? undefined) === (status ?? undefined)
            return (
              <Link
                key={c.label}
                href={href({ status: c.value, q })}
                className="adm-chip"
                aria-pressed={active}
                style={
                  active
                    ? {
                        borderColor: 'var(--plum)',
                        background: 'var(--plum-tint)',
                        color: 'var(--plum)',
                        fontWeight: 600,
                      }
                    : undefined
                }
              >
                {c.label}
              </Link>
            )
          })}
        </div>

        {/* Native GET form — navigates to the same page with ?q=… */}
        <form action="/admin/orders" method="get" className="adm-row" style={{ alignItems: 'center' }}>
          {status && <input type="hidden" name="status" value={status} />}
          <input
            className="adm-input"
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Search order no, customer or city"
            aria-label="Search orders"
            style={{ width: 260 }}
          />
          <button className="adm-btn adm-btn--secondary" type="submit">
            Search
          </button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-title">No orders found</div>
          <p>Try a different status or clear your search.</p>
        </div>
      ) : (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th className="adm-td-num">Items</th>
                  <th className="adm-td-num">Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/admin/orders/${o.id}`}
                        style={{ color: 'var(--plum)', fontWeight: 600, textDecoration: 'none' }}
                      >
                        {o.orderNo}
                      </Link>
                    </td>
                    <td className="adm-cell-muted">{fmtDate(o.placedAt)}</td>
                    <td>{o.customerName}</td>
                    <td className="adm-cell-muted">{o.city ?? '—'}</td>
                    <td className="adm-td-num">{o.itemCount}</td>
                    <td className="adm-td-num">{inr(o.total)}</td>
                    <td>
                      <span className={`adm-badge ${STATUS_BADGE[o.status]}`}>{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="adm-pager">
            <span>
              Page {current} of {pageCount} · {total} order{total === 1 ? '' : 's'}
            </span>
            {current > 1 ? (
              <Link className="adm-btn adm-btn--secondary adm-btn--sm" href={href({ status, q, page: current - 1 })}>
                Previous
              </Link>
            ) : (
              <button className="adm-btn adm-btn--secondary adm-btn--sm" disabled>
                Previous
              </button>
            )}
            {current < pageCount ? (
              <Link className="adm-btn adm-btn--secondary adm-btn--sm" href={href({ status, q, page: current + 1 })}>
                Next
              </Link>
            ) : (
              <button className="adm-btn adm-btn--secondary adm-btn--sm" disabled>
                Next
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
