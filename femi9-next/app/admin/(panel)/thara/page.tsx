'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * /admin/thara — program-wide ops console.
 *
 * Reads /api/admin/thara/metrics for top-level KPIs, and
 * /api/admin/thara/vouchers?missingCode=true for the voucher queue where an
 * admin can paste an Amazon code manually (until the Amazon Incentives API
 * onboarding is complete). Members list already lives under
 * /api/admin/thara/list — surfaced as a link below.
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

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const dt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TharaAdmin() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [rows, setRows] = useState<VoucherRow[]>([])
  const [codeInput, setCodeInput] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [m, v] = await Promise.all([
        fetch('/api/admin/thara/metrics', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/thara/vouchers?missingCode=true&take=50', { cache: 'no-store' }).then((r) => r.json()),
      ])
      setMetrics(m)
      setRows(v.rows ?? [])
    } catch (e) {
      setError('Could not load Thara metrics.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function saveCode(id: string) {
    const value = (codeInput[id] ?? '').trim()
    if (!value) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/thara/vouchers/${id}/set-code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amazonCode: value }),
      })
      if (res.ok) {
        setCodeInput((c) => ({ ...c, [id]: '' }))
        await load()
      }
    } finally {
      setBusyId(null)
    }
  }

  async function closeCycle() {
    if (!confirm('Close the current cycle and issue vouchers now?')) return
    const res = await fetch('/api/cron/thara-close-cycle', { method: 'POST' })
    if (res.ok) await load()
  }

  async function expireVouchers() {
    const res = await fetch('/api/cron/thara-expire-vouchers', { method: 'POST' })
    if (res.ok) await load()
  }

  if (error) return <div className="thara-admin"><p>{error}</p></div>
  if (!metrics) return <div className="thara-admin"><p>Loading…</p></div>

  return (
    <div className="thara-admin">
      <header>
        <h1>Thara Model — Ops</h1>
        <p>Program-wide metrics and voucher queue.</p>
      </header>

      <section className="ta-grid">
        <div className="ta-card">
          <div className="ta-label">Members</div>
          <div className="ta-metric">{metrics.members.total}</div>
          <div className="ta-sub">
            {metrics.members.active} active · {metrics.members.pending} pending · {metrics.members.suspended} suspended
          </div>
        </div>
        <div className="ta-card">
          <div className="ta-label">Referrals</div>
          <div className="ta-metric">{metrics.referrals.total}</div>
          <div className="ta-sub">{metrics.referrals.locked} locked</div>
        </div>
        <div className="ta-card">
          <div className="ta-label">Commission accrued</div>
          <div className="ta-metric">{rs(metrics.credit.commissionAccruedPaise)}</div>
          <div className="ta-sub">Credit spent: {rs(metrics.credit.creditSpentPaise)}</div>
        </div>
        <div className="ta-card">
          <div className="ta-label">Points accrued</div>
          <div className="ta-metric">{metrics.rewards.totalPointsAccrued}</div>
          <div className="ta-sub">
            {metrics.rewards.vouchersAvailable} available · {metrics.rewards.vouchersClaimed} claimed · {metrics.rewards.vouchersExpired} expired
          </div>
        </div>
      </section>

      <section className="ta-block">
        <div className="ta-actions">
          <a className="ta-btn" href="/api/admin/thara/list?take=100">View member list (JSON)</a>
          <button className="ta-btn" onClick={() => void closeCycle()}>Close current cycle now</button>
          <button className="ta-btn" onClick={() => void expireVouchers()}>Expire stale vouchers</button>
        </div>
        {metrics.currentCycle && (
          <p className="ta-hint">Current cycle: {dt(metrics.currentCycle.startDate)} — {dt(metrics.currentCycle.endDate)}</p>
        )}
      </section>

      <section className="ta-block">
        <h2>Voucher queue — needs Amazon code</h2>
        {rows.length === 0 ? (
          <p className="ta-hint">No vouchers waiting for a code.</p>
        ) : (
          <table className="ta-table">
            <thead><tr><th>Issued</th><th>Recipient</th><th>Points</th><th>Value</th><th>Amazon code</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  <td>{dt(v.issuedAt)}</td>
                  <td>
                    <div>{v.user.name ?? '(no name)'}</div>
                    <div className="ta-hint">{v.user.email ?? v.user.phone ?? '(no contact)'}</div>
                  </td>
                  <td>{v.points}</td>
                  <td>{rs(v.valuePaise)}</td>
                  <td>
                    <div className="ta-code-input">
                      <input
                        placeholder="AMAZON-XXXX-XXXX"
                        value={codeInput[v.id] ?? ''}
                        onChange={(e) => setCodeInput((c) => ({ ...c, [v.id]: e.target.value }))}
                      />
                      <button className="ta-btn" disabled={busyId === v.id} onClick={() => void saveCode(v.id)}>
                        {busyId === v.id ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <style jsx>{`
        .thara-admin { padding: 24px 32px; font-family: -apple-system, "SF Pro Text", "Segoe UI", Roboto, sans-serif; }
        .thara-admin header { margin-bottom: 24px; }
        .thara-admin h1 { font-family: "Fraunces", Georgia, serif; font-weight: 400; font-size: 1.8rem; margin: 0 0 4px; color: #34204E; }
        .thara-admin h2 { font-family: "Fraunces", Georgia, serif; font-weight: 400; font-size: 1.2rem; margin: 0 0 12px; color: #34204E; }
        .thara-admin p { color: #4A3E5D; margin: 4px 0; }
        .ta-hint { color: #7F6EB9; font-size: 13px; }
        .ta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .ta-card { background: #fff; border: 1px solid #E4DFEE; border-radius: 8px; padding: 16px 18px; }
        .ta-label { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #7F6EB9; font-weight: 600; }
        .ta-metric { font-family: "Fraunces", Georgia, serif; font-size: 1.8rem; color: #34204E; margin: 4px 0 6px; font-variant-numeric: tabular-nums; }
        .ta-sub { font-size: 12px; color: #7F6EB9; }
        .ta-block { background: #fff; border: 1px solid #E4DFEE; border-radius: 8px; padding: 20px 24px; margin-bottom: 20px; }
        .ta-actions { display: flex; gap: 12px; flex-wrap: wrap; }
        .ta-btn {
          display: inline-block; padding: 8px 16px; border-radius: 6px; border: 1px solid #E4DFEE;
          background: #fff; color: #34204E; font-size: 13px; font-weight: 600; cursor: pointer;
          text-decoration: none; font-family: inherit;
        }
        .ta-btn:hover { border-color: #5B3FDA; color: #5B3FDA; }
        .ta-table { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums; }
        .ta-table th, .ta-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #EDE9F4; vertical-align: top; }
        .ta-table th { color: #7F6EB9; font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; }
        .ta-code-input { display: flex; gap: 6px; }
        .ta-code-input input {
          flex: 1; min-width: 140px; padding: 6px 10px; border: 1px solid #E4DFEE; border-radius: 4px;
          font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12.5px;
        }
      `}</style>
    </div>
  )
}
