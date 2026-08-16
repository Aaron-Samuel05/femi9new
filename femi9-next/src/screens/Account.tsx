'use client'

/**
 * /account — the signed-in customer's home.
 *
 * This screen used to render <Shell variant="user">, which was the ADMIN console's
 * chrome: a left sidebar carrying an "Admin dashboard" link, two permanently
 * disabled topbar buttons, and the admin CSS system (panel / dash-grid / col-* /
 * dtable / badge). It edited the profile with prompt() and reported failures with
 * alert(). All of that is gone. The page now renders inside <MemberLayout> and is
 * built from the `.m-*` kit in member.css plus the `.acct-*` layout in account.css.
 *
 * It stays a pure client view: app/account/page.tsx resolves the real user on the
 * server and hands everything down as serializable props, so there is exactly one
 * identity resolver and one fallback string in the whole product.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { useRouter } from 'next/navigation'
import { Link } from '@/lib/router-compat'
import { MemberLayout } from '@/components/MemberLayout'
import { Rewards } from '@/components/Rewards'
import { Chip } from '@/components/Chip'
import { OptImg } from '@/components/OptImg'
import { useMediaGate } from '@/components/useMediaGate'
import { AreaChart } from '../charts/AreaChart'
import { fmtRs, fmtRsK } from '../charts/util'
import { useCart } from '@/store/cart'
import { INDIA_STATES } from '@/lib/geo/india-states'
import {
  IAlert,
  IBox,
  ICheck,
  IChevron,
  IGift,
  IPencil,
  IPin,
  IRupee,
  ISparkles,
  ITrash,
  ITrend,
} from '@/components/AppIcons'
import { Close } from '@/components/Icons'
import type {
  AccountAddress,
  AccountCoupon,
  AccountOrder,
  AccountSubscription,
  AccountUser,
  ActivityItem,
  EarnRates,
  SpendTrend,
  SubStatus,
} from '@/lib/services/account'
import type { RewardOptionView } from '@/lib/services/rewards'

export interface AccountProps {
  user: AccountUser
  pointsBalance: number
  orders: AccountOrder[]
  addresses: AccountAddress[]
  subscriptions: AccountSubscription[]
  coupons: AccountCoupon[]
  earnRates: EarnRates
  spendTrend: SpendTrend
  activity: ActivityItem[]
  rewardOptions: RewardOptionView[]
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/** Order status → the four member status tones. `pending` is the most common
 *  status a customer ever sees, so it must not fall through to bare text. */
const ORDER_TONE: Record<AccountOrder['statusKey'], 'active' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  processing: 'warning',
  paid: 'active',
  shipped: 'active',
  delivered: 'success',
  cancelled: 'danger',
  refunded: 'danger',
}

const SUB_TONE: Record<SubStatus, 'active' | 'warning' | 'danger'> = {
  active: 'active',
  paused: 'warning',
  cancelled: 'danger',
}
const SUB_LABEL: Record<SubStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
}

/** Statuses that never represent money the customer actually kept spending. */
const NON_SPEND: AccountOrder['statusKey'][] = ['cancelled', 'refunded']

