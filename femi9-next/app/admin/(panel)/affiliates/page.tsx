'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

/**
 * Affiliates — creator program console.
 *
 * A client surface (like Coupons): it loads the creator list on mount and
 * mutates through /api/admin/affiliates, reconciling with the rows the server
 * returns. Review actions (approve / suspend) and payout logging all POST-like
 * through the [id] PATCH endpoint.
 *
 * JSON carries dates as ISO strings (not Date objects), so the row shapes are
 * declared locally with string dates rather than importing the service types.
 */

type Status = 'pending' | 'approved' | 'suspended'

interface AffiliateRow {
  id: string
  handle: string
  email: string | null
  platform: string | null
  followerBand: string | null
  promoCode: string | null
  status: Status
  clicks: number
  orders: number
  earnings: number
  createdAt: string
}

interface PayoutRow {
  id: string
  affiliateId: string
  amount: number
  status: 'pending' | 'paid'
  periodStart: string
  periodEnd: string
  reference: string | null
  paidAt: string | null
  createdAt: string
}

const inr = (n: number): string => '₹' + n.toLocaleString('en-IN')
const num = (n: number): string => n.toLocaleString('en-IN')

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_BADGE: Record<Status, string> = {
  pending: 'adm-badge--gray',
  approved: 'adm-badge--green',
  suspended: 'adm-badge--red',
}

const BLANK_PAYOUT = { amount: '', periodStart: '', periodEnd: '', reference: '' }

