'use client'

/**
 * /dashboard — the member's cycle home.
 *
 * This screen used to render `<Shell variant="user">`, which was the ADMIN
 * console's chrome: a left sidebar, an "Admin dashboard" link, a "Guest — Not
 * signed in" flash, and two permanently disabled topbar buttons. It now renders
 * `<MemberLayout>` and builds entirely from the `.m-*` kit in member.css plus
 * its own `.dash-*` layout — no `panel`, no `col-*`, no `dtable`, no `badge`.
 *
 * Everything here is driven by the user's real rows. There is no fabricated
 * product, no invented cycle history, and no copy that claims a save happened
 * unless the request actually returned 2xx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link } from '@/lib/router-compat'
import { MemberLayout } from '@/components/MemberLayout'
import { Chip } from '@/components/Chip'
import { OptImg } from '@/components/OptImg'
import { useMediaGate } from '@/components/useMediaGate'
import { useCart } from '@/store/cart'
import {
  IAlert,
  IBox,
  ICheck,
  IChevron,
  ICycle,
  IGift,
  IInfo,
  ILeaf,
  IPencil,
  IPin,
  ISparkles,
  ITrash,
  ITrend,
} from '@/components/AppIcons'
import {
  PHASE_HINT,
  PHASE_LABEL,
  addDaysKey,
  clampPeriod,
  dateFromKey,
  daysBetweenKeys,
  isDayKey,
  keyFromDate,
  localDayKey,
  phaseForDayKey,
  type CyclePhase,
} from '@/lib/cycle-math'
import type { AccountOrder, AccountSubscription, AccountUser } from '@/lib/services/account'
import type { CycleData, PeriodEntry, SymptomEntry } from '@/lib/services/cycle'

export interface UserDashboardProps extends CycleData {
  /** The SAME identity /account renders. Not a bare `userName` string. */
  user: AccountUser
  pointsBalance: number
  /** The three most recent orders — /account owns the full history. */
  orders: AccountOrder[]
  subscriptions: AccountSubscription[]
}

/* ── Vocabulary ─────────────────────────────────────────────────────────────
 * A real symptom set, not the six-label stub this screen used to ship. Flow is
 * separate because it is the one observation a period tracker must record, and
 * it deserves its own scale rather than a generic 0-3 intensity. */

const SYMPTOMS = [
  'Cramps',
  'Headache',
  'Backache',
  'Bloating',
  'Nausea',
  'Fatigue',
  'Mood swings',
  'Anxiety',
  'Acne',
  'Breast tenderness',
  'Cravings',
  'Sleep trouble',
] as const

/** Stored as a symptom named "Flow" so it shares the encrypted SymptomLog row
 *  shape; the level is the scale index, which is why the labels live here. */
const FLOW_SYMPTOM = 'Flow'
const FLOW_LEVELS = ['Spotting', 'Light', 'Medium', 'Heavy'] as const
const INTENSITY_LEVELS = ['None', 'Mild', 'Moderate', 'Strong'] as const

const levelLabel = (symptom: string, level: number) => {
  const scale = symptom === FLOW_SYMPTOM ? FLOW_LEVELS : INTENSITY_LEVELS
  return scale[Math.min(scale.length - 1, Math.max(0, level))]
}

/** localStorage key the landing tracker writes a signed-out visitor's dates to. */
const GUEST_TRACKER_KEY = 'femi9.cycle.guest'

/* ── Request helper ─────────────────────────────────────────────────────────
 * Every cycle write goes through this so failures are handled identically:
 * we never assume success, we surface the server's own message, and a consent
 * refusal is recognisable to the caller so the gate can be re-shown. */

interface ApiFailure {
  status: number
  message: string
  code?: string
  consentRequired: boolean
}

type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: ApiFailure }

async function callApi<T = Record<string, unknown>>(
  url: string,
  init: { method: string; body?: unknown },
): Promise<ApiResult<T>> {
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method,
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch {
    return {
      ok: false,
      error: { status: 0, message: 'We could not reach Femi9. Check your connection and try again.', consentRequired: false },
    }
  }

  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (!res.ok) {
    const code = typeof payload?.code === 'string' ? payload.code : undefined
    const message =
      (typeof payload?.error === 'string' && payload.error) ||
      (res.status === 401
        ? 'Your session has expired. Sign in again to keep tracking.'
        : res.status === 503
          ? 'Cycle tracking is temporarily unavailable. Please try again shortly.'
          : 'We could not save that. Please try again.')
    return {
      ok: false,
      error: { status: res.status, message, code, consentRequired: res.status === 403 || code === 'consent_required' },
    }
  }
  return { ok: true, data: (payload ?? {}) as T }
}

