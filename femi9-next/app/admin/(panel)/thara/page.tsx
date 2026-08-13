'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * /admin/thara — program-wide ops console.
 *
 * Three surfaces on one page: KPIs from /api/admin/thara/metrics, the member
 * roster from /api/admin/thara/list (searchable, filterable, with suspend and
 * unsuspend wired to the [id] routes), and the voucher queue where an admin
 * pastes an Amazon code by hand until the Incentives API onboarding lands.
 *
 * The member list used to be a bare anchor to the JSON endpoint, which meant the
 * suspend/unsuspend routes shipped with no way to reach them from the console.
 * Presentation is the shared `.adm-*` system — this page previously carried its
 * own <style jsx> block, which duplicated the admin theme and drifted from it.
 */

interface Metrics {
  members: { total: number; active: number; pending: number; suspended: number }
  referrals: { total: number; locked: number }
  credit: { commissionAccruedPaise: number; creditSpentPaise: number }
  rewards: {
    totalPointsAccrued: number
    vouchersAvailable: number
    vouchersClaimed: number
    vouchersExpired: number
  }
  currentCycle: { id: string; startDate: string; endDate: string } | null
}

interface VoucherRow {
  id: string
  points: number
  valuePaise: number
  status: 'available' | 'claimed' | 'expired' | 'cancelled'
  amazonCode: string | null
  issuedAt: string
  claimDeadline: string
  user: { email: string | null; name: string | null; phone: string | null }
  cycle: { startDate: string; endDate: string }
}

type MemberStatus = 'purchase_pending' | 'active' | 'suspended' | 'deactivated'

interface MemberRow {
  id: string
  status: MemberStatus
  referralCode: string
  enrolledAt: string
  suspendedReason: string | null
  user: { id: string; name: string | null; email: string | null; phone: string | null }
}

const STATUS_BADGE: Record<MemberStatus, string> = {
  active: 'adm-badge--green',
  purchase_pending: 'adm-badge--amber',
  suspended: 'adm-badge--red',
  deactivated: 'adm-badge--gray',
}

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: 'Active',
  purchase_pending: 'Pending purchase',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
}

const FILTERS: { value: '' | MemberStatus; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'purchase_pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'deactivated', label: 'Deactivated' },
]

