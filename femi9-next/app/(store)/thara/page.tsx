'use client'

import { useEffect, useState } from 'react'
import { THARA_TERMS_VERSION } from '@/lib/thara/terms'
import '@/styles/thara.css'

/**
 * /thara — the customer's Thara page.
 *
 * This page has two jobs and the first one used to be missing entirely: it has
 * to TEACH the programme before it reports on it. A shopper arriving here had
 * no way to learn what Thara is, what "purchase pending" meant, or why nothing
 * had unlocked — the page opened straight into a status line and a ledger.
 *
 * So the layout is: what it is → the three steps → where you are on them →
 * what you earn, with real rupees → your tools → questions. The explainer is
 * shown to members and non-members alike, because a member who has forgotten
 * how it works needs it just as much as a new one.
 *
 * Every number printed here comes from /api/thara/summary (`rules`), never from
 * copy typed into this file, so the page cannot teach a slab the checkout no
 * longer applies.
 */

type Status = 'purchase_pending' | 'active' | 'suspended' | 'deactivated'
type VoucherStatus = 'available' | 'claimed' | 'expired' | 'cancelled'

interface Rules {
  minOrderPaise: number
  commissionPct: number
  pointsPct: number
  voucherMultiplier: number
  voucherClaimDays: number
  slabs: { minPaise: number; maxPaise: number | null; pct: number }[]
}

interface Unlock {
  requiredPaise: number
  bestOrderPaise: number
  bestOrderNo: string | null
  paidOrderCount: number
  qualified: boolean
  shortfallPaise: number
}

interface Summary {
  enrolled: true
  rules: Rules
  unlock: Unlock
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

interface NotEnrolled {
  enrolled: false
  rules?: Rules
  unlock?: Unlock
}

type Response = NotEnrolled | Summary

/** Only used if an old cached response arrives without `rules`. */
const FALLBACK_RULES: Rules = {
  minOrderPaise: 300_000,
  commissionPct: 10,
  pointsPct: 1,
  voucherMultiplier: 3,
  voucherClaimDays: 30,
  slabs: [
    { minPaise: 300_000, maxPaise: 599_999, pct: 10 },
    { minPaise: 600_000, maxPaise: 899_999, pct: 15 },
    { minPaise: 900_000, maxPaise: null, pct: 20 },
  ],
}
const FALLBACK_UNLOCK: Unlock = {
  requiredPaise: 300_000,
  bestOrderPaise: 0,
  bestOrderNo: null,
  paidOrderCount: 0,
  qualified: false,
  shortfallPaise: 300_000,
}

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
const dt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** Plain-English name for each membership state. "purchase_pending" is a
 *  database word; nobody should have to read it. */
const STATUS_LABEL: Record<Status, string> = {
  purchase_pending: 'Joined — not unlocked yet',
  active: 'Unlocked — you are earning',
  suspended: 'Paused by our team',
  deactivated: 'You left the programme',
}

// ── Explainer pieces ────────────────────────────────────────────────────────

function IconBag() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 8h12l-1 12H7L6 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  )
}
function IconShare() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.2 10.9 7.6-3.8M8.2 13.1l7.6 3.8" />
    </svg>
  )
}
function IconGift() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 11h16v9H4v-9ZM3 7.5h18V11H3V7.5ZM12 7.5V20" />
      <path d="M12 7.5S10.5 4 8.5 4a2 2 0 0 0 0 4h3.5Zm0 0S13.5 4 15.5 4a2 2 0 0 1 0 4H12Z" />
    </svg>
  )
}

/**
 * The three steps, always in the same order, each carrying its own state so a
 * member can see at a glance which one she is standing on.
 */
