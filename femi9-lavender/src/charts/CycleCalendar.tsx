import { useState } from 'react'
import { PHASE } from './theme'

export type Phase = 'period' | 'predicted' | 'fertile' | 'ovulation' | 'pms' | null

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const PHASE_LABEL: Record<string, string> = {
  period: 'Period', predicted: 'Predicted period', fertile: 'Fertile window', ovulation: 'Ovulation', pms: 'PMS window',
}

function cellStyle(phase: Phase): React.CSSProperties {
  switch (phase) {
    case 'period': return { background: PHASE.period, color: '#fff' }
    case 'ovulation': return { background: PHASE.ovulation, color: '#fff' }
    case 'fertile': return { background: 'rgba(127,208,200,.34)', color: '#0B2A5B' }
    case 'pms': return { background: 'rgba(231,184,92,.32)', color: '#0B2A5B' }
    case 'predicted': return { background: 'transparent', color: PHASE.period, boxShadow: `inset 0 0 0 1.5px ${PHASE.period}`, borderStyle: 'dashed' }
    default: return {}
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

export function CycleCalendar({
  initialYear,
  initialMonth,
  today,
  getPhase,
}: {
  initialYear: number
  initialMonth: number
  today: Date
  getPhase: (d: Date) => Phase
}) {
  const [{ y, m }, setYM] = useState({ y: initialYear, m: initialMonth })
  const [hover, setHover] = useState<{ date: Date; phase: Phase } | null>(null)

  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const todayIso = iso(today)

  const move = (delta: number) => {
    const d = new Date(y, m + delta, 1)
    setYM({ y: d.getFullYear(), m: d.getMonth() })
  }

  const legend = [
    ['period', PHASE.period], ['predicted', PHASE.predicted], ['fertile', PHASE.fertile], ['ovulation', PHASE.ovulation], ['pms', PHASE.pms],
  ] as const

  return (
    <div className="cal">
      <div className="cal-head">
        <button className="cal-nav" onClick={() => move(-1)} aria-label="Previous month">‹</button>
        <div className="cal-title">
          <b>{MONTHS[m]} {y}</b>
          <span>{hover ? `${hover.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} · ${hover.phase ? PHASE_LABEL[hover.phase] : 'No entry'}` : 'Hover a day for details'}</span>
        </div>
        <button className="cal-nav" onClick={() => move(1)} aria-label="Next month">›</button>
      </div>

      <div className="cal-grid cal-week">
        {WEEK.map((w, i) => (
          <span key={i} className="cal-wd">{w}</span>
        ))}
      </div>
      <div className="cal-grid">
        {Array.from({ length: first }).map((_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const date = new Date(y, m, i + 1)
          const phase = getPhase(date)
          const isToday = iso(date) === todayIso
          return (
            <button
              key={i}
              className={`cal-day${isToday ? ' today' : ''}${phase ? ' has-phase' : ''}`}
              style={cellStyle(phase)}
              onMouseEnter={() => setHover({ date, phase })}
              onMouseLeave={() => setHover(null)}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      <div className="cal-legend">
        {legend.map(([k, col]) => (
          <span key={k} className="cl-item">
            <span className="cl-sw" style={{ background: col as string }} />
            {PHASE_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  )
}