const PAGE_SIZE = 25

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const dt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TharaAdmin() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [rows, setRows] = useState<VoucherRow[]>([])
  const [codeInput, setCodeInput] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Member roster
  const [members, setMembers] = useState<MemberRow[]>([])
  const [memberTotal, setMemberTotal] = useState(0)
  const [memberSkip, setMemberSkip] = useState(0)
  const [status, setStatus] = useState<'' | MemberStatus>('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [membersLoading, setMembersLoading] = useState(true)
  const [suspending, setSuspending] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [m, v] = await Promise.all([
        fetch('/api/admin/thara/metrics', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/thara/vouchers?missingCode=true&take=50', { cache: 'no-store' }).then((r) => r.json()),
      ])
      setMetrics(m)
      setRows(v.rows ?? [])
    } catch {
      setError('Could not load Thara metrics.')
    }
  }, [])

  const loadMembers = useCallback(async () => {
    setMembersLoading(true)
    try {
      const params = new URLSearchParams({ take: String(PAGE_SIZE), skip: String(memberSkip) })
      if (status) params.set('status', status)
      if (search) params.set('q', search)
      const res = await fetch(`/api/admin/thara/list?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('list failed')
      const data = await res.json()
      setMembers(data.rows ?? [])
      setMemberTotal(data.total ?? 0)
    } catch {
      setActionError('Could not load the member list.')
    } finally {
      setMembersLoading(false)
    }
  }, [memberSkip, status, search])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void loadMembers() }, [loadMembers])

  async function saveCode(id: string) {
    const value = (codeInput[id] ?? '').trim()
    if (!value) return
    setBusyId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/thara/vouchers/${id}/set-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amazonCode: value }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'Could not save that code.')
        return
      }
      setCodeInput((c) => ({ ...c, [id]: '' }))
      await load()
    } catch {
      setActionError('Could not reach the server.')
    } finally {
      setBusyId(null)
    }
  }

  /** Suspend needs a reason (the API requires one); unsuspend takes no body. */
  async function setSuspended(id: string, next: boolean) {
    if (next && !reason.trim()) return
    setBusyId(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/admin/thara/${id}/${next ? 'suspend' : 'unsuspend'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        ...(next ? { body: JSON.stringify({ reason: reason.trim() }) } : {}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'Could not update that membership.')
        return
      }
      setSuspending(null)
      setReason('')
      await Promise.all([loadMembers(), load()])
    } catch {
      setActionError('Could not reach the server.')
    } finally {
      setBusyId(null)
    }
  }

  async function closeCycle() {
    setConfirmClose(false)
    setActionError(null)
    const res = await fetch('/api/cron/thara-close-cycle', { method: 'POST' })
    if (res.ok) await load()
    else setActionError('Could not close the cycle.')
  }

  async function expireVouchers() {
    setActionError(null)
    const res = await fetch('/api/cron/thara-expire-vouchers', { method: 'POST' })
    if (res.ok) await load()
    else setActionError('Could not expire vouchers.')
  }

  if (error) {
    return (
      <div className="adm-empty">
        <p className="adm-empty-title">Couldn&rsquo;t load Thara</p>
        <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => void load()}>
          Try again
        </button>
      </div>
    )
  }
  if (!metrics) {
    return (
      <div className="adm-empty">
        <div className="adm-empty-title">Loading Thara metrics…</div>
      </div>
    )
  }

  return (
    <>
      {actionError && <p className="adm-error" role="alert">{actionError}</p>}

      <section className="adm-grid">
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Members</div>
          <div className="adm-stat-value">{metrics.members.total}</div>
          <div className="adm-cell-muted">
            {metrics.members.active} active · {metrics.members.pending} pending · {metrics.members.suspended} suspended
          </div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Referrals</div>
          <div className="adm-stat-value">{metrics.referrals.total}</div>
          <div className="adm-cell-muted">{metrics.referrals.locked} locked</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Commission accrued</div>
          <div className="adm-stat-value">{rs(metrics.credit.commissionAccruedPaise)}</div>
          <div className="adm-cell-muted">Credit spent: {rs(metrics.credit.creditSpentPaise)}</div>
        </div>
        <div className="adm-card adm-stat">
          <div className="adm-stat-label">Points accrued</div>
          <div className="adm-stat-value">{metrics.rewards.totalPointsAccrued}</div>
          <div className="adm-cell-muted">
            {metrics.rewards.vouchersAvailable} available · {metrics.rewards.vouchersClaimed} claimed ·{' '}
            {metrics.rewards.vouchersExpired} expired
          </div>
        </div>
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-card-title">Cycle controls</h2>
          {metrics.currentCycle && (
            <span className="adm-cell-muted">
              Current cycle: {dt(metrics.currentCycle.startDate)} — {dt(metrics.currentCycle.endDate)}
            </span>
          )}
        </div>
        <div className="adm-toolbar">
          {confirmClose ? (
            <>
              <span className="adm-cell-muted">Close the cycle and issue vouchers now?</span>
              <button type="button" className="adm-btn adm-btn--danger adm-btn--sm" onClick={() => void closeCycle()}>
                Yes, close it
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--secondary adm-btn--sm"
                onClick={() => setConfirmClose(false)}
              >
                Keep it open
              </button>
            </>
          ) : (
            <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" onClick={() => setConfirmClose(true)}>
              Close current cycle now
            </button>
          )}
          <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" onClick={() => void expireVouchers()}>
            Expire stale vouchers
          </button>
        </div>
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-card-title">Members</h2>
          <span className="adm-cell-muted">{memberTotal} total</span>
        </div>

        <div className="adm-toolbar">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setMemberSkip(0)
              setSearch(query.trim())
            }}
          >
            <input
              className="adm-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by referral code or email"
              aria-label="Search members"
            />
          </form>
          <div className="adm-chip-group">
            {FILTERS.map((f) => (
              <button
                key={f.value || 'all'}
                type="button"
                className={'adm-chip' + (status === f.value ? ' is-active' : '')}
                aria-pressed={status === f.value}
                onClick={() => {
                  setMemberSkip(0)
                  setStatus(f.value)
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {membersLoading ? (
          <div className="adm-empty">
            <div className="adm-empty-title">Loading members…</div>
          </div>
        ) : members.length === 0 ? (
          <div className="adm-empty">
            <p className="adm-empty-title">No members match</p>
            <p className="adm-cell-muted">Try a different status or search term.</p>
          </div>
        ) : (
          <>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Referral code</th>
                    <th>Status</th>
                    <th>Enrolled</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div>{m.user.name ?? '(no name)'}</div>
                        <div className="adm-cell-muted">{m.user.email ?? m.user.phone ?? '(no contact)'}</div>
                      </td>
                      <td>{m.referralCode}</td>
                      <td>
                        <span className={'adm-badge ' + STATUS_BADGE[m.status]}>{STATUS_LABEL[m.status]}</span>
                        {m.status === 'suspended' && m.suspendedReason && (
                          <div className="adm-cell-muted">{m.suspendedReason}</div>
                        )}
                      </td>
                      <td>{dt(m.enrolledAt)}</td>
                      <td>
                        {/* Deactivation is terminal in the service, so it offers no control. */}
                        {m.status === 'deactivated' ? (
                          <span className="adm-cell-muted">—</span>
                        ) : m.status === 'suspended' ? (
                          <button
                            type="button"
                            className="adm-btn adm-btn--secondary adm-btn--sm"
                            disabled={busyId === m.id}
                            onClick={() => void setSuspended(m.id, false)}
                          >
                            {busyId === m.id ? 'Working…' : 'Unsuspend'}
                          </button>
                        ) : suspending === m.id ? (
                          <div className="adm-row">
                            <input
                              className="adm-input"
                              value={reason}
                              autoFocus
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Reason (required)"
                              aria-label="Reason for suspension"
                              maxLength={500}
                            />
                            <button
                              type="button"
                              className="adm-btn adm-btn--danger adm-btn--sm"
                              disabled={busyId === m.id || !reason.trim()}
                              onClick={() => void setSuspended(m.id, true)}
                            >
                              {busyId === m.id ? 'Working…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              className="adm-btn adm-btn--ghost adm-btn--sm"
                              onClick={() => {
                                setSuspending(null)
                                setReason('')
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="adm-btn adm-btn--secondary adm-btn--sm"
                            onClick={() => {
                              setSuspending(m.id)
                              setReason('')
                            }}
                          >
                            Suspend
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {memberTotal > PAGE_SIZE && (
              <div className="adm-pager">
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  disabled={memberSkip === 0}
                  onClick={() => setMemberSkip(Math.max(0, memberSkip - PAGE_SIZE))}
                >
                  Previous
                </button>
                <span className="adm-cell-muted">
                  {memberSkip + 1}–{Math.min(memberSkip + PAGE_SIZE, memberTotal)} of {memberTotal}
                </span>
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  disabled={memberSkip + PAGE_SIZE >= memberTotal}
                  onClick={() => setMemberSkip(memberSkip + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="adm-card">
        <div className="adm-card-head">
          <h2 className="adm-card-title">Voucher queue — needs Amazon code</h2>
        </div>
        {rows.length === 0 ? (
          <div className="adm-empty">
            <p className="adm-empty-title">No vouchers waiting for a code</p>
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Issued</th>
                  <th>Recipient</th>
                  <th className="adm-td-num">Points</th>
                  <th className="adm-td-num">Value</th>
                  <th>Amazon code</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td>{dt(v.issuedAt)}</td>
                    <td>
                      <div>{v.user.name ?? '(no name)'}</div>
                      <div className="adm-cell-muted">{v.user.email ?? v.user.phone ?? '(no contact)'}</div>
                    </td>
                    <td className="adm-td-num">{v.points}</td>
                    <td className="adm-td-num">{rs(v.valuePaise)}</td>
                    <td>
                      <div className="adm-row">
                        <input
                          className="adm-input"
                          placeholder="AMAZON-XXXX-XXXX"
                          aria-label={`Amazon code for ${v.user.name ?? v.user.email ?? 'this voucher'}`}
                          value={codeInput[v.id] ?? ''}
                          onChange={(e) => setCodeInput((c) => ({ ...c, [v.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="adm-btn adm-btn--primary adm-btn--sm"
                          disabled={busyId === v.id || !(codeInput[v.id] ?? '').trim()}
                          onClick={() => void saveCode(v.id)}
                        >
                          {busyId === v.id ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
