import { useMemo, useState } from 'react'
import { useSize, scale, niceTicks } from './util'
import { INK, C } from './theme'

export interface Bar {
  label: string
  value: number
  color?: string
}

interface Props {
  data: Bar[]
  height?: number
  yFormat?: (n: number) => string
  color?: string
}

const padL = 42
const padR = 12
const padT = 12
const padB = 26

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
}

export function BarChart({ data, height = 240, yFormat = String, color = C.forest }: Props) {
  const { ref, width } = useSize<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)

  const ticks = useMemo(() => niceTicks(Math.max(1, ...data.map((d) => d.value)), 4), [data])
  const top = ticks[ticks.length - 1]

  if (width < 10) return <div className="chart" ref={ref} style={{ height }} />

  const innerW = width - padL - padR
  const innerH = height - padT - padB
  const y = scale(0, top, padT + innerH, padT)
  const slot = innerW / data.length
  const bw = Math.min(46, slot * 0.62)

  return (
    <div className="chart" ref={ref} style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={INK.grid} strokeWidth={1} />
            <text x={padL - 10} y={y(t) + 4} textAnchor="end" className="axis-y">
              {yFormat(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2
          const bx = cx - bw / 2
          const bh = padT + innerH - y(d.value)
          const on = active === i
          return (
            <g key={i} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
              <rect x={bx - 3} y={padT} width={bw + 6} height={innerH} fill="transparent" />
              <path
                d={roundedTop(bx, y(d.value), bw, bh, 4)}
                fill={d.color ?? color}
                opacity={active == null || on ? 1 : 0.45}
              />
              <text x={cx} y={height - 8} textAnchor="middle" className="axis-label">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>

      {active != null && (
        <div
          className="tip"
          style={{ left: padL + slot * active + slot / 2, top: y(data[active].value) }}
        >
          <b>{data[active].label}</b>
          <div className="row">
            <span className="dot" style={{ background: data[active].color ?? color }} />
            <span className="v">{yFormat(data[active].value)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