export default function AffiliatesPage() {
  const [rows, setRows] = useState<AffiliateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // Payout panel — only one row expands at a time, so a single form suffices.
  const [expanded, setExpanded] = useState<string | null>(null)
  const [payouts, setPayouts] = useState<Record<string, PayoutRow[]>>({})
  const [payoutsLoading, setPayoutsLoading] = useState(false)
  const [payoutForm, setPayoutForm] = useState(BLANK_PAYOUT)
  const [payoutError, setPayoutError] = useState<string | null>(null)
  const [payoutSaving, setPayoutSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/affiliates', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const body = (await res.json()) as { affiliates: AffiliateRow[] }
      setRows(body.affiliates)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  const setBusyFor = useCallback((id: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  // ── Approve / Suspend ───────────────────────────────────────────────────────
  async function runAction(row: AffiliateRow, action: 'approve' | 'suspend') {
    setBusyFor(row.id, true)
    try {
      const res = await fetch(`/api/admin/affiliates/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Update failed')
      const updated = (await res.json()) as AffiliateRow
      setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)))
      setToast(
        action === 'approve'
          ? `${updated.handle} approved${updated.promoCode ? ` — code ${updated.promoCode}` : ''}`
          : `${updated.handle} suspended`,
      )
    } catch (err) {
      setToast(`Couldn't update ${row.handle} — ${err instanceof Error ? err.message : 'try again'}`)
    } finally {
      setBusyFor(row.id, false)
    }
  }

  // ── Payout panel ────────────────────────────────────────────────────────────
  const loadPayouts = useCallback(async (affiliateId: string) => {
    setPayoutsLoading(true)
    try {
      const res = await fetch(`/api/admin/affiliates?payouts=1&affiliateId=${affiliateId}`, {
        cache: 'no-store',
      })
      if (!res.ok) throw new Error()
      const body = (await res.json()) as { payouts: PayoutRow[] }
      setPayouts((p) => ({ ...p, [affiliateId]: body.payouts }))
    } catch {
      // Non-fatal: the form still works even if the history fails to load.
      setPayouts((p) => ({ ...p, [affiliateId]: p[affiliateId] ?? [] }))
    } finally {
      setPayoutsLoading(false)
    }
  }, [])

  function togglePayout(row: AffiliateRow) {
    setPayoutError(null)
    setPayoutForm(BLANK_PAYOUT)
    if (expanded === row.id) {
      setExpanded(null)
      return
    }
    setExpanded(row.id)
    void loadPayouts(row.id)
  }

  async function submitPayout(e: React.FormEvent, affiliateId: string) {
    e.preventDefault()
    setPayoutSaving(true)
    setPayoutError(null)
    try {
      const res = await fetch(`/api/admin/affiliates/${affiliateId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'payout', ...payoutForm }),
      })
      if (res.ok) {
        const created = (await res.json()) as PayoutRow
        setPayouts((p) => ({ ...p, [affiliateId]: [created, ...(p[affiliateId] ?? [])] }))
        setPayoutForm(BLANK_PAYOUT)
        setToast(`Payout of ${inr(created.amount)} logged`)
        return
      }
      const body = await res.json().catch(() => ({}))
      setPayoutError(body?.details?.formErrors?.[0] || body?.error || 'Could not log the payout.')
    } catch {
      setPayoutError('Network error — please try again.')
    } finally {
      setPayoutSaving(false)
    }
  }

  const setPayoutField = (patch: Partial<typeof BLANK_PAYOUT>) =>
    setPayoutForm((f) => ({ ...f, ...patch }))

  const counts = useMemo(() => {
    let pending = 0
    let approved = 0
    for (const r of rows) {
      if (r.status === 'pending') pending += 1
      else if (r.status === 'approved') approved += 1
    }
    return { pending, approved }
  }, [rows])

  return (
    <>
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Affiliates
          </h2>
          {!loading && !loadError && (
            <>
              <span className="adm-chip">{rows.length} creators</span>
              {counts.pending > 0 && (
                <span className="adm-badge adm-badge--amber">{counts.pending} pending</span>
              )}
              <span className={'adm-badge' + (counts.approved ? ' adm-badge--green' : ' adm-badge--gray')}>
                {counts.approved} approved
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          className="adm-btn adm-btn--secondary adm-btn--sm"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading creators…</div>
        </div>
      ) : loadError ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load creators</div>
          <p>The affiliate list failed to load.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No applications yet</p>
          <p>Creator applications from the storefront will appear here for review.</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Creator</th>
                <th>Email</th>
                <th>Status</th>
                <th className="adm-td-num">Clicks</th>
                <th className="adm-td-num">Orders</th>
                <th className="adm-td-num">Earnings</th>
                <th style={{ width: 210 }}>{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const rowBusy = busy.has(a.id)
                const isOpen = expanded === a.id
                return (
                  <Fragment key={a.id}>
                    <tr style={{ opacity: rowBusy ? 0.6 : 1 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>@{a.handle}</div>
                        <div className="adm-cell-muted" style={{ fontSize: 12 }}>
                          {a.promoCode ? (
                            <span style={{ letterSpacing: '0.03em' }}>{a.promoCode}</span>
                          ) : (
                            'code allocated on approval'
                          )}
                          {a.platform ? ` · ${a.platform}` : ''}
                        </div>
                      </td>
                      <td className="adm-cell-muted">{a.email ?? '—'}</td>
                      <td>
                        <span className={`adm-badge ${STATUS_BADGE[a.status]}`}>{a.status}</span>
                      </td>
                      <td className="adm-td-num">{num(a.clicks)}</td>
                      <td className="adm-td-num">{num(a.orders)}</td>
                      <td className="adm-td-num">{inr(a.earnings)}</td>
                      <td>
                        <span className="adm-btn-cluster" style={{ flexWrap: 'wrap' }}>
                          {a.status !== 'approved' && (
                            <button
                              type="button"
                              className="adm-btn adm-btn--primary adm-btn--sm"
                              onClick={() => runAction(a, 'approve')}
                              disabled={rowBusy}
                            >
                              Approve
                            </button>
                          )}
                          {a.status !== 'suspended' && (
                            <button
                              type="button"
                              className="adm-btn adm-btn--danger adm-btn--sm"
                              onClick={() => runAction(a, 'suspend')}
                              disabled={rowBusy}
                            >
                              Suspend
                            </button>
                          )}
                          {a.status !== 'pending' && (
                            <button
                              type="button"
                              className="adm-btn adm-btn--secondary adm-btn--sm"
                              onClick={() => togglePayout(a)}
                              aria-expanded={isOpen}
                            >
                              {isOpen ? 'Close' : 'Payout'}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr>
                        {/* padding:0 + .adm-td-panel: the panel owns the padding so
                            it can be pinned to the viewport below 900px instead of
                            inheriting this cell's ~1000px table width. */}
                        <td colSpan={7} style={{ background: 'var(--canvas)', padding: 0 }}>
                          <div className="adm-td-panel" style={{ display: 'grid', gap: 14 }}>
                            <form onSubmit={(e) => submitPayout(e, a.id)} noValidate>
                              {payoutError && (
                                <div className="adm-auth-error" role="alert" style={{ marginBottom: 12 }}>
                                  <span className="adm-error">{payoutError}</span>
                                </div>
                              )}
                              <div className="adm-row">
                                <div className="adm-field" style={{ flex: '0 1 140px' }}>
                                  <label className="adm-label" htmlFor={`p-amount-${a.id}`}>
                                    Amount (₹)
                                  </label>
                                  <input
                                    id={`p-amount-${a.id}`}
                                    className="adm-input"
                                    inputMode="numeric"
                                    value={payoutForm.amount}
                                    onChange={(e) => setPayoutField({ amount: e.target.value })}
                                    placeholder="0"
                                  />
                                </div>
                                <div className="adm-field" style={{ flex: '0 1 170px' }}>
                                  <label className="adm-label" htmlFor={`p-start-${a.id}`}>
                                    Period start
                                  </label>
                                  <input
                                    id={`p-start-${a.id}`}
                                    className="adm-input"
                                    type="date"
                                    value={payoutForm.periodStart}
                                    onChange={(e) => setPayoutField({ periodStart: e.target.value })}
                                  />
                                </div>
                                <div className="adm-field" style={{ flex: '0 1 170px' }}>
                                  <label className="adm-label" htmlFor={`p-end-${a.id}`}>
                                    Period end
                                  </label>
                                  <input
                                    id={`p-end-${a.id}`}
                                    className="adm-input"
                                    type="date"
                                    value={payoutForm.periodEnd}
                                    onChange={(e) => setPayoutField({ periodEnd: e.target.value })}
                                  />
                                </div>
                                <div className="adm-field" style={{ flex: '1 1 180px' }}>
                                  <label className="adm-label" htmlFor={`p-ref-${a.id}`}>
                                    Reference (UPI / txn)
                                  </label>
                                  <input
                                    id={`p-ref-${a.id}`}
                                    className="adm-input"
                                    value={payoutForm.reference}
                                    onChange={(e) => setPayoutField({ reference: e.target.value })}
                                    placeholder="Optional"
                                  />
                                </div>
                                <button
                                  type="submit"
                                  className="adm-btn adm-btn--primary"
                                  disabled={payoutSaving}
                                >
                                  {payoutSaving ? 'Logging…' : 'Log payout'}
                                </button>
                              </div>
                            </form>

                            <div>
                              <div
                                className="adm-stat-label"
                                style={{ marginBottom: 8 }}
                              >
                                Recent payouts
                              </div>
                              {payoutsLoading && !payouts[a.id] ? (
                                <p className="adm-help">Loading…</p>
                              ) : (payouts[a.id]?.length ?? 0) === 0 ? (
                                <p className="adm-help">No payouts logged yet.</p>
                              ) : (
                                <div
                                  className="adm-table-wrap"
                                  style={{ border: 'none', boxShadow: 'none', borderRadius: 0 }}
                                >
                                <table className="adm-table" style={{ background: 'var(--surface)' }}>
                                  <thead>
                                    <tr>
                                      <th className="adm-td-num">Amount</th>
                                      <th>Period</th>
                                      <th>Reference</th>
                                      <th>Status</th>
                                      <th>Logged</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {payouts[a.id]!.map((p) => (
                                      <tr key={p.id}>
                                        <td className="adm-td-num">{inr(p.amount)}</td>
                                        <td className="adm-cell-muted">
                                          {fmtDate(p.periodStart)} – {fmtDate(p.periodEnd)}
                                        </td>
                                        <td className="adm-cell-muted">{p.reference ?? '—'}</td>
                                        <td>
                                          <span
                                            className={
                                              'adm-badge ' +
                                              (p.status === 'paid' ? 'adm-badge--green' : 'adm-badge--gray')
                                            }
                                          >
                                            {p.status}
                                          </span>
                                        </td>
                                        <td className="adm-cell-muted">{fmtDate(p.createdAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="adm-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  )
}
