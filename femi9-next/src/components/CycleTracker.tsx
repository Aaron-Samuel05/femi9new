import '../styles/cycle-tracker.css'
import { useMemo, useState } from 'react'
import { Link, useRouter } from '@/lib/router-compat'

/* ------------------------------------------------------------------ *
 * Femi9 · Cycle tracker (homepage section #10)
 * Submitting logs the period start to the signed-in user's account via
 * POST /api/cycle/periods, then refreshes so any server-rendered cycle
 * view (the dashboard) recomputes. The result card is still computed
 * locally for instant feedback — and so a guest who isn't signed in
 * (the POST 401s, harmlessly) still sees their prediction.
 * Two states: SETUP and RESULT. All date math is local-midnight based
 * to avoid TZ / NaN surprises.
 * ------------------------------------------------------------------ */

const DAY = 86_400_000

const CYCLE_MIN = 21
const CYCLE_MAX = 35
const CYCLE_DEFAULT = 28
const PERIOD_MIN = 3
const PERIOD_MAX = 8
const PERIOD_DEFAULT = 5

type TrackerData = {
  lastPeriod: string // 'YYYY-MM-DD'
  cycleLength: number
  periodLength: number
}

type Phase = 'period' | 'predicted' | 'follicular' | 'fertile' | 'ovulation' | 'pms'

/* Phase colours are paired with a text label everywhere they appear. */
const PHASE_META: Record<Phase, { label: string; color: string; tint: string }> = {
  period: { label: 'Period', color: '#C85C79', tint: 'rgba(200,92,121,.16)' },
  predicted: { label: 'Predicted period', color: '#E4A9B8', tint: 'rgba(228,169,184,.22)' },
  fertile: { label: 'Fertile window', color: '#7FD0C8', tint: 'rgba(127,208,200,.24)' },
  ovulation: { label: 'Ovulation', color: '#0E9E94', tint: 'rgba(14,158,148,.16)' },
  pms: { label: 'PMS / luteal', color: '#E7B85C', tint: 'rgba(231,184,92,.24)' },
  follicular: { label: 'Follicular', color: '#B79BD8', tint: 'rgba(183,155,216,.20)' },
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/* ---------- date helpers (defensive) ---------- */
function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').trim())
  if (!m) return null
  const y = +m[1]
  const mo = +m[2]
  const d = +m[3]
  const dt = new Date(y, mo - 1, d)
  // reject rolled-over values like 2026-02-31
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null
  return dt
}
const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const daysBetween = (a: Date, b: Date) => Math.round((strip(b).getTime() - strip(a).getTime()) / DAY)
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const clampInt = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, v))
}
const fmtDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/* ---------- cycle maths ---------- */
function phaseForCycleDay(cycleDay: number, cycleLength: number, periodLength: number): Phase {
  const ovulation = Math.max(periodLength + 1, cycleLength - 14)
  if (cycleDay <= periodLength) return 'period'
  if (cycleDay === ovulation) return 'ovulation'
  if (cycleDay >= ovulation - 4 && cycleDay <= ovulation + 1) return 'fertile'
  if (cycleDay >= cycleLength - 4) return 'pms'
  return 'follicular'
}

type Prediction = {
  cycleDay: number
  cycleLength: number
  periodLength: number
  nextPeriod: Date
  daysUntilNext: number
  phase: Phase
}

function predict(data: TrackerData, today: Date): Prediction | null {
  const last = parseISO(data.lastPeriod)
  if (!last) return null
  const cycleLength = clampInt(data.cycleLength, CYCLE_MIN, CYCLE_MAX, CYCLE_DEFAULT)
  const periodLength = clampInt(data.periodLength, PERIOD_MIN, PERIOD_MAX, PERIOD_DEFAULT)

  // Roll the stored start forward by whole cycles until it lands on/just before today.
  const diff = daysBetween(last, today)
  const cyclesPassed = Math.floor(diff / cycleLength)
  const cycleStart = addDays(last, cyclesPassed * cycleLength)
  const cycleDay = daysBetween(cycleStart, today) + 1 // 1..cycleLength
  const nextPeriod = addDays(cycleStart, cycleLength) // always strictly future
  const daysUntilNext = daysBetween(today, nextPeriod) // 1..cycleLength

  return {
    cycleDay,
    cycleLength,
    periodLength,
    nextPeriod,
    daysUntilNext,
    phase: phaseForCycleDay(cycleDay, cycleLength, periodLength),
  }
}

