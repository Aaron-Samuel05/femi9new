'use client'
// Client boundary: this screen renders Shell and the chart components, which use
// React hooks (useState/useMemo) but declare no 'use client' of their own — they
// rely on this directive so they land in the client bundle now that the parent
// page (app/dashboard/page.tsx) is an async server component. It also owns the
// small logging forms, which POST to /api/cycle/* and refresh the server data.
import { useMemo, useState } from 'react'
import { Link, useRouter } from '@/lib/router-compat'
import { Shell } from '../app/Shell'
import { CycleCalendar, type Phase } from '../charts/CycleCalendar'
import { AreaChart } from '../charts/AreaChart'
import { ProgressRing } from '../charts/mini'
import { C, PHASE } from '../charts/theme'
import { ICheck, IAlert, IInfo, ILeaf } from '../components/AppIcons'
import type { CycleData, CyclePrediction, PeriodEntry } from '@/lib/services/cycle'

const toneIcon = { good: ICheck, warning: IAlert, info: IInfo }

/* ---- local date helpers ----------------------------------------------------
 * The service serialises every date as a plain `YYYY-MM-DD` key. We re-parse
 * them into LOCAL-midnight Dates here because the calendar builds its cell dates
 * with `new Date(y, m, d)` (also local); comparing like-with-like keeps phase
 * colouring on the right day. All comparisons are date-only (never on the wall
 * clock), so no timezone can shift a cell. */
const dateFromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const stripT = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const between = (d: Date, a: Date, b: Date) => stripT(d) >= stripT(a) && stripT(d) <= stripT(b)

/** Rebuild the calendar's getPhase from the serialised prediction + logged
 *  history (the service's own getPhase is server-only, so we mirror it here). */
function makeGetPhase(prediction: CyclePrediction, periods: PeriodEntry[]): (d: Date) => Phase {
  const { avgCycle, avgPeriod } = prediction
  const firstNext = dateFromKey(prediction.nextStart)
  const history = periods.map((p) => ({ start: dateFromKey(p.start), length: p.length }))
  // ~13 cycles forward covers a year of calendar navigation.
  const future = Array.from({ length: 13 }, (_, k) => {
    const start = addDays(firstNext, avgCycle * k)
    const ovulation = addDays(start, -14)
    return {
      start,
      end: addDays(start, avgPeriod - 1),
      ovulation,
      fertileStart: addDays(ovulation, -5),
      pmsStart: addDays(start, -5),
      pmsEnd: addDays(start, -1),
    }
  })
  return (date: Date): Phase => {
    // Logged periods win as solid bands; predicted windows fill the rest.
    for (const h of history) {
      if (between(date, h.start, addDays(h.start, h.length - 1))) return 'period'
    }
    for (const c of future) {
      if (between(date, c.start, c.end)) return 'predicted'
      if (stripT(date) === stripT(c.ovulation)) return 'ovulation'
      if (between(date, c.fertileStart, addDays(c.ovulation, -1))) return 'fertile'
      if (between(date, c.pmsStart, c.pmsEnd)) return 'pms'
    }
    return null
  }
}

type DashProps = CycleData & { userName?: string | null }

