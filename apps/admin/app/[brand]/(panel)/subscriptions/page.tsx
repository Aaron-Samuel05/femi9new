import { requireConsole } from '@/lib/guard'
import Link from 'next/link'
import type { SubscriptionStatus } from '@prisma/client'
import {
  ADMIN_CANCELLABLE_STATUSES,
  listSubscriptions,
  SUBSCRIPTION_STATUSES,
} from '@femi9/core/services/admin/subscriptions'
import { CancelButton } from './_cancel-button'

/**
 * Subscriptions list — async server component. Reads the status filter straight
 * from searchParams and calls the service directly (the chips are plain links, so
 * no client JS is needed). Always dynamic since the plans change per request.
 */
export const dynamic = 'force-dynamic'

// Badge tone per status. `halted` is RED, not amber: Razorpay has given up
// retrying that mandate and it will not restart on its own, so it needs someone
// to contact the customer rather than to wait.
const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  pending_mandate: 'adm-badge--amber',
  active: 'adm-badge--green',
  paused: 'adm-badge--amber',
  halted: 'adm-badge--red',
  cancelled: 'adm-badge--gray',
}

// "pending_mandate" is not a word. The chips and the badge both read this.
const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending_mandate: 'Awaiting auto-pay',
  active: 'Active',
  paused: 'Paused',
  halted: 'Payment failed',
  cancelled: 'Cancelled',
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Filter-chip link, preserving nothing but the active status. */
function href(brand: string, status?: string) {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  const s = p.toString()
  return `/${brand}/subscriptions` + (s ? `?${s}` : '')
}

export default async function SubscriptionsPage(props: {
    params: Promise<{ brand: string }>
    searchParams: Promise<{ status?: string }>
  }) {
  const { brand } = await requireConsole((await props.params).brand, 'subscriptions')
  const searchParams = await props.searchParams;
  const status = searchParams.status
  const rows = await listSubscriptions(brand, { status })

  const chips: { label: string; value?: string }[] = [
    { label: 'All' },
    ...SUBSCRIPTION_STATUSES.map((v) => ({ label: STATUS_LABEL[v], value: v })),
  ]

  return (
    <div>
      <div className="adm-toolbar">
        {/* Status filter chips (links keep this a server component). */}
        <div className="adm-chip-group">
          {chips.map((c) => {
            const active = (c.value ?? undefined) === (status ?? undefined)
            return (
              <Link
                key={c.label}
                href={href(brand, c.value)}
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
      </div>

      {rows.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-title">No subscriptions</div>
          <p>Subscriptions started from the storefront will appear here.</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Product</th>
                <th className="adm-td-num">Qty</th>
                <th>Cadence</th>
                <th>Auto-pay</th>
                <th>Next delivery</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.customerName}
                    {r.customerContact && <div className="adm-cell-muted">{r.customerContact}</div>}
                  </td>
                  <td>
                    {r.product}
                    <div className="adm-cell-muted">{r.variantLabel}</div>
                  </td>
                  <td className="adm-td-num">{r.qty}</td>
                  {/* What the mandate takes, and the gateway handle to look it
                      up with when a customer calls about a charge. A support
                      conversation about a recurring debit is unanswerable
                      without both. */}
                  <td className="adm-cell-muted">{r.frequency}</td>
                  <td className="adm-td-num">
                    {r.chargeAmount == null ? (
                      <span className="adm-cell-muted">Pay later</span>
                    ) : (
                      <>
                        Rs.{r.chargeAmount.toLocaleString('en-IN')}
                        {r.razorpaySubscriptionId && (
                          <div className="adm-cell-muted">{r.razorpaySubscriptionId}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="adm-cell-muted">{fmtDate(r.nextDelivery)}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td>
                    {ADMIN_CANCELLABLE_STATUSES.includes(r.status) && <CancelButton id={r.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
