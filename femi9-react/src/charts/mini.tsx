import type { ReactNode } from 'react'
import { useSize, smoothPath, scale } from './util'
import { C } from './theme'

/* ---------- Legend ---------- */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((it) => (
        <span className="li" key={it.label}>
          <span className="sw" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/* ---------- Sparkline ---------- */
export function Sparkline({ data, color = C.forest, height = 40, fill = true }: { data: number[]; color?: string; height?: number; fill?: boolean }) {
  const { ref, width } = useSize<HTMLDivElement>()
  if (width < 4) return <div ref={ref} style={{ height, width: '100%' }} />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pad = 4
  const x = (i: number) => (i / (data.length - 1)) * width
  const y = scale(min, max, height - pad, pad)
  const pts = data.map((v, i) => ({ x: x(i), y: y(v) }))
  const line = smoothPath(pts)
  return (
    <div ref={ref} style={{ height, width: '100%' }}>
      <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
        {fill && (
          <>
            <defs>
              <linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.24} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#sp-${color.slice(1)})`} />
          </>
        )}
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ---------- ProgressRing / gauge ---------- */
export function ProgressRing({
  value,
  size = 132,
  thickness = 12,
  color = C.forest,
  label,
  sub,
}: {
  value: number
  size?: number
  thickness?: number
  color?: string
  label?: ReactNode
  sub?: string
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="donut-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(11,42,91,.08)" strokeWidth={thickness} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={`${v * c} ${c}`}
          />
        </g>
      </svg>
      <div className="donut-center" style={{ position: 'absolute' }}>
        <b>{label}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

/* ---------- RankBars (horizontal ranked list) ---------- */
export function RankBars({
  data,
  format = String,
}: {
  data: { label: string; value: number; color?: string }[]
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="rankbars">
      {data.map((d) => (
        <div className="rankrow" key={d.label}>
          <span className="rlabel">{d.label}</span>
          <span className="rtrack">
            <span className="rfill" style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? C.forest }} />
          </span>
          <span className="rval">{format(d.value)}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------- StatTile ---------- */
export function StatTile({
  label,
  value,
  delta,
  spark,
  sparkColor = C.forest,
  icon,
}: {
  label: string
  value: ReactNode
  delta?: { value: number; dir: 'up' | 'down' }
  spark?: number[]
  sparkColor?: string
  icon?: ReactNode
}) {
  return (
    <div className="stat-tile">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {delta && (
          <span className={`delta ${delta.dir === 'up' ? 'up' : 'down'}`}>
            {delta.dir === 'up' ? '↑' : '↓'} {Math.abs(delta.value)}%
          </span>
        )}
        {spark && (
          <span className="stat-spark">
            <Sparkline data={spark} color={sparkColor} height={34} />
          </span>
        )}
      </div>
    </div>
  )
}