export function UserDashboard(props: DashProps) {
  const { needsData, prediction, upcomingEvents, cycleLengthTrend, insights, symptomLog, periods, today, userName } =
    props

  const firstName = (userName ?? '').trim().split(' ')[0] || 'there'

  // The calendar opens on the current month, and getPhase is derived from the
  // user's own data. Memoised so navigation doesn't rebuild the closure.
  const todayDate = useMemo(() => dateFromKey(today), [today])
  const getPhase = useMemo(() => makeGetPhase(prediction, periods), [prediction, periods])
  const nextLabel = prediction.nextStartLabel

  // First-run: no periods logged yet. Show a friendly prompt + the logger.
  if (needsData) {
    return (
      <Shell variant="user" title={`Hello, ${firstName}`} subtitle="Let’s get your cycle set up">
        <div className="dash-grid">
          <div className="col-12">
            <div className="predict-hero">
              <div className="ph-copy">
                <span className="ph-eyebrow">Welcome</span>
                <h2>Log your first period</h2>
                <p className="ph-sub">
                  Once you tell us when your last period started, we’ll predict your next one, map your
                  fertile and PMS windows, and keep your calendar in sync — all from your own data.
                </p>
              </div>
            </div>
          </div>
          <div className="col-12">
            <CycleLogger firstRun />
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell variant="user" title={`Hello, ${firstName}`} subtitle="Here is your cycle at a glance">
      <div className="dash-grid">
        {/* prediction hero */}
        <div className="col-12">
          <div className="predict-hero">
            <div className="ph-copy">
              <span className="ph-eyebrow">Your prediction</span>
              <h2>Period in {prediction.daysUntilNext} days</h2>
              <p className="ph-sub">
                Expected around {nextLabel}. You are on day {prediction.cycleDay} of your cycle, with{' '}
                {prediction.confidence}% confidence from your logged history.
              </p>
              <div className="ph-chips">
                <div className="ph-chip"><b>{nextLabel}</b><span>Next period</span></div>
                <div className="ph-chip"><b>Day {prediction.cycleDay}</b><span>Current cycle</span></div>
                <div className="ph-chip"><b>{prediction.avgCycle} days</b><span>Avg length</span></div>
              </div>
            </div>
            <div className="ph-ring">
              <ProgressRing
                value={prediction.cycleDay / prediction.avgCycle}
                size={152}
                thickness={13}
                color="#FDB817"
                label={`Day ${prediction.cycleDay}`}
                sub={`of ~${prediction.avgCycle}`}
              />
            </div>
          </div>
        </div>

        {/* calendar */}
        <div className="col-7" id="cycle">
          <div className="panel pad-lg">
            <div className="panel-head">
              <div><h3>Cycle calendar</h3><div className="sub">Logged and predicted phases</div></div>
            </div>
            <CycleCalendar
              initialYear={todayDate.getFullYear()}
              initialMonth={todayDate.getMonth()}
              today={todayDate}
              getPhase={getPhase}
            />
          </div>
        </div>

        {/* upcoming + confidence */}
        <div className="col-5">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head">
              <div><h3>Upcoming</h3><div className="sub">Predicted, {prediction.confidence}% confidence</div></div>
            </div>
            <div style={{ display: 'grid', placeItems: 'center', marginBottom: 8 }}>
              <ProgressRing value={prediction.confidence / 100} size={118} thickness={11} color={C.forest} label={`${prediction.confidence}%`} sub="confidence" />
            </div>
            <div>
              {upcomingEvents.map((e) => (
                <div className="insight" key={e.label}>
                  <span className="insight-dot" style={{ background: `${PHASE[e.phase]}22`, color: PHASE[e.phase] }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: PHASE[e.phase] }} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <b>{e.label}</b>
                    <p>{e.range}{e.days > 0 ? ` · in ${e.days} day${e.days === 1 ? '' : 's'}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* cycle length trend */}
        <div className="col-7">
          <div className="panel pad-lg">
            <div className="panel-head">
              <div><h3>Cycle length trend</h3><div className="sub">Last 6 cycles, in days</div></div>
            </div>
            <AreaChart
              labels={cycleLengthTrend.labels}
              series={[{ name: 'Cycle length', color: C.forest, points: cycleLengthTrend.values }]}
              height={216}
              yFormat={(n) => `${n}d`}
            />
          </div>
        </div>

        {/* insights */}
        <div className="col-5">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><div><h3>This cycle</h3><div className="sub">Personalised for you</div></div></div>
            {insights.map((it) => {
              const Icon = toneIcon[it.tone]
              return (
                <div className={`insight tone-${it.tone}`} key={it.title}>
                  <span className="insight-dot"><Icon /></span>
                  <div><b>{it.title}</b><p>{it.body}</p></div>
                </div>
              )
            })}
          </div>
        </div>

        {/* symptoms */}
        <div className="col-5">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><div><h3>How you have felt</h3><div className="sub">Logged this cycle</div></div></div>
            {symptomLog.length ? (
              <div className="symptoms">
                {symptomLog.map((s) => (
                  <div className="symp" key={s.day}>
                    <span className="sname">{s.day}</span>
                    <span className="sdots">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className={`sdot${i < s.level ? ' on' : ''}`} />
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>
                No symptoms logged yet. Add one below to start tracking how you feel across your cycle.
              </p>
            )}
          </div>
        </div>

        {/* reorder */}
        <div className="col-7">
          <div className="sub-card" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <span className="stag">Smart reorder</span>
            <h3>Running low before your period?</h3>
            <p style={{ color: 'var(--muted)', fontSize: '.92rem', margin: '4px 0 18px', maxWidth: '42ch' }}>
              Based on your cycle, your 330mm Double Wings usually run out around {nextLabel}. Reorder now so
              you are covered.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/product/p330dw" className="btn btn-primary"><ILeaf /> Reorder now</Link>
              <Link to="/account" className="btn btn-ghost">Manage subscription</Link>
            </div>
          </div>
        </div>

        {/* logging */}
        <div className="col-12">
          <CycleLogger />
        </div>
      </div>
    </Shell>
  )
}

/* ---- logging forms ---------------------------------------------------------
 * Period + symptom loggers. Both POST to /api/cycle/* and, on success, call
 * router.refresh() so the server component re-runs getCycleData and the whole
 * dashboard recomputes from the new row — no client-side cycle math needed. */

const SYMPTOM_OPTIONS = ['Cramps', 'Mood', 'Energy', 'Sleep', 'Bloating', 'Headache']

function CycleLogger({ firstRun = false }: { firstRun?: boolean }) {
  const router = useRouter()
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const [startDate, setStartDate] = useState('')
  const [lengthDays, setLengthDays] = useState(5)
  const [symptom, setSymptom] = useState(SYMPTOM_OPTIONS[0])
  const [level, setLevel] = useState(2)

  const [busy, setBusy] = useState<'' | 'period' | 'symptom'>('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  async function submitPeriod(e: React.FormEvent) {
    e.preventDefault()
    if (!startDate) {
      setMsg({ tone: 'err', text: 'Pick the date your period started.' })
      return
    }
    setBusy('period')
    setMsg(null)
    try {
      const r = await fetch('/api/cycle/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, lengthDays }),
      })
      if (!r.ok) throw new Error('save failed')
      setStartDate('')
      setMsg({ tone: 'ok', text: 'Period logged. Your predictions are updated.' })
      router.refresh()
    } catch {
      setMsg({ tone: 'err', text: 'Could not save that. Please try again.' })
    } finally {
      setBusy('')
    }
  }

  async function submitSymptom(e: React.FormEvent) {
    e.preventDefault()
    setBusy('symptom')
    setMsg(null)
    try {
      const r = await fetch('/api/cycle/symptoms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayISO, symptom, level }),
      })
      if (!r.ok) throw new Error('save failed')
      setMsg({ tone: 'ok', text: `Logged ${symptom.toLowerCase()} for today.` })
      router.refresh()
    } catch {
      setMsg({ tone: 'err', text: 'Could not save that. Please try again.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="panel pad-lg">
      <div className="panel-head">
        <div>
          <h3>{firstRun ? 'Log your first period' : 'Log an entry'}</h3>
          <div className="sub">Everything you log refines your predictions</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: firstRun ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        {/* period */}
        <form onSubmit={submitPeriod} style={{ display: 'grid', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: '.9rem', fontWeight: 600 }}>
            When did your period start?
            <input
              type="date"
              value={startDate}
              max={todayISO}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
              required
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: '.9rem', fontWeight: 600 }}>
            How many days did it last?
            <input
              type="number"
              min={1}
              max={15}
              value={lengthDays}
              onChange={(e) => setLengthDays(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
              style={inputStyle}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy === 'period'}>
            {busy === 'period' ? 'Saving…' : 'Log period'}
          </button>
        </form>

        {/* symptom */}
        {!firstRun && (
          <form onSubmit={submitSymptom} style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: '.9rem', fontWeight: 600 }}>
              How are you feeling today?
              <select value={symptom} onChange={(e) => setSymptom(e.target.value)} style={inputStyle}>
                {SYMPTOM_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <div style={{ display: 'grid', gap: 6, fontSize: '.9rem', fontWeight: 600 }}>
              Intensity
              <div role="group" aria-label="Intensity" style={{ display: 'flex', gap: 8 }}>
                {[0, 1, 2, 3].map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => setLevel(n)}
                    aria-pressed={level === n}
                    style={{
                      ...inputStyle,
                      width: 44,
                      cursor: 'pointer',
                      fontWeight: 700,
                      background: level === n ? C.forest : '#fff',
                      color: level === n ? '#fff' : 'var(--ink, #0B2A5B)',
                      borderColor: level === n ? C.forest : undefined,
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-ghost" disabled={busy === 'symptom'}>
              {busy === 'symptom' ? 'Saving…' : 'Log symptom'}
            </button>
          </form>
        )}
      </div>

      {msg && (
        <p
          role={msg.tone === 'err' ? 'alert' : 'status'}
          style={{ marginTop: 14, fontSize: '.9rem', color: msg.tone === 'err' ? C.clay : C.forest }}
        >
          {msg.text}
        </p>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1.5px solid rgba(11,42,91,.16)',
  fontSize: '.95rem',
  fontFamily: 'inherit',
  background: '#fff',
  color: 'var(--ink, #0B2A5B)',
}
