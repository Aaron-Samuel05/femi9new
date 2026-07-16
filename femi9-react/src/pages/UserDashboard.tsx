import { Link } from 'react-router-dom'
import { Shell } from '../app/Shell'
import { CycleCalendar } from '../charts/CycleCalendar'
import { AreaChart } from '../charts/AreaChart'
import { ProgressRing } from '../charts/mini'
import { C, PHASE } from '../charts/theme'
import { prediction, getPhase, TODAY, cycleLengthTrend, insights, symptomLog, upcomingEvents } from '../data/cycle'
import { user } from '../data/account'
import { ICheck, IAlert, IInfo, ILeaf } from '../components/AppIcons'

const toneIcon = { good: ICheck, warning: IAlert, info: IInfo }
const nextLabel = prediction.nextStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })

export function UserDashboard() {
  return (
    <Shell variant="user" title={`Hello, ${user.name.split(' ')[0]}`} subtitle="Here is your cycle at a glance">
      <div className="dash-grid">
        {/* prediction hero */}
        <div className="col-12">
          <div className="predict-hero">
            <div className="ph-copy">
              <span className="ph-eyebrow">Your prediction</span>
              <h2>Period in {prediction.daysUntilNext} days</h2>
              <p className="ph-sub">
                Expected around {nextLabel}. You are on day {prediction.cycleDay} of your cycle and likely
                entering your PMS window tomorrow.
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
            <CycleCalendar initialYear={2026} initialMonth={6} today={TODAY} getPhase={getPhase} />
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
      </div>
    </Shell>
  )
}
