import Link from 'next/link'
import type { SubscriptionStatus } from '@prisma/client'
import { listSubscriptions, SUBSCRIPTION_STATUSES } from '@femi9/core/services/admin/subscriptions'

/**
 * Subscriptions list — async server component. Reads the status filter straight
 * from searchParams and calls the service directly (the chips are plain links, so
 * no client JS is needed). Always dynamic since the plans change per request.
 */
export const dynamic = 'force-dynamic'

// Badge tone per status — active green, paused amber, cancelled gray.
const STATUS_BADGE: Record<SubscriptionStatus, string> = {
  active: 'adm-badge--green',
  paused: 'adm-badge--amber',
  cancelled: 'adm-badge--gray',
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** Filter-chip link, preserving nothing but the active status. */
function href(status?: string) {
  const p = new URLSearchParams()
  if (status) p.set('status', status)
  const s = p.toString()
  return '/admin/subscriptions' + (s ? `?${s}` : '')
}

export default async function SubscriptionsPage(
  props: {
    searchParams: Promise<{ status?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const status = searchParams.status
  const rows = await listSubscriptions({ status })

  const chips: { label: string; value?: string }[] = [
    { label: 'All' },
    ...SUBSCRIPTION_STATUSES.map((v) => ({ label: v[0].toUpperCase() + v.slice(1), value: v })),
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
                href={href(c.value)}
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
                <th>Next delivery</th>
                <th>Status</th>
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
                  <td className="adm-cell-muted">{r.frequency}</td>
                  <td className="adm-cell-muted">{fmtDate(r.nextDelivery)}</td>
                  <td>
                    <span className={`adm-badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
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