/* Phase for an arbitrary date (week strip). Future "period" reads as predicted. */
function phaseForDate(date: Date, data: TrackerData, today: Date): Phase {
  const last = parseISO(data.lastPeriod)!
  const cycleLength = clampInt(data.cycleLength, CYCLE_MIN, CYCLE_MAX, CYCLE_DEFAULT)
  const periodLength = clampInt(data.periodLength, PERIOD_MIN, PERIOD_MAX, PERIOD_DEFAULT)
  const diff = daysBetween(last, date)
  const cyclesPassed = Math.floor(diff / cycleLength)
  const cycleStart = addDays(last, cyclesPassed * cycleLength)
  const cycleDay = daysBetween(cycleStart, date) + 1
  const base = phaseForCycleDay(cycleDay, cycleLength, periodLength)
  if (base === 'period' && daysBetween(today, date) > 0) return 'predicted'
  return base
}

/* ---------- stepper subcomponent ---------- */
function Stepper({
  label,
  hint,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min: number
  max: number
  unit: string
  onChange: (n: number) => void
}) {
  const dec = () => onChange(Math.max(min, value - 1))
  const inc = () => onChange(Math.min(max, value + 1))
  return (
    <div className="cyc-field">
      <span className="cyc-label">
        {label}
        {hint && <em className="cyc-hint"> {hint}</em>}
      </span>
      <div className="cyc-stepper" role="group" aria-label={label}>
        <button
          type="button"
          className="cyc-step-btn"
          onClick={inc}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <span aria-hidden="true">+</span>
        </button>
        <span className="cyc-step-val" aria-live="polite">
          <b>{value}</b>
          <small>{unit}</small>
        </span>
        <button
          type="button"
          className="cyc-step-btn"
          onClick={dec}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <span aria-hidden="true">–</span>
        </button>
      </div>
    </div>
  )
}