/** "+91 98842 30571" / "9884230571" → the 10 national digits a form needs. */
function digitsOf(value: string | null | undefined): string {
  const d = (value ?? '').replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Everything a failed request can tell the UI, normalised into one shape.
 *  The API contract returns `{ error, details?.fieldErrors, code?, field?,
 *  retryAfterSec? }`, so a 400 maps to per-field errors and a 409 maps its single
 *  message onto the field it names. */
interface ApiFailure {
  message: string
  fieldErrors: Record<string, string>
  code?: string
  field?: string
  retryAfterSec?: number
}

async function readFailure(res: Response): Promise<ApiFailure> {
  const body = (await res.json().catch(() => null)) as {
    error?: string
    details?: { fieldErrors?: Record<string, string[] | undefined> }
    code?: string
    field?: string
    retryAfterSec?: number
  } | null

  const fieldErrors: Record<string, string> = {}
  for (const [key, messages] of Object.entries(body?.details?.fieldErrors ?? {})) {
    if (Array.isArray(messages) && messages.length > 0) fieldErrors[key] = messages[0]
  }
  // A 409 (or any coded error) names its field but carries no `details` — put its
  // message beside the input the customer typed rather than in a floating banner.
  if (body?.field && body.error && !fieldErrors[body.field]) fieldErrors[body.field] = body.error

  let message = body?.error ?? 'Something went wrong. Please try again.'
  if (typeof body?.retryAfterSec === 'number') message = `${message} Try again in ${body.retryAfterSec}s.`

  return { message, fieldErrors, code: body?.code, field: body?.field, retryAfterSec: body?.retryAfterSec }
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// ── Dialog primitive ─────────────────────────────────────────────────────────

interface SheetProps {
  onClose: () => void
  title: string
  description?: string
  wide?: boolean
  /** Where focus should land on open. Defaults to the first enabled input. */
  initialFocus?: RefObject<HTMLElement | null>
  children: ReactNode
}

/**
 * The accessible dialog that replaces every prompt() this screen used to open.
 * Mounted only while open, so each visit starts from clean form state and the
 * `.m-scrim` entrance transition has a frame to run from.
 */
function Sheet({ onClose, title, description, wide, initialFocus, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const [shown, setShown] = useState(false)
  const titleId = useId()

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // `is-open` has to land on a later frame than the mount, or the browser has
    // no starting opacity to transition from.
    const raf = requestAnimationFrame(() => {
      setShown(true)
      const target =
        initialFocus?.current ??
        sheetRef.current?.querySelector<HTMLElement>('input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ??
        sheetRef.current
      target?.focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus()
    }
  }, [initialFocus])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !sheetRef.current) return
    const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (n) => n.getClientRects().length > 0,
    )
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className={`m-scrim${shown ? ' is-open' : ''}`}
      onKeyDown={onKeyDown}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`m-sheet${wide ? ' m-sheet--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={sheetRef}
      >
        <div className="m-sheet__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="m-sheet__close" onClick={onClose} aria-label="Close">
            <Close aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** One field problem, rendered next to the input it belongs to. */
function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p className="m-field__error" id={id}>
      <IAlert aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

// ── Screen ───────────────────────────────────────────────────────────────────

type TabKey = 'orders' | 'subscriptions' | 'addresses' | 'profile'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'orders', label: 'Orders' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'addresses', label: 'Addresses' },
  { key: 'profile', label: 'Profile' },
]

export function Account({
  user,
  pointsBalance,
  orders,
  addresses,
  subscriptions,
  coupons,
  earnRates,
  spendTrend,
  activity,
  rewardOptions,
}: AccountProps) {
  const router = useRouter()
  const { notify } = useCart()

  const [tab, setTab] = useState<TabKey>('orders')
  const [profileSheet, setProfileSheet] = useState<{ focus?: 'name' | 'email' | 'phone' } | null>(null)
  const [addressSheet, setAddressSheet] = useState<{ address: AccountAddress | null } | null>(null)
  const tabRefs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({})
  /** Matches member.css's `.m-band__art` breakpoint — below it the decoration is
   *  not painted, so it must not be fetched either. */
  const showBandArt = useMediaGate('(min-width: 621px)')

  /**
   * One mutation helper for every fire-and-refresh control on this page.
   * A failure becomes a toast (the whole request failed) — never an alert(),
   * and never a silent revert.
   */
  const mutate = useCallback(
    async (url: string, init: RequestInit): Promise<boolean> => {
      try {
        const res = await fetch(url, {
          ...init,
          headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
        })
        if (!res.ok) {
          notify((await readFailure(res)).message)
          return false
        }
        router.refresh()
        return true
      } catch {
        notify('We could not reach the server. Check your connection and try again.')
        return false
      }
    },
    [notify, router],
  )

  // Lifetime spend excludes cancelled/refunded orders — money that came back is
  // not money spent, and claiming otherwise on a summary tile is a small lie.
  const lifetimeSpend = useMemo(
    () => orders.filter((o) => !NON_SPEND.includes(o.statusKey)).reduce((sum, o) => sum + o.total, 0),
    [orders],
  )

  // The cheapest reward still out of reach drives the points tile's sub-line.
  const nextReward = useMemo(
    () => [...rewardOptions].sort((a, b) => a.costPoints - b.costPoints).find((r) => r.costPoints > pointsBalance) ?? null,
    [rewardOptions, pointsBalance],
  )
  const pointsNote = nextReward
    ? `${(nextReward.costPoints - pointsBalance).toLocaleString('en-IN')} points to ${nextReward.title}`
    : rewardOptions.length > 0
      ? 'Every reward below is within reach'
      : 'Earn points on every order'

  const activeSubs = subscriptions.filter((s) => s.status !== 'cancelled').length

  const counts: Record<TabKey, number | null> = {
    orders: orders.length,
    subscriptions: activeSubs,
    addresses: addresses.length,
    profile: null,
  }

  /** Roving-tabindex arrow navigation, as a real tablist owes its keyboard users. */
  function onTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.key === tab)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    const key = TABS[next].key
    setTab(key)
    tabRefs.current[key]?.focus()
  }

  return (
    <MemberLayout
      identity={{
        displayName: user.displayName,
        initials: user.initials,
        tier: user.tier,
        image: user.image,
      }}
      active="overview"
      title={user.greeting}
      lead="Your orders, Bloom points, refills and delivery details - all in one place."
      actions={
        <button type="button" className="btn btn-ghost" onClick={() => setProfileSheet({})}>
          <IPencil aria-hidden="true" />
          <span>Edit profile</span>
        </button>
      }
    >
      {/* ── At a glance ─────────────────────────────────────────────────── */}
      <section className="m-figures" aria-label="Account summary">
        <div className="m-figure">
          <div className="m-figure__top">
            <span className="m-figure__label">Bloom points</span>
            <span className="m-figure__icon" aria-hidden="true"><ISparkles /></span>
          </div>
          <span className="m-figure__value">{pointsBalance.toLocaleString('en-IN')}</span>
          <span className="m-figure__note">{pointsNote}</span>
        </div>

        <div className="m-figure">
          <div className="m-figure__top">
            <span className="m-figure__label">Orders placed</span>
            <span className="m-figure__icon" aria-hidden="true"><IBox /></span>
          </div>
          <span className="m-figure__value">{orders.length}</span>
          <span className="m-figure__note">
            {orders.length > 0 ? `Most recent ${orders[0].date}` : 'Your first order is waiting'}
          </span>
        </div>

        <div className="m-figure">
          <div className="m-figure__top">
            <span className="m-figure__label">Lifetime spend</span>
            <span className="m-figure__icon" aria-hidden="true"><IRupee /></span>
          </div>
          <span className="m-figure__value">{fmtRs(lifetimeSpend)}</span>
          <span className="m-figure__note">Member since {user.since}</span>
        </div>
      </section>

      {/* ── Records: orders / subscriptions / addresses / profile ────────── */}
      <section className="m-card m-card--roomy acct-record" aria-label="Your records">
        <div className="m-tabs acct-tabs" role="tablist" aria-label="Account records" onKeyDown={onTabKeyDown}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`acct-tab-${t.key}`}
              aria-selected={tab === t.key}
              aria-controls={`acct-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              className="m-tab"
              onClick={() => setTab(t.key)}
              ref={(el) => {
                tabRefs.current[t.key] = el
              }}
            >
              {t.label}
              {counts[t.key] !== null && <span className="acct-tab__count m-num">{counts[t.key]}</span>}
            </button>
          ))}
        </div>

        <div
          className="acct-panel"
          role="tabpanel"
          id={`acct-panel-${tab}`}
          aria-labelledby={`acct-tab-${tab}`}
          tabIndex={0}
        >
          {tab === 'orders' && <OrdersPanel orders={orders} />}
          {tab === 'subscriptions' && <SubscriptionsPanel subscriptions={subscriptions} notify={notify} />}
          {tab === 'addresses' && (
            <AddressesPanel
              addresses={addresses}
              mutate={mutate}
              onAdd={() => setAddressSheet({ address: null })}
              onEdit={(address) => setAddressSheet({ address })}
            />
          )}
          {tab === 'profile' && (
            <ProfilePanel
              user={user}
              notify={notify}
              onEdit={(focus) => setProfileSheet({ focus })}
            />
          )}
        </div>
      </section>

      {/* ── Spend ────────────────────────────────────────────────────────── */}
      <section className="m-card acct-spend" aria-label="Your spend">
        <div className="m-card__head">
          <div>
            <h2 className="m-h3">Your spend</h2>
            <p>Last six months</p>
          </div>
        </div>
        {spendTrend.hasData ? (
          <div className="acct-spend__chart">
            <AreaChart
              labels={spendTrend.labels}
              // --forest-2 as a literal: the chart takes a colour string and
              // cannot read a CSS custom property.
              series={[{ name: 'Spend', color: '#563184', points: spendTrend.values }]}
              height={210}
              yFormat={fmtRs}
              // The axis has ~50px per label: "Rs.12,000" is wider than that and
              // painted off the card at 360px. The tooltip keeps the exact rupee
              // figure, which is the only place it appears at all.
              yAxisFormat={fmtRsK}
            />
          </div>
        ) : (
          <div className="m-empty">
            <span className="m-empty__art" aria-hidden="true"><ITrend /></span>
            <h3 className="m-h3">Nothing to chart yet</h3>
            <p>Your spending will chart here after your first order.</p>
            <Link className="btn btn-ghost" to="/#products">Browse products</Link>
          </div>
        )}
      </section>

      {/* ── Rewards (the /account#rewards target in the member sub-nav) ──── */}
      <section id="rewards" className="acct-anchor" aria-label="Femi9 Rewards">
        <Rewards
          pointsBalance={pointsBalance}
          rewardOptions={rewardOptions}
          activity={activity}
          coupons={coupons}
          earnRates={earnRates}
        />
      </section>

      {/* ── Closing band — the one gold CTA on the page ──────────────────── */}
      <section className="m-band acct-band">
        <span className="eyebrow">Femi9 essentials</span>
        <h2 className="m-h2">Stocked up for your next cycle?</h2>
        <p>
          Organic cotton, a breathable top sheet, and a refill plan you can pause, skip or cancel
          whenever your month changes shape.
        </p>
        <div className="m-band__actions">
          <Link className="btn btn-primary" to="/#products">Shop the range</Link>
          <Link className="btn btn-on-forest" to="/dashboard">Track your cycle</Link>
        </div>
        {/* Gated, not CSS-hidden: the source is 1.7 MB at 1346px for a ~300px
            slot, and it only ever renders above 620px. OptImg serves the ladder
            to the tablets that do show it. */}
        {showBandArt && (
          <OptImg className="m-band__art" base="figma-home/products-imgFrame206" sizes="300px" alt="" />
        )}
      </section>

      {profileSheet && (
        <ProfileSheet
          user={user}
          focus={profileSheet.focus}
          notify={notify}
          onClose={() => setProfileSheet(null)}
        />
      )}
      {addressSheet && (
        <AddressSheet
          address={addressSheet.address}
          defaultName={user.name ?? ''}
          defaultPhone={user.phone ?? ''}
          notify={notify}
          onClose={() => setAddressSheet(null)}
        />
      )}
    </MemberLayout>
  )
}

