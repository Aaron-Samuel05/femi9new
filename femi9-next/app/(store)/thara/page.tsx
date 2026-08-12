'use client'

import { useEffect, useState } from 'react'
import '@/styles/thara.css'

/**
 * /thara — customer Thara dashboard. Reads /api/thara/summary and renders
 * every visible piece of the program: membership status, referral code and
 * URL, wallet balance and recent ledger rows, current-cycle points and
 * projected voucher value, and voucher history.
 *
 * Client-side by convention (same as /affiliate); the API is the source of
 * truth for every number.
 */

type Status = 'purchase_pending' | 'active' | 'suspended' | 'deactivated'
type VoucherStatus = 'available' | 'claimed' | 'expired' | 'cancelled'

interface Summary {
  enrolled: true
  membership: {
    status: Status
    referralCode: string
    referralUrl: string
    enrolledAt: string
    activatedAt: string | null
  }
  referrerCode: string | null
  downlineCount: number
  credit: {
    balancePaise: number
    recentRows: { id: string; delta: number; reason: string; sourceOrderId: string | null; balanceAfter: number; createdAt: string }[]
  }
  cycle: {
    id: string
    startDate: string
    endDate: string
    status: 'open' | 'closed'
    currentPoints: number
    estimatedVoucherRupees: number
  }
  vouchers: {
    id: string
    cycleId: string
    points: number
    valuePaise: number
    status: VoucherStatus
    issuedAt: string
    claimDeadline: string
    claimedAt: string | null
    hasAmazonCode: boolean
    amazonCode: string | null
  }[]
}

type Response = { enrolled: false } | Summary

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const dt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TharaPage() {
  const [data, setData] = useState<Response | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState('')
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [claiming, setClaiming] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/thara/summary', { cache: 'no-store' })
      if (res.status === 404) {
        setError('The Thara Model isn\'t available on this account right now.')
        return
      }
      if (res.status === 401) {
        window.location.href = '/login?next=/thara'
        return
      }
      const body = await res.json()
      setData(body)
    } catch (e) {
      setError('Could not load your Thara dashboard.')
    }
  }
  useEffect(() => { void load() }, [])

  async function enrol() {
    setBusy(true)
    try {
      const res = await fetch('/api/thara/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ termsVersion: 'v1' }),
      })
      if (res.ok) await load()
    } finally {
      setBusy(false)
    }
  }

  async function sendInvite() {
    if (!invite.trim()) return
    setBusy(true)
    setInviteMsg(null)
    try {
      const res = await fetch('/api/thara/invite', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: invite.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setInvite('')
        setInviteMsg(body.mock ? 'Invite queued (mock mode — check dev logs).' : 'Invite sent.')
      } else {
        setInviteMsg(body.error ?? 'Could not send that invite.')
      }
    } finally {
      setBusy(false)
    }
  }

  async function claim(id: string) {
    setClaiming(id)
    try {
      const res = await fetch(`/api/thara/vouchers/${id}/claim`, { method: 'POST' })
      if (res.ok) await load()
    } finally {
      setClaiming(null)
    }
  }

  if (error) {
    return (
      <main className="thara">
        <div className="thara-empty"><p>{error}</p></div>
      </main>
    )
  }
  if (!data) {
    return (
      <main className="thara">
        <div className="thara-empty"><p>Loading your Thara dashboard…</p></div>
      </main>
    )
  }
  if (!('enrolled' in data) || !data.enrolled) {
    return (
      <main className="thara">
        <section className="thara-hero">
          <h1>Join the Thara Model</h1>
          <p>Get a personal discount on your Femi9 orders, earn Femi9 credit on every friend you refer, and pick up an Amazon voucher every quarter.</p>
          <button className="btn btn-primary" disabled={busy} onClick={() => void enrol()}>
            {busy ? 'Joining…' : 'Join now'}
          </button>
        </section>
      </main>
    )
  }

  const s = data
  return (
    <main className="thara">
      <section className="thara-hero">
        <div className="row">
          <div>
            <h1>Your Thara</h1>
            <p className="status status-{s.membership.status}">Status: <strong>{s.membership.status.replace('_', ' ')}</strong></p>
          </div>
          <div className="metric">
            <div className="label">Store credit</div>
            <div className="value">{rs(s.credit.balancePaise)}</div>
          </div>
        </div>
      </section>

      <section className="thara-block">
        <h2>Your referral code</h2>
        <div className="code-row">
          <code>{s.membership.referralCode}</code>
          <button
            className="btn btn-ghost"
            onClick={() => void navigator.clipboard?.writeText(s.membership.referralUrl)}
          >
            Copy link
          </button>
        </div>
        <p className="url">{s.membership.referralUrl}</p>
        <p className="hint">{s.downlineCount} referred · {s.membership.activatedAt ? 'earning enabled' : 'complete a ≥ ₹3,000 order to unlock earnings'}</p>
      </section>

      <section className="thara-block">
        <h2>Invite by email</h2>
        <div className="invite-row">
          <input
            type="email"
            placeholder="friend@example.com"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            disabled={busy}
          />
          <button className="btn btn-primary" disabled={busy || !invite.trim()} onClick={() => void sendInvite()}>
            {busy ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        {inviteMsg && <p className="hint">{inviteMsg}</p>}
      </section>

      <section className="thara-block">
        <h2>Current cycle</h2>
        <p>{dt(s.cycle.startDate)} — {dt(s.cycle.endDate)}</p>
        <div className="row">
          <div className="metric">
            <div className="label">Points so far</div>
            <div className="value">{s.cycle.currentPoints}</div>
          </div>
          <div className="metric">
            <div className="label">Estimated voucher</div>
            <div className="value">₹{s.cycle.estimatedVoucherRupees}</div>
          </div>
        </div>
      </section>

      {s.vouchers.length > 0 && (
        <section className="thara-block">
          <h2>Vouchers</h2>
          <table className="thara-table">
            <thead><tr><th>Issued</th><th>Points</th><th>Value</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {s.vouchers.map((v) => (
                <tr key={v.id}>
                  <td>{dt(v.issuedAt)}</td>
                  <td>{v.points}</td>
                  <td>{rs(v.valuePaise)}</td>
                  <td><span className={`pill pill-${v.status}`}>{v.status}</span></td>
                  <td>
                    {v.status === 'available' && v.hasAmazonCode && (
                      <button className="btn btn-primary" disabled={claiming === v.id} onClick={() => void claim(v.id)}>
                        {claiming === v.id ? 'Claiming…' : 'Claim'}
                      </button>
                    )}
                    {v.status === 'claimed' && v.amazonCode && <code>{v.amazonCode}</code>}
                    {v.status === 'available' && !v.hasAmazonCode && <span className="hint">Awaiting code</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {s.credit.recentRows.length > 0 && (
        <section className="thara-block">
          <h2>Recent credit activity</h2>
          <table className="thara-table">
            <thead><tr><th>Date</th><th>Reason</th><th>Change</th><th>Balance</th></tr></thead>
            <tbody>
              {s.credit.recentRows.map((r) => (
                <tr key={r.id}>
                  <td>{dt(r.createdAt)}</td>
                  <td>{r.reason.replace(/-/g, ' ')}</td>
                  <td className={r.delta >= 0 ? 'credit' : 'debit'}>
                    {r.delta >= 0 ? '+' : ''}{rs(r.delta)}
                  </td>
                  <td>{rs(r.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  )
}