/* ── Small presentational helpers ──────────────────────────────────────────── */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
/** The header row is aria-hidden: each day button already names its own weekday
 *  in full through `fmtFullKey`, so a screen reader gets it without the letters. */
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** "14 Aug 2026" from a day key. UTC getters, because a key is a UTC-midnight day. */
function fmtFullKey(key: string): string {
  return dateFromKey(key).toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
function fmtDayMonth(key: string): string {
  return dateFromKey(key).toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
}

const toneIcon = { good: ICheck, warning: IAlert, info: IInfo } as const

/** Inline status line for a form. Never an alert(); never a silent failure. */
function FormMessage({ tone, children }: { tone: 'ok' | 'err'; children: React.ReactNode }) {
  return (
    <p className={`dash-msg dash-msg--${tone}`} role={tone === 'err' ? 'alert' : 'status'}>
      {tone === 'err' ? <IAlert aria-hidden="true" /> : <ICheck aria-hidden="true" />}
      <span>{children}</span>
    </p>
  )
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function UserDashboard(props: UserDashboardProps) {
  const {
    user,
    consent,
    needsData,
    today,
    timezone,
    prediction,
    upcomingEvents,
    cycleLengthTrend,
    insights,
    symptomLog,
    periods,
    lastOrderedProduct,
    unreadableRows,
    pointsBalance,
    orders,
    subscriptions,
  } = props

  const router = useRouter()
  const { notify } = useCart()

  /**
   * The browser's own calendar day. The server resolves `today` in the store's
   * timezone, which is right for almost everyone but cannot be right for
   * everyone — so every WRITE carries the client's day and the API validates
   * against that with a tolerance. `new Date().toISOString()` would be the UTC
   * day, which in IST is yesterday until 05:30 and is exactly the bug that made
   * the API reject a user's real today.
   */
  const clientToday = useMemo(() => localDayKey(), [])

  /**
   * A write can be refused for consent even when the page was rendered with
   * consent true (another tab withdrew it). When that happens we flip back to
   * the gate rather than leaving the user typing into a form that will not save.
   */
  const [consentRefused, setConsentRefused] = useState(false)
  const gateOpen = !consent || consentRefused

  /** The two decorative Figma exports on this screen are painted only above
   *  their breakpoints (dashboard.css `.dash-onboard__art`, member.css
   *  `.m-band__art`). They are gated out of the JSX rather than hidden in CSS,
   *  because `display: none` still downloads — and why-imgImage22.png is 2.5 MB
   *  that no mobile target ever shows. */
  const showOnboardArt = useMediaGate('(min-width: 781px)')
  const showBandArt = useMediaGate('(min-width: 621px)')

  const onConsentRefusal = useCallback(() => {
    setConsentRefused(true)
    router.refresh()
  }, [router])

  const activeSubscriptions = subscriptions.filter((s) => s.status !== 'cancelled')

  return (
    <MemberLayout
      identity={{
        displayName: user.displayName,
        initials: user.initials,
        tier: user.tier,
        image: user.image,
      }}
      active="cycle"
      title={user.greeting}
      lead={
        needsData
          ? 'Track your cycle privately, and your dashboard will start predicting your next period, fertile window and PMS days.'
          : 'Your cycle, your orders and your Bloom points — all from what you have actually logged.'
      }
      actions={
        <Link to="/account" className="btn btn-ghost">
          Account &amp; orders
        </Link>
      }
    >
      {/* A row we cannot decrypt is skipped, never fatal. Say so plainly rather
          than silently under-reporting a user's history. */}
      {unreadableRows > 0 && (
        <p className="m-note m-note--warning" role="status">
          <IAlert aria-hidden="true" />
          <span>
            We could not read {unreadableRows} entr{unreadableRows === 1 ? 'y' : 'ies'} from your history, so
            {unreadableRows === 1 ? ' it is' : ' they are'} left out of the numbers below. Everything else is
            intact — you can re-log {unreadableRows === 1 ? 'that day' : 'those days'} at any time.
          </span>
        </p>
      )}

      {gateOpen ? (
        <ConsentGate onGranted={() => { setConsentRefused(false); router.refresh() }} notify={notify} />
      ) : (
        <GuestImport clientToday={clientToday} notify={notify} onConsentRefused={onConsentRefusal} />
      )}

      {/* ── Prediction hero, or the first-run invitation ────────────────── */}
      {needsData || gateOpen ? (
        <section className="m-card m-card--roomy dash-onboard" aria-labelledby="dash-onboard-h">
          <div className="dash-onboard__copy">
            <span className="eyebrow">Cycle tracking</span>
            <h2 className="m-h2" id="dash-onboard-h">
              {gateOpen ? 'Turn on tracking to see your predictions' : 'Log your first period'}
            </h2>
            <p className="m-body">
              {gateOpen
                ? 'Once tracking is on, tell us when your last period started and this page fills in with your next date, your fertile window and your PMS days.'
                : 'Tell us when your last period started and we will predict your next one, map your fertile and PMS windows, and keep your calendar in sync — all from your own data, never an average.'}
            </p>
            <ul className="dash-onboard__list">
              <li>
                <ICheck aria-hidden="true" /> Your next period date, refined with every cycle you log
              </li>
              <li>
                <ICheck aria-hidden="true" /> Fertile window, ovulation and PMS days on one calendar
              </li>
              <li>
                <ICheck aria-hidden="true" /> Symptoms and flow, so you can see your own patterns
              </li>
            </ul>
          </div>
          {showOnboardArt && (
            <OptImg
              className="dash-onboard__art"
              base="figma-home/why-imgImage22"
              /* width: min(260px, 34vw) — 34vw only bites below 765px, and the
                 gate above starts at 781px, so this is always exactly 260. */
              sizes="260px"
              alt=""
            />
          )}
        </section>
      ) : (
        <section className="m-card m-card--roomy dash-hero" aria-labelledby="dash-hero-h">
          <div className="dash-hero__copy">
            <span className="eyebrow">Your prediction</span>
            <h2 className="m-h2" id="dash-hero-h">
              {prediction.daysUntilNext === 0
                ? 'Your period is expected today'
                : `Period in ${prediction.daysUntilNext} day${prediction.daysUntilNext === 1 ? '' : 's'}`}
            </h2>
            <p className="m-body">
              Expected around {prediction.nextStartLabel}. You are on day {prediction.cycleDay} of a{' '}
              {prediction.avgCycle}-day cycle, with {prediction.confidence}% confidence from your logged history.
            </p>
            <div className="dash-hero__chips">
              <span className="m-chip m-chip--gold">
                <ICycle aria-hidden="true" /> Next: {prediction.nextStartLabel}
              </span>
              <span className="m-chip">Ovulation {fmtDayMonth(prediction.ovulation)}</span>
              <span className="m-chip m-chip--quiet">
                Fertile {fmtDayMonth(prediction.fertileStart)} – {fmtDayMonth(prediction.fertileEnd)}
              </span>
            </div>
          </div>
          <CycleRing
            cycleDay={prediction.cycleDay}
            avgCycle={prediction.avgCycle}
            confidence={prediction.confidence}
          />
        </section>
      )}

      {/* ── At a glance: points, plan, last order ───────────────────────── */}
      <section aria-labelledby="dash-glance-h" className="m-section">
        <h2 className="m-h2" id="dash-glance-h">
          At a glance
        </h2>
        <div className="m-figures">
          <div className="m-figure">
            <div className="m-figure__top">
              <span className="m-figure__label">Bloom points</span>
              <span className="m-figure__icon">
                <ISparkles aria-hidden="true" />
              </span>
            </div>
            <span className="m-figure__value">{pointsBalance.toLocaleString('en-IN')}</span>
            <span className="m-figure__note">
              <Link className="m-linkbtn" to="/account#rewards">
                Spend them <IChevron aria-hidden="true" />
              </Link>
            </span>
          </div>

          <div className="m-figure">
            <div className="m-figure__top">
              <span className="m-figure__label">Subscription</span>
              <span className="m-figure__icon">
                <IBox aria-hidden="true" />
              </span>
            </div>
            <span className="m-figure__value">{activeSubscriptions.length}</span>
            <span className="m-figure__note">
              {activeSubscriptions.length === 0
                ? 'No plan running yet'
                : `Next delivery ${activeSubscriptions[0].nextDelivery}`}
            </span>
          </div>

          <div className="m-figure">
            <div className="m-figure__top">
              <span className="m-figure__label">Cycles logged</span>
              <span className="m-figure__icon">
                <ITrend aria-hidden="true" />
              </span>
            </div>
            <span className="m-figure__value">{cycleLengthTrend.measured}</span>
            <span className="m-figure__note">
              {cycleLengthTrend.measured < 2
                ? 'Log two periods to measure a cycle'
                : `Average ${prediction.avgCycle} days`}
            </span>
          </div>

          <div className="m-figure">
            <div className="m-figure__top">
              <span className="m-figure__label">Recent orders</span>
              <span className="m-figure__icon">
                <IPin aria-hidden="true" />
              </span>
            </div>
            <span className="m-figure__value">{orders.length}</span>
            <span className="m-figure__note">
              <Link className="m-linkbtn" to="/account">
                View all orders <IChevron aria-hidden="true" />
              </Link>
            </span>
          </div>
        </div>
      </section>

      {/* ── Recent orders + plan ────────────────────────────────────────── */}
      <div className="m-grid">
        <section className="m-card m-span-8" aria-labelledby="dash-orders-h">
          <div className="m-card__head">
            <div>
              <h2 className="m-h3" id="dash-orders-h">
                Recent orders
              </h2>
              <p>Your three most recent. The full history lives on your account.</p>
            </div>
          </div>
          {orders.length === 0 ? (
            <div className="m-empty">
              <OptImg className="m-empty__photo" base="img/prod-330-double" sizes="132px" alt="" />
              <h3 className="m-h3">No orders yet</h3>
              <p>When you order, it will appear here so you can reorder in a tap.</p>
              <Link className="btn btn-ghost" to="/#products">
                Browse products
              </Link>
            </div>
          ) : (
            <div className="m-list" style={{ '--m-cols': 'minmax(0,1fr) auto' } as React.CSSProperties}>
              {orders.map((o) => (
                <Link key={o.id} to={o.href} className="m-row">
                  <span className="m-row__main">
                    <span className="m-row__title">{o.id}</span>
                    <span className="m-row__meta">
                      {o.date} · {o.items.map((it) => `${it.name} ×${it.qty}`).join(', ')}
                    </span>
                  </span>
                  <span className="m-row__end">
                    <span className={`m-status m-status--${statusToneOf(o.statusKey)}`}>{o.status}</span>
                    <span className="m-row__amount">₹{o.total.toLocaleString('en-IN')}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="m-card m-span-4" aria-labelledby="dash-plan-h">
          <div className="m-card__head">
            <div>
              <h2 className="m-h3" id="dash-plan-h">
                Your plan
              </h2>
              <p>Subscriptions at a glance.</p>
            </div>
          </div>
          {activeSubscriptions.length === 0 ? (
            <div className="m-empty">
              <span className="m-empty__art">
                <IBox aria-hidden="true" />
              </span>
              <h3 className="m-h3">No subscription running</h3>
              <p>Subscribe and your pack arrives before your period does.</p>
              <Link className="btn btn-ghost" to="/#products">
                See the packs
              </Link>
            </div>
          ) : (
            <ul className="dash-plan">
              {activeSubscriptions.map((s) => (
                <li key={s.id} className="dash-plan__item">
                  <span className="m-row__title">{s.product}</span>
                  <span className="m-row__meta">
                    {s.frequency} · {s.qty} pack{s.qty === 1 ? '' : 's'} · next {s.nextDelivery}
                  </span>
                  <span className={`m-status m-status--${s.status === 'paused' ? 'warning' : 'active'}`}>
                    {s.status === 'paused' ? 'Paused' : 'Active'}
                  </span>
                </li>
              ))}
              {/* The only <li> in the member area without a display of its own —
                  which, now that the UA's 40px list indent is reset, would paint
                  a bare disc marker outside the card. */}
              <li className="dash-plan__more">
                <Link className="m-linkbtn" to="/account">
                  Manage subscriptions <IChevron aria-hidden="true" />
                </Link>
              </li>
            </ul>
          )}
        </section>
      </div>

      {/* ── Calendar + upcoming ─────────────────────────────────────────── */}
      {!gateOpen && !needsData && (
        <div className="m-grid" id="cycle">
          <section className="m-card m-span-8" aria-labelledby="dash-cal-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-cal-h">
                  Cycle calendar
                </h2>
                <p>Days you logged, and the windows we predict from them.</p>
              </div>
            </div>
            <PhaseCalendar
              today={today}
              prediction={prediction}
              periods={periods}
              symptoms={symptomLog}
              timezone={timezone}
            />
          </section>

          <section className="m-card m-span-4" aria-labelledby="dash-upcoming-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-upcoming-h">
                  What is coming
                </h2>
                <p>Predicted, {prediction.confidence}% confidence.</p>
              </div>
            </div>
            <ul className="dash-upcoming">
              {upcomingEvents.map((e) => (
                <li key={e.label} className="dash-upcoming__item" data-phase={e.phase}>
                  <span className="dash-upcoming__marker" aria-hidden="true" />
                  <span className="dash-upcoming__body">
                    <span className="m-row__title">{e.label}</span>
                    <span className="m-row__meta">
                      {e.range}
                      {e.days > 0 ? ` · in ${e.days} day${e.days === 1 ? '' : 's'}` : e.days === 0 ? ' · today' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {/* ── Logging ─────────────────────────────────────────────────────── */}
      {!gateOpen && (
        <div className="m-grid">
          <section className="m-card m-span-6" aria-labelledby="dash-logp-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-logp-h">
                  {needsData ? 'Log your first period' : 'Log a period'}
                </h2>
                <p>Re-logging the same day corrects it instead of adding a duplicate.</p>
              </div>
            </div>
            <PeriodForm
              maxDate={clientToday}
              defaultLength={prediction.avgPeriod}
              clientToday={clientToday}
              onSaved={() => router.refresh()}
              onConsentRefused={onConsentRefusal}
              notify={notify}
            />
          </section>

          <section className="m-card m-span-6" aria-labelledby="dash-logs-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-logs-h">
                  Log how you feel
                </h2>
                <p>Pick any day, any number of symptoms, and your flow.</p>
              </div>
            </div>
            <SymptomForm
              maxDate={clientToday}
              clientToday={clientToday}
              onSaved={() => router.refresh()}
              onConsentRefused={onConsentRefusal}
              notify={notify}
            />
          </section>
        </div>
      )}

      {/* ── Logged history ──────────────────────────────────────────────── */}
      {!gateOpen && (
        <div className="m-grid">
          <section className="m-card m-span-6" aria-labelledby="dash-hist-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-hist-h">
                  Your logged periods
                </h2>
                <p>Newest first. One wrong date skews every prediction, so fix it here.</p>
              </div>
            </div>
            <PeriodHistory
              periods={periods}
              maxDate={clientToday}
              clientToday={clientToday}
              onChanged={() => router.refresh()}
              onConsentRefused={onConsentRefusal}
              notify={notify}
            />
          </section>

          <section className="m-card m-span-6" aria-labelledby="dash-symp-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-symp-h">
                  Symptoms you logged
                </h2>
                <p>Grouped by whether they fall in the cycle you are in now.</p>
              </div>
            </div>
            <SymptomHistory entries={symptomLog} onChanged={() => router.refresh()} notify={notify} />
          </section>
        </div>
      )}

      {/* ── Trend + insights ────────────────────────────────────────────── */}
      {!gateOpen && !needsData && (
        <div className="m-grid">
          <section className="m-card m-span-6" aria-labelledby="dash-trend-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-trend-h">
                  Cycle length trend
                </h2>
                <p>
                  {cycleLengthTrend.measured < 2
                    ? 'Measured from the gaps between your logged periods.'
                    : `Your last ${cycleLengthTrend.values.length} measured cycle${cycleLengthTrend.values.length === 1 ? '' : 's'}, in days.`}
                </p>
              </div>
            </div>
            {cycleLengthTrend.measured < 2 ? (
              <div className="m-empty">
                <span className="m-empty__art">
                  <ITrend aria-hidden="true" />
                </span>
                <h3 className="m-h3">Log two periods to see your trend</h3>
                <p>
                  A cycle length is the gap between two starts, so we need two before there is anything honest to
                  chart.
                </p>
              </div>
            ) : (
              <TrendBars labels={cycleLengthTrend.labels} values={cycleLengthTrend.values} />
            )}
          </section>

          <section className="m-card m-span-6" aria-labelledby="dash-insight-h">
            <div className="m-card__head">
              <div>
                <h2 className="m-h3" id="dash-insight-h">
                  This cycle
                </h2>
                <p>Read from your own logs.</p>
              </div>
            </div>
            <ul className="dash-insights">
              {insights.map((it) => {
                const Icon = toneIcon[it.tone]
                return (
                  <li key={it.title} className="dash-insight" data-tone={it.tone}>
                    <span className="dash-insight__icon">
                      <Icon aria-hidden="true" />
                    </span>
                    <span>
                      <b className="m-row__title">{it.title}</b>
                      <span className="m-row__meta">{it.body}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      )}

      {/* ── Reorder band, from a real purchase or a real first-purchase CTA ── */}
      <section className="m-band">
        <span className="eyebrow">{lastOrderedProduct ? 'Stay covered' : 'Find your fit'}</span>
        <h2 className="m-h2">
          {lastOrderedProduct
            ? `Reorder your ${lastOrderedProduct.name}`
            : 'Find the pad that fits your flow'}
        </h2>
        <p>
          {lastOrderedProduct
            ? needsData
              ? 'Order again so a fresh pack is waiting whenever your next period arrives.'
              : `Your next period is expected around ${prediction.nextStartLabel}. Reordering now means a fresh pack is already in the house.`
            : 'Organic cotton, breathable, and sized for the way you actually bleed. Start with a single pack and see.'}
        </p>
        <div className="m-band__actions">
          {lastOrderedProduct && lastOrderedProduct.slug ? (
            <Link className="btn btn-primary" to={`/product/${lastOrderedProduct.slug}`}>
              <ILeaf aria-hidden="true" /> Reorder now
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/#products">
              <ILeaf aria-hidden="true" /> Shop the range
            </Link>
          )}
          <Link className="btn btn-on-forest" to="/account">
            <IGift aria-hidden="true" /> Rewards &amp; orders
          </Link>
        </div>
        {showBandArt && (
          <OptImg className="m-band__art" base="figma-home/footer-imgImage9" sizes="300px" alt="" />
        )}
      </section>

      {/* ── Privacy ─────────────────────────────────────────────────────── */}
      {!gateOpen && <CyclePrivacy notify={notify} onWithdrawn={() => router.refresh()} />}
    </MemberLayout>
  )
}

/** Order status → the four member status tones. `pending` is the most common
 *  status of all and used to render as bare text in an invisible pill. */
function statusToneOf(key: AccountOrder['statusKey']): 'active' | 'success' | 'warning' | 'danger' {
  switch (key) {
    case 'delivered':
      return 'success'
    case 'paid':
    case 'shipped':
      return 'active'
    case 'cancelled':
    case 'refunded':
      return 'danger'
    default:
      return 'warning'
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   CONSENT — asked for, not assumed
   ══════════════════════════════════════════════════════════════════════════ */

function ConsentGate({ onGranted, notify }: { onGranted: () => void; notify: (m: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function grant() {
    setBusy(true)
    setError('')
    const res = await callApi('/api/cycle', { method: 'PATCH', body: { consent: true } })
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    notify('Cycle tracking is on')
    onGranted()
  }

  return (
    <section className="m-card m-card--roomy dash-consent" aria-labelledby="dash-consent-h">
      <span className="eyebrow">Your data, your call</span>
      <h2 className="m-h2" id="dash-consent-h">
        Turn on cycle tracking
      </h2>
      <p className="m-body">
        Menstrual data is health data, so we do not store any of it until you say yes. Here is exactly what happens
        if you do.
      </p>
      <ul className="dash-consent__list">
        <li>
          <ICheck aria-hidden="true" />
          <span>
            <b>What we keep.</b> The dates your periods started, how long they lasted, and any symptoms and flow you
            choose to log. Nothing else.
          </span>
        </li>
        <li>
          <ICheck aria-hidden="true" />
          <span>
            <b>How it is stored.</b> Encrypted with AES-256-GCM before it touches the database, with its own key per
            entry. The plain dates are never written to a column, and never to a log file.
          </span>
        </li>
        <li>
          <ICheck aria-hidden="true" />
          <span>
            <b>Who sees it.</b> Only you, signed in. It is never shared, never sold, and never used to target you
            with anything.
          </span>
        </li>
        <li>
          <ICheck aria-hidden="true" />
          <span>
            <b>How to stop.</b> Switch tracking off at the bottom of this page at any time. Withdrawing deletes
            every period and symptom you have logged — not just future ones.
          </span>
        </li>
      </ul>
      {error && <FormMessage tone="err">{error}</FormMessage>}
      <div className="m-form__actions">
        <button type="button" className="btn btn-dark" onClick={grant} disabled={busy}>
          {busy ? 'Turning on…' : 'Turn on cycle tracking'}
        </button>
        <Link className="btn btn-ghost" to="/account">
          Not now
        </Link>
      </div>
    </section>
  )
}

function CyclePrivacy({ notify, onWithdrawn }: { notify: (m: string) => void; onWithdrawn: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function withdraw() {
    setBusy(true)
    setError('')
    const res = await callApi('/api/cycle', { method: 'PATCH', body: { consent: false } })
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setConfirming(false)
    notify('Cycle tracking is off and your entries are deleted')
    onWithdrawn()
  }

  return (
    <section className="m-card dash-privacy" aria-labelledby="dash-privacy-h">
      <div className="m-card__head">
        <div>
          <h2 className="m-h3" id="dash-privacy-h">
            Cycle data
          </h2>
          <p>Tracking is on. Your entries are encrypted and visible only to you.</p>
        </div>
      </div>
      {error && <FormMessage tone="err">{error}</FormMessage>}
      {confirming ? (
        <div className="m-confirm">
          <span>Turn off tracking and permanently delete every period and symptom you have logged?</span>
          <span className="m-confirm__actions">
            <button type="button" className="m-linkbtn" onClick={withdraw} disabled={busy}>
              {busy ? 'Deleting…' : 'Yes, delete it all'}
            </button>
            <button type="button" className="m-linkbtn" onClick={() => setConfirming(false)} disabled={busy}>
              Keep tracking
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="m-linkbtn" onClick={() => setConfirming(true)}>
          <ITrash aria-hidden="true" /> Turn off tracking and delete my cycle data
        </button>
      )}
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   GUEST IMPORT — the dates typed into the landing tracker before signing in
   ══════════════════════════════════════════════════════════════════════════ */

interface GuestTrackerData {
  lastPeriod: string
  cycleLength: number
  periodLength: number
}

function GuestImport({
  clientToday,
  notify,
  onConsentRefused,
}: {
  clientToday: string
  notify: (m: string) => void
  onConsentRefused: () => void
}) {
  const router = useRouter()
  const [guest, setGuest] = useState<GuestTrackerData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Read once on mount: localStorage is client-only, and reading it during
  // render would break hydration.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(GUEST_TRACKER_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<GuestTrackerData>
      if (isDayKey(parsed.lastPeriod) && typeof parsed.periodLength === 'number') {
        setGuest({
          lastPeriod: parsed.lastPeriod,
          cycleLength: Number(parsed.cycleLength) || 28,
          periodLength: clampPeriod(parsed.periodLength),
        })
      }
    } catch {
      // Corrupt or blocked storage: there is simply nothing to import.
    }
  }, [])

  const dismiss = useCallback(() => {
    try {
      window.localStorage.removeItem(GUEST_TRACKER_KEY)
    } catch {
      /* storage blocked — dropping the banner is enough */
    }
    setGuest(null)
  }, [])

  if (!guest) return null

  async function importIt() {
    if (!guest) return
    setBusy(true)
    setError('')
    const res = await callApi('/api/cycle/periods', {
      method: 'POST',
      body: { startDate: guest.lastPeriod, lengthDays: guest.periodLength, clientToday },
    })
    setBusy(false)
    if (!res.ok) {
      if (res.error.consentRequired) {
        onConsentRefused()
        return
      }
      setError(res.error.message)
      return
    }
    dismiss()
    notify('Imported from the tracker')
    router.refresh()
  }

  return (
    <section className="m-card dash-import" aria-labelledby="dash-import-h">
      <div className="m-card__head">
        <div>
          <h2 className="m-h3" id="dash-import-h">
            Bring over the dates you entered
          </h2>
          <p>
            You used the tracker on our home page before signing in. Add {fmtFullKey(guest.lastPeriod)} to your
            account so your predictions start from it?
          </p>
        </div>
      </div>
      {error && <FormMessage tone="err">{error}</FormMessage>}
      <div className="m-form__actions">
        <button type="button" className="btn btn-dark" onClick={importIt} disabled={busy}>
          {busy ? 'Importing…' : 'Import these dates'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={dismiss} disabled={busy}>
          No thanks
        </button>
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   PREDICTION RING
   ══════════════════════════════════════════════════════════════════════════ */

function CycleRing({
  cycleDay,
  avgCycle,
  confidence,
}: {
  cycleDay: number
  avgCycle: number
  confidence: number
}) {
  const size = 168
  const stroke = 14
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  // avgCycle is clamped to 21..35 by the service, so this ratio can never be
  // Infinity or NaN the way it could when a duplicate log made avgCycle 0.
  const ratio = Math.min(1, Math.max(0, cycleDay / avgCycle))

  return (
    <div className="dash-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Day ${cycleDay} of about ${avgCycle}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--cream-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--yellow)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="dash-ring__label" aria-hidden="true">
        <b>Day {cycleDay}</b>
        <small>of ~{avgCycle}</small>
      </span>
      <span className="m-cap dash-ring__conf">{confidence}% confidence</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   CALENDAR — keyboard navigable, and never colour-only
   ══════════════════════════════════════════════════════════════════════════ */

function PhaseCalendar({
  today,
  prediction,
  periods,
  symptoms,
  timezone,
}: {
  today: string
  prediction: CycleData['prediction']
  periods: PeriodEntry[]
  symptoms: SymptomEntry[]
  timezone: string
}) {
  const todayDate = dateFromKey(today)
  const [view, setView] = useState({ y: todayDate.getUTCFullYear(), m: todayDate.getUTCMonth() })
  const [selected, setSelected] = useState(today)
  const gridRef = useRef<HTMLDivElement>(null)
  // Only move focus after a keyboard/button interaction, never on first paint.
  const shouldFocus = useRef(false)

  const phaseOf = useCallback(
    (key: string): CyclePhase =>
      phaseForDayKey(key, {
        nextStart: prediction.nextStart,
        avgCycle: prediction.avgCycle,
        avgPeriod: prediction.avgPeriod,
        periods: periods.map((p) => ({ start: p.start, length: p.length })),
      }),
    [prediction, periods],
  )

  // Day keys for the visible month, plus the leading blanks.
  const { days, leading } = useMemo(() => {
    const firstKey = keyFromDate(new Date(Date.UTC(view.y, view.m, 1)))
    const dayCount = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
    return {
      leading: dateFromKey(firstKey).getUTCDay(),
      days: Array.from({ length: dayCount }, (_, i) => addDaysKey(firstKey, i)),
    }
  }, [view])

  const symptomsByDay = useMemo(() => {
    const map = new Map<string, SymptomEntry[]>()
    for (const s of symptoms) {
      const list = map.get(s.date)
      if (list) list.push(s)
      else map.set(s.date, [s])
    }
    return map
  }, [symptoms])

  // Keep the focused cell reachable after arrow keys move across a month edge.
  useEffect(() => {
    if (!shouldFocus.current) return
    shouldFocus.current = false
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)
    el?.focus()
  }, [selected, view])

  const goTo = useCallback((key: string) => {
    const d = dateFromKey(key)
    setSelected(key)
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }, [])

  const move = (deltaMonths: number) => {
    const d = new Date(Date.UTC(view.y, view.m + deltaMonths, 1))
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  /** Arrow-key roving focus — the standard date-grid interaction. */
  function onKeyDown(e: React.KeyboardEvent) {
    const jump: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      PageUp: -28,
      PageDown: 28,
    }
    const delta = jump[e.key]
    if (delta === undefined) return
    e.preventDefault()
    shouldFocus.current = true
    goTo(addDaysKey(selected, delta))
  }

  const selectedPhase = phaseOf(selected)
  const selectedSymptoms = symptomsByDay.get(selected) ?? []
  const inView = selected.slice(0, 7) === `${view.y}-${String(view.m + 1).padStart(2, '0')}`

  return (
    <div className="dash-cal">
      <div className="dash-cal__head">
        <button
          type="button"
          className="m-iconbtn dash-cal__nav dash-cal__nav--prev"
          onClick={() => move(-1)}
          aria-label="Previous month"
        >
          <IChevron aria-hidden="true" />
        </button>
        <h3 className="m-h3 dash-cal__title" aria-live="polite">
          {MONTHS[view.m]} {view.y}
        </h3>
        <button type="button" className="m-iconbtn dash-cal__nav" onClick={() => move(1)} aria-label="Next month">
          <IChevron aria-hidden="true" />
        </button>
        <button
          type="button"
          className="m-linkbtn dash-cal__today"
          onClick={() => {
            shouldFocus.current = true
            goTo(today)
          }}
        >
          Today
        </button>
      </div>

      <div className="dash-cal__weekdays" aria-hidden="true">
        {WEEKDAYS.map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>

      {/* One tab stop for the whole grid; arrows move within it. */}
      <div className="dash-cal__grid" ref={gridRef} onKeyDown={onKeyDown} role="group" aria-label="Cycle calendar">
        {Array.from({ length: leading }).map((_, i) => (
          <span key={`pad-${i}`} className="dash-cal__pad" />
        ))}
        {days.map((key) => {
          const phase = phaseOf(key)
          const isToday = key === today
          const isSelected = key === selected
          const hasSymptoms = symptomsByDay.has(key)
          const phaseName = phase ? PHASE_LABEL[phase] : 'nothing predicted'
          return (
            <button
              key={key}
              type="button"
              data-day={key}
              data-phase={phase ?? 'none'}
              className={`dash-cal__day${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
              // Roving tabindex: only the selected day is in the tab order, so
              // the calendar costs one tab stop rather than thirty-one.
              tabIndex={isSelected || (!inView && key === days[0]) ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={`${fmtFullKey(key)} — ${phaseName}${hasSymptoms ? ', symptoms logged' : ''}${isToday ? ', today' : ''}`}
              onClick={() => setSelected(key)}
              onFocus={() => setSelected(key)}
            >
              <span className="dash-cal__num">{dateFromKey(key).getUTCDate()}</span>
              {/* A shape, not just a hue — the phase must survive colour blindness
                  and a monochrome print. Each phase gets its own marker in CSS. */}
              {phase && <span className="dash-cal__mark" aria-hidden="true" />}
              {hasSymptoms && <span className="dash-cal__symp" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {/* Selected-day detail. Reachable by tap and keyboard, not only by hover. */}
      <div className="dash-cal__detail" role="status">
        <b>{fmtFullKey(selected)}</b>
        <span>
          {selectedPhase ? `${PHASE_LABEL[selectedPhase]} — ${PHASE_HINT[selectedPhase]}` : 'Nothing predicted for this day.'}
        </span>
        {selectedSymptoms.length > 0 && (
          <span>
            Logged: {selectedSymptoms.map((s) => `${s.day} (${levelLabel(s.day, s.level)})`).join(', ')}
          </span>
        )}
        {selectedSymptoms.find((s) => s.note) && (
          <span className="dash-log__note">“{selectedSymptoms.find((s) => s.note)?.note}”</span>
        )}
      </div>

      <ul className="dash-cal__legend">
        {(Object.keys(PHASE_LABEL) as Exclude<CyclePhase, null>[]).map((p) => (
          <li key={p} data-phase={p}>
            <span className="dash-cal__swatch" aria-hidden="true" />
            <span>
              <b>{PHASE_LABEL[p]}</b>
              <small>{PHASE_HINT[p]}</small>
            </span>
          </li>
        ))}
        <li data-phase="symptom">
          <span className="dash-cal__swatch" aria-hidden="true" />
          <span>
            <b>Symptoms logged</b>
            <small>A day you recorded how you felt.</small>
          </span>
        </li>
      </ul>
      <p className="m-cap">
        Dates are shown in {timezone.replace('_', ' ')}. Use the arrow keys to move day by day.
      </p>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   TREND — measured gaps only, drawn as labelled bars so the numbers are legible
   ══════════════════════════════════════════════════════════════════════════ */

function TrendBars({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  return (
    // The summary used to be a sibling <li> of the bars inside one grid, relying
    // on `grid-column: 1 / -1` to span — which cannot work when every track is
    // implicit, so the sentence was squeezed into bar column 1 and painted
    // outside the card. It is now a sibling of the bar list instead.
    <div className="dash-trend">
      <ul className="dash-trend__bars">
        {values.map((v, i) => (
          <li key={`${labels[i]}-${i}`} className="dash-trend__item">
            <span className="dash-trend__bar" style={{ height: `${Math.round((v / max) * 100)}%` }} aria-hidden="true" />
            <span className="dash-trend__value m-num">{v}</span>
            <span className="dash-trend__label">{labels[i]}</span>
          </li>
        ))}
      </ul>
      <p className="dash-trend__summary m-cap">
        {min === max ? `Every measured cycle was ${max} days.` : `Between ${min} and ${max} days.`}
      </p>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   PERIOD FORM
   ══════════════════════════════════════════════════════════════════════════ */

function PeriodForm({
  maxDate,
  defaultLength,
  clientToday,
  onSaved,
  onConsentRefused,
  notify,
}: {
  maxDate: string
  defaultLength: number
  clientToday: string
  onSaved: () => void
  onConsentRefused: () => void
  notify: (m: string) => void
}) {
  const [startDate, setStartDate] = useState('')
  const [lengthDays, setLengthDays] = useState(clampPeriod(defaultLength))
  const [busy, setBusy] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (!isDayKey(startDate)) {
      setFieldError('Pick the day your period started.')
      return
    }
    if (daysBetweenKeys(clientToday, startDate) > 0) {
      setFieldError('That day has not happened yet. Pick when your period actually started.')
      return
    }
    setFieldError('')
    setBusy(true)
    const res = await callApi<{ deduped?: boolean }>('/api/cycle/periods', {
      method: 'POST',
      body: { startDate, lengthDays, clientToday },
    })
    setBusy(false)

    if (!res.ok) {
      if (res.error.consentRequired) {
        onConsentRefused()
        return
      }
      setMessage({ tone: 'err', text: res.error.message })
      return
    }
    setStartDate('')
    setMessage({
      tone: 'ok',
      text: res.data.deduped
        ? 'Updated that day. Your predictions have been recalculated.'
        : 'Period logged. Your predictions have been recalculated.',
    })
    notify('Period logged')
    onSaved()
  }

  return (
    <form className="m-form" onSubmit={submit} noValidate>
      <div className="m-form__grid">
        <div className="m-field">
          <label className="m-field__label" htmlFor="dash-start">
            When did it start?
          </label>
          <input
            id="dash-start"
            className="m-input"
            type="date"
            value={startDate}
            max={maxDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (fieldError) setFieldError('')
            }}
            aria-invalid={fieldError ? 'true' : undefined}
            aria-describedby={fieldError ? 'dash-start-err' : undefined}
            required
          />
          {fieldError && (
            <p className="m-field__error" id="dash-start-err">
              <IAlert aria-hidden="true" />
              {fieldError}
            </p>
          )}
        </div>

        <div className="m-field">
          <label className="m-field__label" htmlFor="dash-len">
            How many days did it last?
          </label>
          <input
            id="dash-len"
            className="m-input"
            type="number"
            min={1}
            max={15}
            value={lengthDays}
            onChange={(e) => setLengthDays(clampPeriod(Number(e.target.value)))}
          />
          <span className="m-field__hint">Between 1 and 15 days.</span>
        </div>
      </div>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      <div className="m-form__actions">
        <button type="submit" className="btn btn-dark btn--block" disabled={busy}>
          {busy ? 'Saving…' : 'Log this period'}
        </button>
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   SYMPTOM FORM — multi-select, dated, with a flow scale and per-symptom intensity
   ══════════════════════════════════════════════════════════════════════════ */

function SymptomForm({
  maxDate,
  clientToday,
  onSaved,
  onConsentRefused,
  notify,
}: {
  maxDate: string
  clientToday: string
  onSaved: () => void
  onConsentRefused: () => void
  notify: (m: string) => void
}) {
  // Defaults to the USER's today (from their browser), not the server's UTC day.
  const [date, setDate] = useState(clientToday)
  const [picked, setPicked] = useState<Record<string, number>>({})
  const [flow, setFlow] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const toggle = (symptom: string) =>
    setPicked((prev) => {
      const next = { ...prev }
      if (symptom in next) delete next[symptom]
      else next[symptom] = 2 // "Moderate" is the honest default to nudge from
      return next
    })

  const setLevel = (symptom: string, level: number) => setPicked((prev) => ({ ...prev, [symptom]: level }))

  const chosen = Object.keys(picked)
  const nothingToSave = chosen.length === 0 && flow === null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (nothingToSave) {
      setMessage({ tone: 'err', text: 'Pick at least one symptom, or set your flow.' })
      return
    }
    setBusy(true)

    // The whole day goes in one request. Cramps AND low energy AND poor sleep is
    // one afternoon, not three visits to a form — the endpoint stores a row per
    // symptom so each stays independently deletable, but the user submits once.
    const entries: { symptom: string; level: number }[] = chosen.map((s) => ({ symptom: s, level: picked[s] }))
    if (flow !== null) entries.push({ symptom: FLOW_SYMPTOM, level: flow })

    const res = await callApi('/api/cycle/symptoms', {
      method: 'POST',
      body: { date, entries, note: note.trim() || undefined, clientToday },
    })
    setBusy(false)

    if (!res.ok) {
      if (res.error.consentRequired) {
        onConsentRefused()
        return
      }
      setMessage({ tone: 'err', text: res.error.message })
      return
    }
    setPicked({})
    setFlow(null)
    setNote('')
    setMessage({ tone: 'ok', text: `Logged for ${fmtFullKey(date)}.` })
    notify('Entry saved')
    onSaved()
  }

  return (
    <form className="m-form" onSubmit={submit} noValidate>
      <div className="m-field">
        <label className="m-field__label" htmlFor="dash-sdate">
          Which day?
        </label>
        <input
          id="dash-sdate"
          className="m-input"
          type="date"
          value={date}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <fieldset className="dash-fieldset">
        <legend className="m-field__label">
          Flow <span>(optional)</span>
        </legend>
        <div className="dash-chips">
          {FLOW_LEVELS.map((label, i) => (
            <Chip key={label} selected={flow === i} onClick={() => setFlow(flow === i ? null : i)}>
              {label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="dash-fieldset">
        <legend className="m-field__label">
          Symptoms <span>(pick any)</span>
        </legend>
        <div className="dash-chips">
          {SYMPTOMS.map((s) => (
            <Chip key={s} selected={s in picked} onClick={() => toggle(s)}>
              {s}
            </Chip>
          ))}
        </div>
      </fieldset>

      {chosen.length > 0 && (
        <ul className="dash-levels">
          {chosen.map((s) => (
            <li key={s} className="dash-levels__row">
              <span className="dash-levels__name">{s}</span>
              <span className="seg" role="group" aria-label={`How strong was ${s.toLowerCase()}?`}>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={picked[s] === n ? 'on' : ''}
                    aria-pressed={picked[s] === n}
                    onClick={() => setLevel(s, n)}
                  >
                    {INTENSITY_LEVELS[n]}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="m-field">
        <label className="m-field__label" htmlFor="dash-note">
          Anything else? <span>(optional)</span>
        </label>
        <textarea
          id="dash-note"
          className="m-textarea"
          value={note}
          maxLength={500}
          rows={3}
          placeholder="Slept badly, cramps eased after a hot pack…"
          onChange={(e) => setNote(e.target.value)}
        />
        <span className="m-field__hint">Kept with the day, encrypted like everything else here.</span>
      </div>

      {message && <FormMessage tone={message.tone}>{message.text}</FormMessage>}

      <div className="m-form__actions">
        <button type="submit" className="btn btn-ghost btn--block" disabled={busy || nothingToSave}>
          {busy ? 'Saving…' : 'Save this entry'}
        </button>
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   LOGGED HISTORY — edit and delete, because a typo poisons every prediction
   ══════════════════════════════════════════════════════════════════════════ */

function PeriodHistory({
  periods,
  maxDate,
  clientToday,
  onChanged,
  onConsentRefused,
  notify,
}: {
  periods: PeriodEntry[]
  maxDate: string
  clientToday: string
  onChanged: () => void
  onConsentRefused: () => void
  notify: (m: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const [draftStart, setDraftStart] = useState('')
  const [draftLength, setDraftLength] = useState(5)

  function openEdit(p: PeriodEntry) {
    setConfirming(null)
    setError('')
    setEditing(p.id)
    setDraftStart(p.start)
    setDraftLength(p.length)
  }

  /**
   * Save a correction in place. PATCH re-encrypts the payload and re-keys the
   * day hash server-side, so moving a start onto a day that already has a row
   * folds the two together instead of leaving a duplicate behind.
   */
  async function saveEdit(original: PeriodEntry) {
    if (!isDayKey(draftStart)) {
      setError('Pick a valid start date.')
      return
    }
    if (daysBetweenKeys(clientToday, draftStart) > 0) {
      setError('That day has not happened yet.')
      return
    }
    setBusy(true)
    setError('')

    const res = await callApi('/api/cycle/periods', {
      method: 'PATCH',
      body: { id: original.id, startDate: draftStart, lengthDays: draftLength, clientToday },
    })
    setBusy(false)

    if (!res.ok) {
      if (res.error.consentRequired) {
        onConsentRefused()
        return
      }
      setError(res.error.message)
      return
    }
    setEditing(null)
    notify('Period updated')
    onChanged()
  }

  async function remove(id: string) {
    setBusy(true)
    setError('')
    const res = await callApi(`/api/cycle/periods?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setConfirming(null)
    notify('Period removed')
    onChanged()
  }

  if (periods.length === 0) {
    return (
      <div className="m-empty">
        <span className="m-empty__art">
          <ICycle aria-hidden="true" />
        </span>
        <h3 className="m-h3">Nothing logged yet</h3>
        <p>Log a period on the left and it will appear here, ready to edit if you mistype a date.</p>
      </div>
    )
  }

  return (
    <>
      {error && <FormMessage tone="err">{error}</FormMessage>}
      <ul className="dash-log">
        {periods.map((p) => (
          <li key={p.id} className="dash-log__item">
            {editing === p.id ? (
              <div className="m-form dash-log__edit">
                <div className="m-form__grid">
                  <div className="m-field">
                    <label className="m-field__label" htmlFor={`edit-start-${p.id}`}>
                      Start date
                    </label>
                    <input
                      id={`edit-start-${p.id}`}
                      className="m-input"
                      type="date"
                      value={draftStart}
                      max={maxDate}
                      onChange={(e) => setDraftStart(e.target.value)}
                    />
                  </div>
                  <div className="m-field">
                    <label className="m-field__label" htmlFor={`edit-len-${p.id}`}>
                      Days
                    </label>
                    <input
                      id={`edit-len-${p.id}`}
                      className="m-input"
                      type="number"
                      min={1}
                      max={15}
                      value={draftLength}
                      onChange={(e) => setDraftLength(clampPeriod(Number(e.target.value)))}
                    />
                  </div>
                </div>
                <div className="m-form__actions">
                  <button type="button" className="btn btn-dark" onClick={() => saveEdit(p)} disabled={busy}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : confirming === p.id ? (
              <div className="m-confirm">
                <span>Remove the period starting {p.startLabel}?</span>
                <span className="m-confirm__actions">
                  <button type="button" className="m-linkbtn" onClick={() => remove(p.id)} disabled={busy}>
                    {busy ? 'Removing…' : 'Yes, remove'}
                  </button>
                  <button type="button" className="m-linkbtn" onClick={() => setConfirming(null)} disabled={busy}>
                    Keep it
                  </button>
                </span>
              </div>
            ) : (
              <>
                <span className="dash-log__main">
                  <span className="m-row__title">{p.startLabel}</span>
                  <span className="m-row__meta">
                    Lasted {p.length} day{p.length === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="dash-log__actions">
                  <button
                    type="button"
                    className="m-iconbtn"
                    onClick={() => openEdit(p)}
                    aria-label={`Edit the period starting ${p.startLabel}`}
                  >
                    <IPencil aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="m-iconbtn m-iconbtn--danger"
                    onClick={() => {
                      setEditing(null)
                      setConfirming(p.id)
                    }}
                    aria-label={`Remove the period starting ${p.startLabel}`}
                  >
                    <ITrash aria-hidden="true" />
                  </button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function SymptomHistory({
  entries,
  onChanged,
  notify,
}: {
  entries: SymptomEntry[]
  onChanged: () => void
  notify: (m: string) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove(id: string) {
    setBusy(true)
    setError('')
    const res = await callApi(`/api/cycle/symptoms?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      setError(res.error.message)
      return
    }
    setConfirming(null)
    notify('Entry removed')
    onChanged()
  }

  if (entries.length === 0) {
    return (
      <div className="m-empty">
        <span className="m-empty__art">
          <ISparkles aria-hidden="true" />
        </span>
        <h3 className="m-h3">Nothing logged yet</h3>
        <p>Record cramps, mood or flow and your patterns start showing up across the calendar.</p>
      </div>
    )
  }

  // Two honest groups instead of one heading that claimed six-month-old entries
  // were from "this cycle".
  const thisCycle = entries.filter((e) => e.inCurrentCycle)
  const earlier = entries.filter((e) => !e.inCurrentCycle)

  const row = (e: SymptomEntry) => (
    <li key={e.id} className="dash-log__item">
      {confirming === e.id ? (
        <div className="m-confirm">
          <span>
            Remove {e.day.toLowerCase()} logged on {fmtDayMonth(e.date)}?
          </span>
          <span className="m-confirm__actions">
            <button type="button" className="m-linkbtn" onClick={() => remove(e.id)} disabled={busy}>
              {busy ? 'Removing…' : 'Yes, remove'}
            </button>
            <button type="button" className="m-linkbtn" onClick={() => setConfirming(null)} disabled={busy}>
              Keep it
            </button>
          </span>
        </div>
      ) : (
        <>
          <span className="dash-log__main">
            <span className="m-row__title">{e.day}</span>
            <span className="m-row__meta">
              {fmtDayMonth(e.date)} · {levelLabel(e.day, e.level)}
            </span>
            {e.note && <span className="m-row__meta dash-log__note">“{e.note}”</span>}
          </span>
          <span className="dash-log__actions">
            {/* The level as dots is decorative; the word above carries the meaning. */}
            <span className="dash-dots" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= e.level ? 'on' : ''} />
              ))}
            </span>
            <button
              type="button"
              className="m-iconbtn m-iconbtn--danger"
              onClick={() => setConfirming(e.id)}
              aria-label={`Remove ${e.day} logged on ${fmtDayMonth(e.date)}`}
            >
              <ITrash aria-hidden="true" />
            </button>
          </span>
        </>
      )}
    </li>
  )

  return (
    <>
      {error && <FormMessage tone="err">{error}</FormMessage>}
      {thisCycle.length > 0 && (
        <>
          <p className="m-cap">This cycle</p>
          <ul className="dash-log">{thisCycle.map(row)}</ul>
        </>
      )}
      {earlier.length > 0 && (
        <>
          <p className="m-cap">Earlier</p>
          <ul className="dash-log">{earlier.map(row)}</ul>
        </>
      )}
    </>
  )
}
