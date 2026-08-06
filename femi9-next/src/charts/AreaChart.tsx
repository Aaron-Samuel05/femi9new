import { useMemo, useState, type CSSProperties } from 'react'
import { useSize, scale, niceTicks, smoothPath } from './util'
import { INK } from './theme'

export interface Series {
  name: string
  color: string
  points: number[]
}

interface Props {
  labels: string[]
  series: Series[]
  height?: number
  yFormat?: (n: number) => string
  area?: boolean
  /** index at which values become a (dashed) forecast */
  forecastFrom?: number
}

const padL = 46
const padR = 14
const padT = 14
const padB = 28

export function AreaChart({ labels, series, height = 240, yFormat = String, area = true, forecastFrom }: Props) {
  const { ref, width } = useSize<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const ticks = useMemo(() => {
    const max = Math.max(1, ...series.flatMap((s) => s.points))
    return niceTicks(max, 4)
  }, [series])
  const top = ticks[ticks.length - 1]

  if (width < 10) return <div className="chart" ref={ref} style={{ height }} />

  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const n = labels.length
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = scale(0, top, padT + innerH, padT)

  const xTickEvery = Math.max(1, Math.ceil(n / 7))

  const onMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const rel = e.clientX - rect.left - padL
    const i = Math.round((rel / innerW) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, i)))
  }

  const tipStyle: CSSProperties | undefined =
    active != null ? { left: x(active), top: padT } : undefined

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`ag-${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {/* gridlines + y labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth={1} />
            <text x={padL - 10} y={y(t) + 4} textAnchor="end" className="axis-y">
              {yFormat(t)}
            </text>
          </g>
        ))}

        {/* forecast band */}
        {forecastFrom != null && forecastFrom < n - 1 && (
          <rect x={x(forecastFrom)} y={padT} width={width - padR - x(forecastFrom)} height={innerH} fill={INK.grid} opacity={0.6} />
        )}

        {/* x labels */}
        {labels.map((l, i) =>
          i % xTickEvery === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="axis-label">
              {l}
            </text>
          ) : null,
        )}

        {/* series */}
        {series.map((s, si) => {
          const pts = s.points.map((v, i) => ({ x: x(i), y: y(v) }))
          const solidPts = forecastFrom != null ? pts.slice(0, forecastFrom + 1) : pts
          const dashPts = forecastFrom != null ? pts.slice(forecastFrom) : []
          const linePath = smoothPath(solidPts)
          const areaPath =
            area && series.length === 1
              ? `${smoothPath(solidPts)} L${solidPts[solidPts.length - 1].x},${y(0)} L${solidPts[0].x},${y(0)} Z`
              : ''
          return (
            <g key={si}>
              {areaPath && <path d={areaPath} fill={`url(#ag-${si})`} />}
              <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              {dashPts.length > 1 && (
                <path d={smoothPath(dashPts)} fill="none" stroke={s.color} strokeWidth={2.4} strokeDasharray="2 6" strokeLinecap="round" opacity={0.85} />
              )}
            </g>
          )
        })}

        {/* hover crosshair + markers */}
        {active != null && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={padT} y2={padT + innerH} stroke={INK.axis} strokeWidth={1} strokeDasharray="3 4" />
            {series.map((s, si) => (
              <circle key={si} cx={x(active)} cy={y(s.points[active])} r={4.5} fill="#fff" stroke={s.color} strokeWidth={2.5} />
            ))}
          </g>
        )}

        {/* capture layer */}
        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
        />
      </svg>

      {active != null && (
        <div className="tip" style={tipStyle}>
          <b>{labels[active]}</b>
          {series.map((s, si) => (
            <div className="row" key={si}>
              <span className="dot" style={{ background: s.color }} />
              {series.length > 1 && <span className="k">{s.name}</span>}
              <span className="v">{yFormat(s.points[active])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