// ── Orders ───────────────────────────────────────────────────────────────────

function OrdersPanel({ orders }: { orders: AccountOrder[] }) {
  const { add, openCart } = useCart()
  const [reordering, setReordering] = useState<string | null>(null)

  async function buyAgain(order: AccountOrder) {
    const lines = order.items.filter((i) => i.variantId)
    if (lines.length === 0 || reordering) return
    setReordering(order.id)
    try {
      // Sequential on purpose: the cart API returns the whole cart each time and
      // parallel writes would race each other's snapshot.
      for (const line of lines) await add(line.variantId, line.qty)
      openCart()
    } finally {
      setReordering(null)
    }
  }

  if (orders.length === 0) {
    return (
      <div className="m-empty">
        <OptImg className="m-empty__photo" base="img/prod-330-double" sizes="132px" alt="" />
        <h3 className="m-h3">No orders yet</h3>
        <p>Every Femi9 order lands here with its items, its total and where it has reached.</p>
        <Link className="btn btn-ghost" to="/#products">Shop the range</Link>
      </div>
    )
  }

  return (
    <div className="m-list acct-orders">
      <div className="m-list__head">
        <span aria-hidden="true" />
        <span>Order</span>
        <span>Total</span>
      </div>
      {orders.map((order) => {
        const canReorder = order.items.some((i) => i.variantId)
        const summary = order.items.map((i) => `${i.name} ×${i.qty}`).join(', ')
        return (
          <div className="m-row acct-order" key={order.id}>
            <span className="m-row__media" aria-hidden="true"><IBox /></span>
            <div className="m-row__main">
              <Link className="m-row__title acct-order__link" to={order.href}>
                {order.id}
              </Link>
              <p className="m-row__meta">
                <span className="m-num">{order.date}</span>
                {summary && <> · {summary}</>}
              </p>
              {canReorder && (
                <div className="acct-order__actions">
                  <button
                    type="button"
                    className="m-linkbtn"
                    onClick={() => void buyAgain(order)}
                    disabled={reordering !== null}
                  >
                    {reordering === order.id ? 'Adding…' : 'Buy again'}
                  </button>
                </div>
              )}
            </div>
            <div className="m-row__end acct-order__end">
              <span className="m-row__amount m-num">{fmtRs(order.total)}</span>
              <span className={`m-status m-status--${ORDER_TONE[order.statusKey]}`}>{order.status}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Subscriptions ────────────────────────────────────────────────────────────

type SubAction = 'pause' | 'resume' | 'skip' | 'cancel'

/** The three fields a PATCH can move. Held per id while the request settles. */
interface SubPatch {
  status: SubStatus
  nextDelivery: string
  saved: number
}

function SubscriptionsPanel({
  subscriptions,
  notify,
}: {
  subscriptions: AccountSubscription[]
  notify: (msg: string) => void
}) {
  const router = useRouter()
  // Optimistic view, held ONLY between the PATCH response and the server
  // re-render. A new `subscriptions` array means /account re-rendered against
  // fresh DB rows, so the local copy is dropped and server truth wins — this is
  // what the old `useState('active')` seeding got wrong.
  const [patches, setPatches] = useState<Record<string, SubPatch>>({})
  useEffect(() => {
    setPatches({})
  }, [subscriptions])

  if (subscriptions.length === 0) {
    return (
      <div className="m-empty">
        <span className="m-empty__art" aria-hidden="true"><IGift /></span>
        <h3 className="m-h3">No refill plan yet</h3>
        <p>Subscribe from any product page to have your pads arrive before you need them, and save on every repeat delivery.</p>
        <Link className="btn btn-ghost" to="/#products">Browse products</Link>
      </div>
    )
  }

  return (
    <div className="acct-cards">
      {subscriptions.map((sub) => (
        <SubscriptionCard
          key={sub.id}
          sub={{ ...sub, ...(patches[sub.id] ?? {}) }}
          notify={notify}
          onApplied={(patch) => {
            setPatches((prev) => ({ ...prev, [sub.id]: patch }))
            router.refresh()
          }}
        />
      ))}
    </div>
  )
}

function SubscriptionCard({
  sub,
  notify,
  onApplied,
}: {
  sub: AccountSubscription
  notify: (msg: string) => void
  onApplied: (patch: SubPatch) => void
}) {
  const [busy, setBusy] = useState<SubAction | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: SubAction) {
    if (busy) return
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        setError((await readFailure(res)).message)
        return
      }
      const data = (await res.json().catch(() => null)) as { subscription?: SubPatch } | null
      if (data?.subscription) onApplied(data.subscription)
      setConfirming(false)
      notify(
        action === 'pause'
          ? 'Subscription paused'
          : action === 'resume'
            ? 'Subscription resumed'
            : action === 'skip'
              ? 'Next delivery skipped'
              : 'Subscription cancelled',
      )
    } catch {
      setError('We could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  const cancelled = sub.status === 'cancelled'

  return (
    <article className="m-card acct-sub">
      <div className="m-card__head">
        <div>
          <h3 className="m-h3">{sub.product}</h3>
          <p>
            {sub.qty} {sub.qty === 1 ? 'pack' : 'packs'} · {sub.frequency}
          </p>
        </div>
        <span className={`m-status m-status--${SUB_TONE[sub.status]}`}>{SUB_LABEL[sub.status]}</span>
      </div>

      {!cancelled && (
        <div className="m-kv">
          <div className="m-kv__row">
            <span className="m-kv__k">Next delivery</span>
            <span className="m-kv__v m-num">{sub.nextDelivery}</span>
          </div>
          <div className="m-kv__row">
            <span className="m-kv__k">Saved so far</span>
            <span className="m-kv__v m-num">{fmtRs(sub.saved)}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="m-field__error" role="alert">
          <IAlert aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {cancelled ? (
        <div className="m-card__foot">
          <p className="m-cap">This plan is cancelled. You can start a new one from any product page.</p>
          <Link className="m-linkbtn" to="/#products">
            <span>Subscribe again</span>
            <IChevron aria-hidden="true" />
          </Link>
        </div>
      ) : confirming ? (
        <div className="m-confirm" role="group" aria-label="Confirm cancellation">
          <span>Cancel this subscription?</span>
          <span className="m-confirm__actions">
            <button type="button" className="m-linkbtn" onClick={() => void run('cancel')} disabled={busy !== null}>
              {busy === 'cancel' ? 'Cancelling…' : 'Yes, cancel'}
            </button>
            <button type="button" className="m-linkbtn" onClick={() => setConfirming(false)} disabled={busy !== null}>
              Keep it
            </button>
          </span>
        </div>
      ) : (
        <div className="m-card__foot acct-sub__actions">
          {sub.status === 'active' ? (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void run('pause')} disabled={busy !== null}>
                {busy === 'pause' ? 'Pausing…' : 'Pause'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => void run('skip')} disabled={busy !== null}>
                {busy === 'skip' ? 'Skipping…' : 'Skip next'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => void run('resume')} disabled={busy !== null}>
              {busy === 'resume' ? 'Resuming…' : 'Resume'}
            </button>
          )}
          <button
            type="button"
            className="m-linkbtn acct-sub__cancel"
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
          >
            Cancel plan
          </button>
        </div>
      )}
    </article>
  )
}

// ── Addresses ────────────────────────────────────────────────────────────────

function AddressesPanel({
  addresses,
  mutate,
  onAdd,
  onEdit,
}: {
  addresses: AccountAddress[]
  mutate: (url: string, init: RequestInit) => Promise<boolean>
  onAdd: () => void
  onEdit: (address: AccountAddress) => void
}) {
  return (
    <>
      <div className="acct-panel__head">
        <div>
          <h2 className="m-h3">Saved addresses</h2>
          <p className="m-cap">Where your Femi9 orders are delivered.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onAdd}>
          Add address
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="m-empty">
          <span className="m-empty__art" aria-hidden="true"><IPin /></span>
          <h3 className="m-h3">No addresses saved</h3>
          <p>Add one now and checkout will be a single tap next time.</p>
          <button type="button" className="btn btn-ghost" onClick={onAdd}>
            Add your first address
          </button>
        </div>
      ) : (
        <div className="acct-cards">
          {addresses.map((address) => (
            <AddressCard key={address.id} address={address} mutate={mutate} onEdit={() => onEdit(address)} />
          ))}
        </div>
      )}
    </>
  )
}

function AddressCard({
  address,
  mutate,
  onEdit,
}: {
  address: AccountAddress
  mutate: (url: string, init: RequestInit) => Promise<boolean>
  onEdit: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  async function remove() {
    setBusy(true)
    // Deleting is always allowed now: an address attached to an order is archived
    // rather than dropped, so the order's own record stays intact.
    await mutate(`/api/account/addresses/${address.id}`, { method: 'DELETE' })
    setBusy(false)
    setConfirming(false)
  }

  async function makeDefault() {
    setBusy(true)
    await mutate(`/api/account/addresses/${address.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPrimary: true }),
    })
    setBusy(false)
  }

  return (
    <article className={`m-card acct-addr${address.primary ? ' is-default' : ''}`}>
      <div className="m-card__head">
        <div className="acct-addr__tags">
          <span className="m-chip">{address.label}</span>
          {address.primary && (
            <span className="m-chip m-chip--gold">
              <ICheck aria-hidden="true" />
              Default
            </span>
          )}
        </div>
        <div className="m-card__head-end">
          <button
            type="button"
            className="m-iconbtn"
            onClick={onEdit}
            disabled={busy}
            aria-label={`Edit the ${address.label} address`}
          >
            <IPencil aria-hidden="true" />
          </button>
          <button
            type="button"
            className="m-iconbtn m-iconbtn--danger"
            onClick={() => setConfirming(true)}
            disabled={busy}
            aria-label={`Delete the ${address.label} address`}
          >
            <ITrash aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="acct-addr__body">
        <p className="acct-addr__name">{address.name}</p>
        <p className="m-cap">{address.line}</p>
        <p className="m-cap">{address.city}</p>
        <p className="m-cap m-num">{address.phone}</p>
      </div>

      {confirming ? (
        <div className="m-confirm" role="group" aria-label="Confirm deletion">
          <span>Delete this address?</span>
          <span className="m-confirm__actions">
            <button type="button" className="m-linkbtn" onClick={() => void remove()} disabled={busy}>
              {busy ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button type="button" className="m-linkbtn" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
          </span>
        </div>
      ) : (
        !address.primary && (
          <div className="m-card__foot">
            <button type="button" className="m-linkbtn" onClick={() => void makeDefault()} disabled={busy}>
              Make this my default
            </button>
          </div>
        )
      )}
    </article>
  )
}

// ── Profile ──────────────────────────────────────────────────────────────────

function ProfilePanel({
  user,
  notify,
  onEdit,
}: {
  user: AccountUser
  notify: (msg: string) => void
  onEdit: (focus?: 'name' | 'email' | 'phone') => void
}) {
  const [verifying, setVerifying] = useState(false)

  /** Re-send the email verification link. Real endpoint, real feedback. */
  async function verifyEmail() {
    if (!user.email || verifying) return
    setVerifying(true)
    try {
      const res = await fetch('/api/account/email/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      notify(res.ok ? 'Verification link sent - check your inbox.' : (await readFailure(res)).message)
    } catch {
      notify('We could not reach the server. Check your connection and try again.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <div className="acct-panel__head">
        <div>
          <h2 className="m-h3">Profile details</h2>
          <p className="m-cap">What we call you, and how we reach you about an order.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => onEdit()}>
          Edit details
        </button>
      </div>

      <div className="m-kv">
        <div className="m-kv__row">
          <span className="m-kv__k">Full name</span>
          <span className="m-kv__v">
            {user.name ? (
              user.name
            ) : (
              <button type="button" className="m-linkbtn" onClick={() => onEdit('name')}>
                Add your name
              </button>
            )}
          </span>
        </div>

        <div className="m-kv__row">
          <span className="m-kv__k">Email</span>
          <span className="m-kv__v">
            {user.email ? (
              <>
                {user.email}
                {user.emailVerified ? (
                  <span className="m-status m-status--success">
                    <ICheck aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <>
                    <span className="m-chip m-chip--quiet">Unverified</span>
                    <button type="button" className="m-linkbtn" onClick={() => void verifyEmail()} disabled={verifying}>
                      {verifying ? 'Sending…' : 'Send verification link'}
                    </button>
                  </>
                )}
              </>
            ) : (
              <button type="button" className="m-linkbtn" onClick={() => onEdit('email')}>
                Add your email
              </button>
            )}
          </span>
        </div>

        <div className="m-kv__row">
          <span className="m-kv__k">Mobile</span>
          <span className="m-kv__v">
            {user.phoneDisplay ? (
              <>
                <span className="m-num">{user.phoneDisplay}</span>
                {user.phoneVerified ? (
                  <span className="m-status m-status--success">
                    <ICheck aria-hidden="true" />
                    Verified
                  </span>
                ) : (
                  <button type="button" className="m-linkbtn" onClick={() => onEdit('phone')}>
                    Verify this number
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="m-linkbtn" onClick={() => onEdit('phone')}>
                Add your mobile
              </button>
            )}
          </span>
        </div>

        <div className="m-kv__row">
          <span className="m-kv__k">Member since</span>
          <span className="m-kv__v">{user.since}</span>
        </div>
      </div>
    </>
  )
}

// ── Edit-profile dialog ──────────────────────────────────────────────────────

function ProfileSheet({
  user,
  focus,
  notify,
  onClose,
}: {
  user: AccountUser
  focus?: 'name' | 'email' | 'phone'
  notify: (msg: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  // The dialog always opens on the details form; the code step only exists once
  // a mobile-number change has actually triggered an OTP challenge.
  const [step, setStep] = useState<'details' | 'code'>('details')

  const [name, setName] = useState(user.name ?? '')
  const [email, setEmail] = useState(user.email ?? '')
  const [phone, setPhone] = useState(digitsOf(user.phone))
  const [code, setCode] = useState('')

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [conflictField, setConflictField] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingPhone, setPendingPhone] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const nameRef = useRef<HTMLInputElement | null>(null)
  const emailRef = useRef<HTMLInputElement | null>(null)
  const phoneRef = useRef<HTMLInputElement | null>(null)
  const codeRef = useRef<HTMLInputElement | null>(null)
  const initialFocus = focus === 'email' ? emailRef : focus === 'phone' ? phoneRef : focus === 'name' ? nameRef : undefined

  // Resend cooldown — one second at a time, cleared when it reaches zero.
  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  // When the code step opens, put the caret in the code box.
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus()
  }, [step])

  function applyFailure(failure: ApiFailure, fallbackField?: string) {
    const fields = { ...failure.fieldErrors }
    if (Object.keys(fields).length === 0 && fallbackField) fields[fallbackField] = failure.message
    setErrors(fields)
    setConflictField(failure.code === 'identity_conflict' ? (failure.field ?? null) : null)
    setFormError(Object.keys(fields).length === 0 ? failure.message : null)
  }

  async function submitDetails(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const nextName = name.trim()
    const nextEmail = email.trim().toLowerCase()
    const nextPhone = digitsOf(phone)

    // Client-side validation mirrors the server's zod schema exactly, so a
    // correct form never round-trips to be told it is wrong.
    const found: Record<string, string> = {}
    if (nextName.length < 2 || nextName.length > 120) found.name = 'Enter your full name (2–120 characters).'
    if (!nextEmail) found.email = 'Enter your email address.'
    else if (!EMAIL_RE.test(nextEmail)) found.email = 'Enter a valid email address.'
    if (nextPhone.length !== 10) found.phone = 'Enter your 10-digit mobile number.'
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setConflictField(null)
      setFormError(null)
      const first = found.name ? nameRef : found.email ? emailRef : phoneRef
      first.current?.focus()
      return
    }

    const patch: Record<string, string> = {}
    if (nextName !== (user.name ?? '')) patch.name = nextName
    if (nextEmail !== (user.email ?? '')) patch.email = nextEmail
    // The mobile number is never written by a PATCH — it reaches a customer's
    // orders, so it only changes behind a real OTP challenge.
    const phoneChanged = nextPhone !== digitsOf(user.phone)

    if (Object.keys(patch).length === 0 && !phoneChanged) {
      onClose()
      return
    }

    setSaving(true)
    setErrors({})
    setConflictField(null)
    setFormError(null)
    try {
      if (Object.keys(patch).length > 0) {
        const res = await fetch('/api/account/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        })
        if (!res.ok) {
          applyFailure(await readFailure(res))
          return
        }
      }

      if (phoneChanged) {
        const res = await fetch('/api/account/phone/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone: nextPhone }),
        })
        if (!res.ok) {
          applyFailure(await readFailure(res), 'phone')
          return
        }
        // Whatever the name/email step already saved is real — commit it before
        // the challenge, so abandoning the code step never loses that work.
        router.refresh()
        setPendingPhone(nextPhone)
        setCode('')
        setCooldown(30)
        setStep('code')
        return
      }

      notify('Profile updated')
      router.refresh()
      onClose()
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const digits = code.replace(/\D/g, '')
    if (digits.length !== 6) {
      setErrors({ code: 'Enter the 6-digit code we sent you.' })
      codeRef.current?.focus()
      return
    }
    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const res = await fetch('/api/account/phone/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: pendingPhone, code: digits }),
      })
      if (!res.ok) {
        applyFailure(await readFailure(res), 'code')
        codeRef.current?.focus()
        return
      }
      notify('Mobile number verified')
      router.refresh()
      onClose()
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function resend() {
    if (cooldown > 0 || saving) return
    setSaving(true)
    setErrors({})
    try {
      const res = await fetch('/api/account/phone/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: pendingPhone }),
      })
      if (!res.ok) {
        applyFailure(await readFailure(res), 'code')
        return
      }
      setCooldown(30)
      notify('Code sent again')
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const conflictLink = (field: string) =>
    conflictField === field ? (
      <>
        {' '}
        <Link to="/login">Sign in with it instead</Link>
      </>
    ) : null

  return (
    <Sheet
      onClose={onClose}
      title={step === 'code' ? 'Confirm your mobile number' : 'Edit your details'}
      description={
        step === 'code'
          ? `We sent a 6-digit code to +91 ${pendingPhone.slice(0, 5)} ${pendingPhone.slice(5)}.`
          : 'Your name is how we greet you; your email and mobile are how we reach you about an order.'
      }
      initialFocus={initialFocus}
    >
      {step === 'details' ? (
        <form className="m-form" onSubmit={submitDetails} noValidate>
          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-name">Full name</label>
            <input
              id="acct-name"
              ref={nameRef}
              className="m-input"
              type="text"
              autoComplete="name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? 'acct-name-err' : undefined}
              disabled={saving}
            />
            {errors.name && <FieldError id="acct-name-err">{errors.name}</FieldError>}
          </div>

          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-email">Email address</label>
            <input
              id="acct-email"
              ref={emailRef}
              className="m-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={errors.email ? 'true' : undefined}
              aria-describedby={errors.email ? 'acct-email-err' : undefined}
              disabled={saving}
            />
            {errors.email && (
              <FieldError id="acct-email-err">
                {errors.email}
                {conflictLink('email')}
              </FieldError>
            )}
          </div>

          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-phone">Mobile number</label>
            <input
              id="acct-phone"
              ref={phoneRef}
              className="m-input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={errors.phone ? 'acct-phone-err' : 'acct-phone-hint'}
              disabled={saving}
            />
            <p className="m-field__hint" id="acct-phone-hint">
              Changing this sends a 6-digit code to the new number before we save it.
            </p>
            {errors.phone && (
              <FieldError id="acct-phone-err">
                {errors.phone}
                {conflictLink('phone')}
              </FieldError>
            )}
          </div>

          {formError && (
            <p className="m-field__error" role="alert">
              <IAlert aria-hidden="true" />
              <span>{formError}</span>
            </p>
          )}

          <div className="m-sheet__foot">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <form className="m-form" onSubmit={submitCode} noValidate>
          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-code">6-digit code</label>
            <input
              id="acct-code"
              ref={codeRef}
              className="m-input acct-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={errors.code ? 'true' : undefined}
              aria-describedby={errors.code ? 'acct-code-err' : undefined}
              disabled={saving}
            />
            {errors.code && <FieldError id="acct-code-err">{errors.code}</FieldError>}
          </div>

          <div className="acct-code__actions">
            <button type="button" className="m-linkbtn" onClick={() => void resend()} disabled={cooldown > 0 || saving}>
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
            <button
              type="button"
              className="m-linkbtn"
              onClick={() => {
                setStep('details')
                setErrors({})
                setFormError(null)
              }}
              disabled={saving}
            >
              Change number
            </button>
          </div>

          {formError && (
            <p className="m-field__error" role="alert">
              <IAlert aria-hidden="true" />
              <span>{formError}</span>
            </p>
          )}

          <div className="m-sheet__foot">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Verifying…' : 'Verify number'}
            </button>
          </div>
        </form>
      )}
    </Sheet>
  )
}

// ── Add / edit address dialog ────────────────────────────────────────────────

const PRESET_LABELS = ['Home', 'Work', 'Other'] as const

function AddressSheet({
  address,
  defaultName,
  defaultPhone,
  notify,
  onClose,
}: {
  address: AccountAddress | null
  defaultName: string
  defaultPhone: string
  notify: (msg: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const editing = address !== null
  const preset = address ? (PRESET_LABELS as readonly string[]).includes(address.label) : true

  const [labelChoice, setLabelChoice] = useState<string>(address ? (preset ? address.label : 'Other') : 'Home')
  const [customLabel, setCustomLabel] = useState(address && !preset ? address.label : '')
  const [name, setName] = useState(address?.name ?? defaultName)
  const [line, setLine] = useState(address?.line ?? '')
  // cityRaw / state / pincode are the raw columns, so the form prefills without
  // having to re-parse the composed "City, State 641001" display line.
  const [city, setCity] = useState(address?.cityRaw ?? '')
  const [state, setState] = useState(address?.state ?? '')
  const [pincode, setPincode] = useState(address?.pincode ?? '')
  const [phone, setPhone] = useState(digitsOf(address?.phone ?? defaultPhone))
  // Unchecking "default" would leave the account with no default at all, so the
  // control simply does not exist for an address that is already the default —
  // you promote a different one instead.
  const alreadyDefault = address?.primary === true
  const [isPrimary, setIsPrimary] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Legacy rows can carry a free-text state that predates this picker. Keeping
  // it as an option means editing an address never silently drops it.
  const stateOptions = useMemo(() => {
    const list: string[] = [...INDIA_STATES]
    const current = address?.state?.trim()
    if (current && !list.includes(current)) list.unshift(current)
    return list
  }, [address])

  const labelRef = useRef<HTMLInputElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const lineRef = useRef<HTMLTextAreaElement | null>(null)
  const cityRef = useRef<HTMLInputElement | null>(null)
  const pinRef = useRef<HTMLInputElement | null>(null)
  const phoneRef = useRef<HTMLInputElement | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return

    const label = (labelChoice === 'Other' ? customLabel : labelChoice).trim()
    const payload = {
      label,
      name: name.trim(),
      line: line.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      phone: digitsOf(phone),
      ...(alreadyDefault ? {} : { isPrimary }),
    }

    // Mirrors the route's zod schema so nothing the customer typed is lost to a
    // round-trip — and nothing they typed is ever discarded on failure either.
    const found: Record<string, string> = {}
    if (!payload.label || payload.label.length > 40) found.label = 'Give this address a short name (up to 40 characters).'
    if (payload.name.length < 2 || payload.name.length > 120) found.name = "Enter the recipient's full name."
    if (payload.line.length < 3 || payload.line.length > 300) found.line = 'Enter the house or flat, street and area.'
    if (payload.city.length < 2 || payload.city.length > 120) found.city = 'Enter the city or town.'
    if (payload.pincode && !/^\d{6}$/.test(payload.pincode)) found.pincode = 'A pincode is exactly 6 digits.'
    if (payload.phone && payload.phone.length !== 10) found.phone = 'A mobile number is exactly 10 digits.'
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setFormError(null)
      const first = found.label
        ? labelRef
        : found.name
          ? nameRef
          : found.line
            ? lineRef
            : found.city
              ? cityRef
              : found.pincode
                ? pinRef
                : phoneRef
      first.current?.focus()
      return
    }

    setSaving(true)
    setErrors({})
    setFormError(null)
    try {
      const res = await fetch(
        address ? `/api/account/addresses/${address.id}` : '/api/account/addresses',
        {
          method: address ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      if (!res.ok) {
        const failure = await readFailure(res)
        setErrors(failure.fieldErrors)
        setFormError(Object.keys(failure.fieldErrors).length === 0 ? failure.message : null)
        return
      }
      notify(editing ? 'Address updated' : 'Address saved')
      router.refresh()
      onClose()
    } catch {
      setFormError('We could not reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      onClose={onClose}
      wide
      title={editing ? 'Edit address' : 'Add a delivery address'}
      description="Every field is on this one screen - nothing you type is lost if something needs fixing."
    >
      <form className="m-form" onSubmit={submit} noValidate>
        <div className="m-field">
          <span className="m-field__label" id="acct-label-legend">Label</span>
          <div className="acct-chips" role="group" aria-labelledby="acct-label-legend">
            {PRESET_LABELS.map((option) => (
              <Chip
                key={option}
                selected={labelChoice === option}
                onClick={() => setLabelChoice(option)}
                disabled={saving}
              >
                {option}
              </Chip>
            ))}
          </div>
          {labelChoice === 'Other' && (
            <input
              ref={labelRef}
              className="m-input"
              type="text"
              value={customLabel}
              maxLength={40}
              placeholder="Mum's place, hostel, studio…"
              aria-label="Custom address label"
              onChange={(e) => setCustomLabel(e.target.value)}
              aria-invalid={errors.label ? 'true' : undefined}
              aria-describedby={errors.label ? 'acct-label-err' : undefined}
              disabled={saving}
            />
          )}
          {errors.label && <FieldError id="acct-label-err">{errors.label}</FieldError>}
        </div>

        <div className="m-field">
          <label className="m-field__label" htmlFor="acct-addr-name">Recipient name</label>
          <input
            id="acct-addr-name"
            ref={nameRef}
            className="m-input"
            type="text"
            autoComplete="name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={errors.name ? 'true' : undefined}
            aria-describedby={errors.name ? 'acct-addr-name-err' : undefined}
            disabled={saving}
          />
          {errors.name && <FieldError id="acct-addr-name-err">{errors.name}</FieldError>}
        </div>

        <div className="m-field">
          <label className="m-field__label" htmlFor="acct-line">House / flat, street and area</label>
          <textarea
            id="acct-line"
            ref={lineRef}
            className="m-textarea"
            autoComplete="street-address"
            value={line}
            maxLength={300}
            onChange={(e) => setLine(e.target.value)}
            aria-invalid={errors.line ? 'true' : undefined}
            aria-describedby={errors.line ? 'acct-line-err' : undefined}
            disabled={saving}
          />
          {errors.line && <FieldError id="acct-line-err">{errors.line}</FieldError>}
        </div>

        <div className="m-form__grid">
          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-city">City</label>
            <input
              id="acct-city"
              ref={cityRef}
              className="m-input"
              type="text"
              autoComplete="address-level2"
              value={city}
              maxLength={120}
              onChange={(e) => setCity(e.target.value)}
              aria-invalid={errors.city ? 'true' : undefined}
              aria-describedby={errors.city ? 'acct-city-err' : undefined}
              disabled={saving}
            />
            {errors.city && <FieldError id="acct-city-err">{errors.city}</FieldError>}
          </div>

          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-state">
              State <span>(optional)</span>
            </label>
            <select
              id="acct-state"
              className="m-select"
              value={state}
              onChange={(e) => setState(e.target.value)}
              disabled={saving}
            >
              <option value="">Select a state</option>
              {stateOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-pincode">
              Pincode <span>(optional)</span>
            </label>
            <input
              id="acct-pincode"
              ref={pinRef}
              className="m-input m-num"
              type="text"
              inputMode="numeric"
              autoComplete="postal-code"
              value={pincode}
              maxLength={6}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={errors.pincode ? 'true' : undefined}
              aria-describedby={errors.pincode ? 'acct-pincode-err' : undefined}
              disabled={saving}
            />
            {errors.pincode && <FieldError id="acct-pincode-err">{errors.pincode}</FieldError>}
          </div>

          <div className="m-field">
            <label className="m-field__label" htmlFor="acct-addr-phone">
              Delivery phone <span>(optional)</span>
            </label>
            <input
              id="acct-addr-phone"
              ref={phoneRef}
              className="m-input m-num"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              maxLength={10}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={errors.phone ? 'acct-addr-phone-err' : undefined}
              disabled={saving}
            />
            {errors.phone && <FieldError id="acct-addr-phone-err">{errors.phone}</FieldError>}
          </div>
        </div>

        {alreadyDefault ? (
          <p className="m-cap">This is your default delivery address.</p>
        ) : (
          <label className="acct-check">
            <input
              type="checkbox"
              checked={isPrimary}
              onChange={(e) => setIsPrimary(e.target.checked)}
              disabled={saving}
            />
            <span>Deliver here by default</span>
          </label>
        )}

        {formError && (
          <p className="m-field__error" role="alert">
            <IAlert aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}

        <div className="m-sheet__foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save address' : 'Add address'}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
