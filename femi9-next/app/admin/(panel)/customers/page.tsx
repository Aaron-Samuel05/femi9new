import Link from 'next/link'
import { listCustomers } from '@/lib/services/admin/customers'

/**
 * Customers list — async server component reading the service directly. Search
 * and paging are plain URL state (GET form + Link hrefs), so the page stays a
 * server component with no client JS.
 */

export const dynamic = 'force-dynamic'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const num = new Intl.NumberFormat('en-IN')

function location(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(', ')
}

export default async function CustomersPage(
  props: {
    searchParams: Promise<{ q?: string; page?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === 'string' ? searchParams.q : ''
  const pageNum = Number(searchParams.page)
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1

  const { items, total, totalPages, pageSize } = await listCustomers({ q, page })

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (p > 1) sp.set('page', String(p))
    const qs = sp.toString()
    return qs ? `/admin/customers?${qs}` : '/admin/customers'
  }

  return (
    <>
      <div className="adm-toolbar">
        {/* GET form: search terms become the ?q= URL param, keeping paging in the URL too. */}
        <form method="GET" action="/admin/customers" className="adm-row" style={{ alignItems: 'flex-end' }}>
          <div className="adm-field" style={{ marginBottom: 0, minWidth: 260 }}>
            <label className="adm-label" htmlFor="q">
              Search customers
            </label>
            <input
              id="q"
              name="q"
              type="search"
              className="adm-input"
              placeholder="Name, email or phone"
              defaultValue={q}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="adm-btn adm-btn--primary">
            Search
          </button>
          {q ? (
            <Link href="/admin/customers" className="adm-btn adm-btn--ghost">
              Clear
            </Link>
          ) : null}
        </form>

        <span className="adm-cell-muted" style={{ fontSize: 12 }}>
          {total === 0 ? 'No customers' : `${from}–${to} of ${num.format(total)}`}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No customers found</p>
          <p>{q ? 'Try a different name, email or phone.' : 'Customers appear here once shoppers create an account.'}</p>
        </div>
      ) : (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Location</th>
                  <th className="adm-td-num">Orders</th>
                  <th className="adm-td-num">Total spent</th>
                  <th className="adm-td-num">Points</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const loc = location(c.city, c.state)
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/admin/customers/${c.id}`}
                          style={{ color: 'var(--plum)', fontWeight: 600, textDecoration: 'none' }}
                        >
                          {c.name || 'Unnamed customer'}
                        </Link>
                        {c.tier ? (
                          <span className="adm-badge adm-badge--plum" style={{ marginLeft: 8 }}>
                            {c.tier}
                          </span>
                        ) : null}
                      </td>
                      <td className="adm-cell-muted">
                        {c.email || c.phone ? (
                          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                            {c.email ? <span>{c.email}</span> : null}
                            {c.phone ? <span>{c.phone}</span> : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{loc || <span className="adm-cell-muted">—</span>}</td>
                      <td className="adm-td-num">{num.format(c.orderCount)}</td>
                      <td className="adm-td-num">{inr.format(c.totalSpent)}</td>
                      <td className="adm-td-num">{num.format(c.pointsBalance)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="adm-pager">
            <span>
              Page {page} of {totalPages}
            </span>
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="adm-btn adm-btn--secondary adm-btn--sm">
                Previous
              </Link>
            ) : (
              <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" disabled>
                Previous
              </button>
            )}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="adm-btn adm-btn--secondary adm-btn--sm">
                Next
              </Link>
            ) : (
              <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" disabled>
                Next
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