/* ================================================================== */
export function CycleTracker() {
  const today = useMemo(() => strip(new Date()), [])
  const todayISO = useMemo(() => toISO(today), [today])

  const router = useRouter()
  const [data, setData] = useState<TrackerData | null>(null)
  const [mode, setMode] = useState<'setup' | 'result'>('setup')

  // form state
  const [lastPeriod, setLastPeriod] = useState('')
  const [cycleLength, setCycleLength] = useState(CYCLE_DEFAULT)
  const [periodLength, setPeriodLength] = useState(PERIOD_DEFAULT)
  const [error, setError] = useState('')

  const prediction = useMemo(
    () => (data && mode === 'result' ? predict(data, today) : null),
    [data, mode, today],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const picked = parseISO(lastPeriod)
    if (!picked) {
      setError('Please pick the date your last period started.')
      return
    }
    if (daysBetween(picked, today) < 0) {
      setError('That date is in the future. Pick when your last period actually started.')
      return
    }

    // Show the local result immediately — the prediction card is computed
    // client-side, so a signed-out visitor still gets their preview.
    const next: TrackerData = { lastPeriod, cycleLength, periodLength }
    setData(next)
    setError('')
    setMode('result')

    // Persist to the account. A 401 (not signed in) is expected and ignored;
    // a successful save refreshes any server data so the dashboard updates.
    try {
      const res = await fetch('/api/cycle/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: lastPeriod, lengthDays: periodLength }),
      })
      if (res.ok) router.refresh()
    } catch {
      /* offline / network — the local preview still stands */
    }
  }

  const handleEdit = () => {
    if (data) {
      setLastPeriod(data.lastPeriod)
      setCycleLength(data.cycleLength)
      setPeriodLength(data.periodLength)
    }
    setError('')
    setMode('setup')
  }

  // 7-day strip starting today (result state only)
  const week = useMemo(() => {
    if (!data || !prediction) return []
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i)
      return {
        date,
        label: WEEKDAYS[date.getDay()],
        num: date.getDate(),
        isToday: i === 0,
        phase: phaseForDate(date, data, today),
      }
    })
  }, [data, prediction, today])

  // phases present in the week, in a stable legend order
  const legendPhases = useMemo(() => {
    const order: Phase[] = ['period', 'predicted', 'fertile', 'ovulation', 'pms', 'follicular']
    const present = new Set(week.map((d) => d.phase))
    return order.filter((p) => present.has(p))
  }, [week])

  return (
    <section id="tracker" className="section cyc" aria-labelledby="cyc-heading">
      <div className="cyc-fig-vectors" aria-hidden="true">
        <img data-node-id="198:2531" src="/assets/figma-home/tracker-imgVector.svg" alt="" />
        <img data-node-id="198:2540" src="/assets/figma-home/tracker-imgVector1.svg" alt="" />
        <img data-node-id="198:2549" src="/assets/figma-home/tracker-imgVector2.svg" alt="" />
        <img data-node-id="198:2558" src="/assets/figma-home/tracker-imgVector3.svg" alt="" />
      </div>
      <div className="wrap">
        <div className={`cyc-panel${mode === 'result' ? ' is-result' : ''}`}>
          {/* ---- intro / copy side ---- */}
          <div className="cyc-intro">
            <h2 id="cyc-heading" className="display">
              Know your cycle.<br />
              Never get caught out.
            </h2>
            <p className="cyc-lead">
              {mode === 'setup'
                ? 'A Gentle, Private Tracker. Tell Us Three Things To See When Your Next Period Is Likely To Arrive — And When You Are Signed In, It Saves To Your Femi9 Account So Your Dashboard Stays In Sync.'
                : 'Here is your rhythm at a glance. Signed in, it is saved to your account so you can plan your days and your Femi9 pack with a little more calm.'}
            </p>
            <ul className="cyc-assurances" aria-label="How this tracker treats your data">
              <li>100% Organic Cotton</li>
              <li>Dermatologically Tested</li>
              <li>Biodegradable Materials</li>
            </ul>
          </div>

          {/* ---- interactive side ---- */}
          {mode === 'setup' ? (
            <form className="cyc-card cyc-setup" onSubmit={handleSubmit} noValidate>
              <div className="cyc-form-title">
                <h3>Calculate Your Next Period</h3>
                <p>Create an account to enjoy all the services without any ads for free!</p>
              </div>
              <div className="cyc-field">
                <label className="cyc-label" htmlFor="cyc-date">
                  Last Period Date
                </label>
                <input
                  id="cyc-date"
                  className="cyc-date"
                  type="date"
                  value={lastPeriod}
                  max={todayISO}
                  onChange={(e) => {
                    setLastPeriod(e.target.value)
                    if (error) setError('')
                  }}
                  aria-describedby={error ? 'cyc-error' : undefined}
                  required
                />
              </div>

              <Stepper
                label="Cycle length"
                hint="days between periods"
                value={cycleLength}
                min={CYCLE_MIN}
                max={CYCLE_MAX}
                unit="days"
                onChange={setCycleLength}
              />

              <Stepper
                label="Period length"
                hint="optional"
                value={periodLength}
                min={PERIOD_MIN}
                max={PERIOD_MAX}
                unit="days"
                onChange={setPeriodLength}
              />

              {error && (
                <p className="cyc-error" id="cyc-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" className="btn btn-primary cyc-submit">
                Show Prediction
              </button>
              <p className="cyc-fineprint">Averages are a guide. Every body keeps its own time.</p>
            </form>
          ) : (
            prediction && (
              <div className="cyc-card cyc-result" aria-live="polite">
                <span className="cyc-blob" aria-hidden="true" />

                <div className="cyc-headline">
                  <p className="cyc-eyebrow-sm">Your next period</p>
                  <p className="cyc-big display">
                    Next period in <span className="cyc-count">{prediction.daysUntilNext}</span>{' '}
                    {prediction.daysUntilNext === 1 ? 'day' : 'days'}
                  </p>
                  <p className="cyc-sub">
                    Around {fmtDate(prediction.nextPeriod)} · Cycle day {prediction.cycleDay}
                  </p>
                </div>

                <div
                  className="cyc-phase"
                  style={{ '--pc': PHASE_META[prediction.phase].color } as React.CSSProperties}
                >
                  <span className="cyc-phase-dot" aria-hidden="true" />
                  <span className="cyc-phase-text">
                    <b>Today: {PHASE_META[prediction.phase].label}</b>
                    <small>Day {prediction.cycleDay} of a ~{prediction.cycleLength}-day cycle</small>
                  </span>
                </div>

                {/* week strip */}
                <div className="cyc-week" role="group" aria-label="The next seven days">
                  {week.map((d, i) => {
                    const meta = PHASE_META[d.phase]
                    return (
                      <div
                        key={i}
                        className={`cyc-day${d.isToday ? ' is-today' : ''}`}
                        style={
                          { '--pc': meta.color, '--pt': meta.tint } as React.CSSProperties
                        }
                        title={`${d.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${meta.label}`}
                      >
                        <span className="cyc-day-wd">{d.label}</span>
                        <span className="cyc-day-num">{d.num}</span>
                        <span className="cyc-day-dot" aria-hidden="true" />
                        <span className="visually-hidden">{meta.label}</span>
                      </div>
                    )
                  })}
                </div>

                <div className="cyc-legend">
                  {legendPhases.map((p) => (
                    <span key={p} className="cyc-legend-item">
                      <span className="cyc-legend-sw" style={{ background: PHASE_META[p].color }} />
                      {PHASE_META[p].label}
                    </span>
                  ))}
                </div>

                {/* product tie-in */}
                <div className="cyc-tiein">
                  <p>
                    Your Femi9 pack can arrive <b>~3 days before</b>, so you never get caught out.
                  </p>
                  <Link to="/product/p330dw" className="btn btn-primary cyc-tiein-btn">
                    Subscribe &amp; save
                  </Link>
                </div>

                <button type="button" className="cyc-edit" onClick={handleEdit}>
                  Update my dates
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  )
}