function Steps({
  rules,
  enrolled,
  unlocked,
}: {
  rules: Rules
  enrolled: boolean
  unlocked: boolean
}) {
  const state = (done: boolean, now: boolean) => (done ? 'done' : now ? 'now' : 'later')
  const steps = [
    {
      icon: <IconBag />,
      title: 'Join the programme',
      body: 'It is free and takes one tap. You get your own referral link straight away.',
      cls: state(enrolled, !enrolled),
    },
    {
      icon: <IconShare />,
      title: `Place one order of ${rs(rules.minOrderPaise)} or more`,
      body: `That single order switches your earning on. It must be ${rs(rules.minOrderPaise)} in ONE order — two smaller orders do not add up to it.`,
      cls: state(unlocked, enrolled && !unlocked),
    },
    {
      icon: <IconGift />,
      title: 'Share your link and earn',
      body: 'Send your link to friends. Every time a friend buys anything, money comes back to you.',
      cls: state(false, unlocked),
    },
  ]
  return (
    <section className="thara-block">
      <h2>How Thara works — three steps</h2>
      <ol className="thara-steps">
        {steps.map((s, i) => (
          <li key={s.title} className={`step step-${s.cls}`}>
            <span className="step-num" aria-hidden="true">
              {s.cls === 'done' ? '✓' : i + 1}
            </span>
            <span className="step-icon" aria-hidden="true">{s.icon}</span>
            <div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <span className="step-state">
                {s.cls === 'done' ? 'Done' : s.cls === 'now' ? 'You are here' : 'Next'}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * The unlock meter. This is the answer to "I ordered twice, why is nothing
 * unlocked?" — it shows the BIGGEST SINGLE order, because that is what the rule
 * actually measures, and says so in words.
 */
function UnlockMeter({ rules, unlock }: { rules: Rules; unlock: Unlock }) {
  const pct = Math.min(100, Math.round((unlock.bestOrderPaise / unlock.requiredPaise) * 100))
  return (
    <section className="thara-block thara-meter">
      <h2>How close are you?</h2>
      <div
        className="meter-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Progress towards unlocking Thara earnings"
      >
        <div className="meter-fill" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <div className="meter-legend">
        <span>{rs(unlock.bestOrderPaise)} — your biggest single order</span>
        <span>{rs(unlock.requiredPaise)} needed</span>
      </div>
      {unlock.paidOrderCount === 0 ? (
        <p>You have not placed an order yet. Your first order of {rs(rules.minOrderPaise)} or more unlocks everything below.</p>
      ) : unlock.qualified ? (
        <p>Your order {unlock.bestOrderNo ? `${unlock.bestOrderNo} ` : ''}of {rs(unlock.bestOrderPaise)} already qualifies. You are unlocked.</p>
      ) : (
        <p>
          You have placed {unlock.paidOrderCount} order{unlock.paidOrderCount === 1 ? '' : 's'}. Your biggest one
          is {rs(unlock.bestOrderPaise)}, so you need <strong>{rs(unlock.shortfallPaise)} more in a single order</strong>.
        </p>
      )}
      <p className="thara-note">
        <strong>Important:</strong> orders are not added together. Two orders of {rs(Math.round(rules.minOrderPaise / 2))} do
        not unlock the programme — one order of {rs(rules.minOrderPaise)} does.
      </p>
    </section>
  )
}

/** The three benefits, each with a worked example in rupees. */
function Benefits({ rules }: { rules: Rules }) {
  const example = rules.minOrderPaise // ₹3,000 friend order
  const credit = Math.floor((example * rules.commissionPct) / 100)
  const points = Math.floor((example * rules.pointsPct) / 100 / 100)
  const voucher = points * rules.voucherMultiplier
  return (
    <section className="thara-block">
      <h2>What you get</h2>
      <div className="benefit-grid">
        <div className="benefit">
          <span className="benefit-tag">1 · On your own shopping</span>
          <h3>Money off every order you place</h3>
          <p>
            Once you are unlocked, {rules.slabs[0]?.pct ?? 10}% to {rules.slabs[rules.slabs.length - 1]?.pct ?? 20}% comes
            off your own orders automatically. Nothing to type in.
          </p>
        </div>
        <div className="benefit">
          <span className="benefit-tag">2 · When a friend buys</span>
          <h3>{rules.commissionPct}% back as Femi9 money</h3>
          <p>
            Every time a friend who used your link buys anything, {rules.commissionPct}% of what they spend lands in your
            Femi9 wallet. It comes off your next bill by itself.
          </p>
        </div>
        <div className="benefit">
          <span className="benefit-tag">3 · Every three months</span>
          <h3>An Amazon voucher</h3>
          <p>
            Friends&apos; orders also collect points ({rules.pointsPct}% of what they spend). Every three months your
            points turn into an Amazon voucher worth {rules.voucherMultiplier}× the points.
          </p>
        </div>
      </div>

      <div className="example">
        <h3>A real example</h3>
        <ol className="example-flow">
          <li><span className="ex-step">Your friend spends</span><strong>{rs(example)}</strong></li>
          <li><span className="ex-step">You get Femi9 money</span><strong>{rs(credit)}</strong></li>
          <li><span className="ex-step">You also collect points</span><strong>{points} points</strong></li>
          <li><span className="ex-step">Those points become a voucher</span><strong>₹{voucher} Amazon</strong></li>
        </ol>
        <p className="hint">That is one friend, one order. Ten friends doing the same is ten times as much.</p>
      </div>
    </section>
  )
}

/** The personal-discount slab table, written as sentences rather than ranges. */
function Slabs({ rules }: { rules: Rules }) {
  return (
    <section className="thara-block">
      <h2>Your own discount, once you are unlocked</h2>
      <ul className="slabs">
        {rules.slabs.map((s) => (
          <li key={s.pct}>
            <span className="slab-pct">{s.pct}% off</span>
            <span className="slab-range">
              {s.maxPaise === null
                ? `when your order is ${rs(s.minPaise)} or more`
                : `when your order is between ${rs(s.minPaise)} and ${rs(s.maxPaise)}`}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        Orders under {rs(rules.slabs[0]?.minPaise ?? rules.minOrderPaise)} are priced as normal. If you also have a coupon
        code, we apply whichever saves you more — the two are not added together.
      </p>
    </section>
  )
}

function Faq({ rules }: { rules: Rules }) {
  const items = [
    {
      q: 'Do my friends have to join Thara too?',
      a: 'No. They just shop normally using your link. Only you need to be a member to earn.',
    },
    {
      q: 'Is the money real?',
      a: `The ${rules.commissionPct}% is Femi9 money — it comes off your next Femi9 order automatically. It cannot be sent to a bank or UPI. The Amazon voucher is a real Amazon gift code.`,
    },
    {
      q: 'I placed two orders. Why am I still locked?',
      a: `Orders are not added together. One single order of ${rs(rules.minOrderPaise)} or more is what unlocks the programme.`,
    },
    {
      q: 'Does my first big order get the discount?',
      a: 'No. That order is what unlocks you, so it is charged at the normal price. Every order after it gets your discount.',
    },
    {
      q: 'When does my Amazon voucher arrive?',
      a: `At the end of each three-month cycle. You then have ${rules.voucherClaimDays} days to claim it before it expires.`,
    },
    {
      q: 'What if my friend returns their order?',
      a: 'The money you earned on that order is taken back, because the sale did not happen.',
    },
  ]
  return (
    <section className="thara-block">
      <h2>Questions people ask</h2>
      <dl className="faq">
        {items.map((it) => (
          <div className="faq-item" key={it.q}>
            <dt>{it.q}</dt>
            <dd>{it.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

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
        setError('The Thara Model isn\'t switched on for this store yet. Check back soon.')
        return
      }
      if (res.status === 401) {
        window.location.href = '/login?next=/thara'
        return
      }
      const body = await res.json()
      setData(body)
    } catch {
      setError('Could not load your Thara page. Please check your connection and try again.')
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
        <div className="thara-empty"><p>Loading your Thara page…</p></div>
      </main>
    )
  }

  const rules = data.rules ?? FALLBACK_RULES
  const unlock = data.unlock ?? FALLBACK_UNLOCK

  // ── Not a member yet: the same lesson, ending in a Join button ────────────
  if (!data.enrolled) {
    return (
      <main className="thara">
        <section className="thara-hero">
          <p className="thara-eyebrow">Femi9 Thara</p>
          <h1>Shop. Share. Earn.</h1>
          <p className="thara-lede">
            Thara is our referral club. Join for free, place one order of {rs(rules.minOrderPaise)} or more, then share
            your own link. Every time a friend shops with it, Femi9 puts money back in your pocket.
          </p>
          {unlock.qualified && (
            <p className="thara-good">
              Good news — your {rs(unlock.bestOrderPaise)} order already meets the {rs(rules.minOrderPaise)} rule. Join
              now and you are unlocked immediately.
            </p>
          )}
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => void enrol()}>
            {busy ? 'Joining…' : 'Join Thara — free'}
          </button>
          {actionError && <p className="thara-error" role="alert">{actionError}</p>}
        </section>

        <Steps rules={rules} enrolled={false} unlocked={false} />
        <Benefits rules={rules} />
        <Slabs rules={rules} />
        <Faq rules={rules} />

        <section className="thara-block join-cta">
          <h2>Ready?</h2>
          <p>Joining is free, takes one tap, and you can leave whenever you like.</p>
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={() => void enrol()}>
            {busy ? 'Joining…' : 'Join Thara — free'}
          </button>
          {actionError && <p className="thara-error" role="alert">{actionError}</p>}
        </section>
      </main>
    )
  }

  // ── Member ────────────────────────────────────────────────────────────────
  const s = data
  const st = s.membership.status
  const unlocked = st === 'active'
  return (
    <main className="thara">
      <section className="thara-hero">
        <div className="row">
          <div>
            <p className="thara-eyebrow">Femi9 Thara</p>
            <h1>Your Thara</h1>
            <p className={`status status-${st}`}>{STATUS_LABEL[st]}</p>
            <p className="thara-lede">
              {unlocked
                ? 'Your link is live. Every friend who shops with it earns you Femi9 money and points.'
                : st === 'purchase_pending'
                  ? `You are in. One order of ${rs(rules.minOrderPaise)} or more switches your earning on.`
                  : st === 'suspended'
                    ? 'Earning is paused while our team reviews your account. Anything you already earned is safe.'
                    : 'You have left the programme. Credit you already earned stays on your account.'}
            </p>
          </div>
          <div className="metric">
            <div className="label">Femi9 money</div>
            <div className="value">{rs(s.credit.balancePaise)}</div>
            <div className="hint">comes off your next order</div>
          </div>
        </div>
      </section>

      <Steps rules={rules} enrolled unlocked={unlocked} />

      {!unlocked && st !== 'deactivated' && <UnlockMeter rules={rules} unlock={unlock} />}

      <section className="thara-block">
        <h2>Your link — this is what you share</h2>
        <div className="code-row">
          <code>{s.membership.referralCode}</code>
          <button className="btn btn-primary" onClick={() => void copyReferral(s.membership.referralUrl)}>
            {copied ? 'Copied ✓' : 'Copy my link'}
          </button>
        </div>
        {copyError && <p className="thara-error" role="alert">{copyError}</p>}
        <p className="url">{s.membership.referralUrl}</p>
        <p>
          Send it on WhatsApp, put it in your bio, message it to a friend — anywhere. When someone opens it and later
          buys, we know they came from you.
        </p>
        <p className="hint">
          {s.downlineCount === 0
            ? 'No friends have signed up with your link yet.'
            : `${s.downlineCount} ${s.downlineCount === 1 ? 'friend has' : 'friends have'} signed up with your link.`}
          {' '}
          {unlocked ? 'You are earning on their orders.' : `Earning starts once you place your ${rs(rules.minOrderPaise)} order.`}
        </p>
      </section>

      <section className="thara-block">
        <h2>Or email the link to a friend</h2>
        <div className="invite-row">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="friend@example.com"
            aria-label="Friend's email address"
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

      <Benefits rules={rules} />
      <Slabs rules={rules} />

      <section className="thara-block">
        <h2>Your points this cycle</h2>
        <p>
          Points from friends&apos; orders between {dt(s.cycle.startDate)} and {dt(s.cycle.endDate)}. At the end of the
          cycle they turn into an Amazon voucher.
        </p>
        <div className="row">
          <div className="metric">
            <div className="label">Points so far</div>
            <div className="value">{s.cycle.currentPoints}</div>
          </div>
          <div className="metric">
            <div className="label">Voucher if the cycle ended today</div>
            <div className="value">₹{s.cycle.estimatedVoucherRupees}</div>
          </div>
        </div>
        {s.cycle.currentPoints === 0 && (
          <p className="hint">No points yet. Points arrive when a friend who used your link places an order.</p>
        )}
      </section>

      {s.vouchers.length > 0 && (
        <section className="thara-block">
          <h2>Your Amazon vouchers</h2>
          <p className="hint">Claim within {rules.voucherClaimDays} days of the issue date or the voucher expires.</p>
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
          <h2>Where your Femi9 money came from</h2>
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

      <Faq rules={rules} />

      {/* Leaving the programme. /api/thara/opt-out shipped with no control
          anywhere in the product, so an enrolled member had no way out. The
          confirm step is two buttons in the card — never a browser confirm().
          A membership already deactivated has nothing left to leave, so the
          whole block drops out rather than offering a no-op. */}
      {st !== 'deactivated' && (
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
