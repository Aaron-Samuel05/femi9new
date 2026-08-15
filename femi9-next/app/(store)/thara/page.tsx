'use client'

import { useEffect, useState } from 'react'
import { THARA_TERMS_VERSION } from '@/lib/thara/terms'
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
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function copyReferral(url: string) {
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access is permission-gated and absent over plain HTTP. The URL
      // is printed below the button either way, so say plainly that the copy did
      // not happen rather than leaving the label stuck on "Copy link".
      setCopyError('Copying is blocked in this browser — select the link below instead.')
    }
  }

  /**
   * Leave the programme. Confirmed by the inline two-button step in the card.
   * Deactivation is terminal — enrollUser() throws TharaDeactivatedError for a
   * deactivated membership — so the copy has to say so before the click.
   */
  async function optOut() {
    setLeaving(true)
    setLeaveError(null)
    try {
      const res = await fetch('/api/thara/opt-out', { method: 'POST' })
      if (res.status === 401) {
        window.location.href = '/login?next=/thara'
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setLeaveError(body.error ?? 'We could not update your membership. Please try again.')
        return
      }
      setConfirmLeave(false)
      await load()
    } catch {
      setLeaveError('We could not reach the server. Please check your connection.')
    } finally {
      setLeaving(false)
    }
  }

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

  /**
   * Enrol. The route rejects a stale terms version and refuses a previously
   * deactivated account, both as a 400 carrying the reason — this used to be
   * `if (res.ok) await load()` with no else, so those two real refusals looked
   * exactly like a button that did nothing.
   */
  async function enrol() {
    setBusy(true)
    setActionError(null)
    try {
      const res = await fetch('/api/thara/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ termsVersion: THARA_TERMS_VERSION }),
      })
      if (res.status === 401) {
        window.location.href = '/login?next=/thara'
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'We could not enrol you just now. Please try again.')
        return
      }
      await load()
    } catch {
      setActionError('We could not reach the server. Please check your connection.')
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
      // A session that lapsed while this page sat open reads as a generic
      // failure otherwise, which invites the member to retype and retry forever.
      if (res.status === 401) {
        window.location.href = '/login?next=/thara'
        return
      }
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setInvite('')
        setInviteMsg(body.mock ? 'Invite queued (mock mode — check dev logs).' : 'Invite sent.')
      } else {
        setInviteMsg(body.error ?? 'Could not send that invite.')
      }
    } catch {
      setInviteMsg('We could not reach the server. Please check your connection.')
    } finally {
      setBusy(false)
    }
  }

  /** Claim a voucher. A voucher past its deadline 400s with the reason. */
  async function claim(id: string) {
    setClaiming(id)
    setActionError(null)
    try {
      const res = await fetch(`/api/thara/vouchers/${id}/claim`, { method: 'POST' })
      if (res.status === 401) {
        window.location.href = '/login?next=/thara'
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setActionError(body.error ?? 'We could not claim that voucher. Please try again.')
        return
      }
      await load()
    } catch {
      setActionError('We could not reach the server. Please check your connection.')
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
          {actionError && <p className="thara-error" role="alert">{actionError}</p>}
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
            <p className={`status status-${s.membership.status}`}>
              Status: <strong>{s.membership.status.replace('_', ' ')}</strong>
            </p>
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
          <button className="btn btn-ghost" onClick={() => void copyReferral(s.membership.referralUrl)}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        {copyError && <p className="thara-error" role="alert">{copyError}</p>}
        <p className="url">{s.membership.referralUrl}</p>
        <p className="hint">{s.downlineCount} referred · {s.membership.activatedAt ? 'earning enabled' : 'complete a ≥ ₹3,000 order to unlock earnings'}</p>
      </section>

      <section className="thara-block">
        <h2>Invite by email</h2>
        <div className="invite-row">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
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
          {/* The five uppercase single-word headers cannot wrap, so this table
              min-contents wider than a 360px phone allows. html/body are
              `overflow-x: clip`, so without the scroller the Status pill and
              the whole Action column are unreachable. */}
          <div className="thara-scroll">
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
          </div>
          {actionError && <p className="thara-error" role="alert">{actionError}</p>}
        </section>
      )}

      {s.credit.recentRows.length > 0 && (
        <section className="thara-block">
          <h2>Recent credit activity</h2>
          <div className="thara-scroll">
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
          </div>
        </section>
      )}

      {/* Leaving the programme. /api/thara/opt-out shipped with no control
          anywhere in the product, so an enrolled member had no way out. The
          confirm step is two buttons in the card — never a browser confirm().
          A membership already deactivated has nothing left to leave, so the
          whole block drops out rather than offering a no-op. */}
      {s.membership.status !== 'deactivated' && (
        <section className="thara-block">
          <h2>Leaving the programme</h2>
          <p className="hint">
            Opting out stops new referral earnings and cannot be undone — rejoining later is not
            possible. Credit you have already earned stays on your account, and any issued voucher
            remains claimable until its deadline.
          </p>
          {leaveError && <p className="thara-error" role="alert">{leaveError}</p>}
          {confirmLeave ? (
            <div className="invite-row">
              <button className="btn btn-primary" disabled={leaving} onClick={() => void optOut()}>
                {leaving ? 'Leaving…' : 'Yes, leave Thara for good'}
              </button>
              <button className="btn btn-ghost" disabled={leaving} onClick={() => setConfirmLeave(false)}>
                Stay in
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>
              Leave the Thara programme
            </button>
          )}
        </section>
      )}
    </main>
  )
}
