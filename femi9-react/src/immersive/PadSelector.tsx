import { useId, useState } from 'react'

interface Level {
  name: string
  mm: number
  drops: number
  note: string
}

/** Real Femi9 lengths, spotting → overnight. */
const LEVELS: Level[] = [
  { name: 'Spotting', mm: 155, drops: 1, note: 'Panty-liner light' },
  { name: 'Light', mm: 240, drops: 2, note: 'Day one & tail end' },
  { name: 'Regular', mm: 280, drops: 3, note: 'Everyday flow' },
  { name: 'Heavy', mm: 330, drops: 4, note: 'Peak-day cover' },
  { name: 'Overnight', mm: 425, drops: 5, note: 'Back-to-back sleep' },
]

const CORE_LIGHT = '#F6D2BE'
const CORE_DEEP = '#B4573C'

function mix(a: string, b: string, t: number) {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const pa = parse(a)
  const pb = parse(b)
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('')
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const map = (n: number, a: number, b: number, c: number, d: number) =>
  c + ((n - a) / (b - a)) * (d - c)

/**
 * The Heavy-to-Light selector (spec §2). Drag from Spotting to Overnight and
 * the pad on screen answers in real time: it lengthens, its absorbent core
 * deepens in colour, the channel pattern thickens, and the droplet rating and
 * cross-section fill in. A tactile alternative to a boring dropdown.
 */
export function PadSelector() {
  const [v, setV] = useState(0.5) // 0..1 along the flow range
  const sliderId = useId()

  const n = LEVELS.length
  const idx = v * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, n - 1)
  const f = idx - lo
  const level = LEVELS[Math.round(idx)]
  const mm = Math.round(LEVELS[lo].mm + (LEVELS[hi].mm - LEVELS[lo].mm) * f)

  // pad geometry (viewBox 200 x 380)
  const bodyH = map(mm, 155, 425, 150, 330)
  const bodyY = (380 - bodyH) / 2
  const core = mix(CORE_LIGHT, CORE_DEEP, v)
  const channels = 3 + Math.round(v * 6) // 3..9 absorbency channels
  const thickness = map(v, 0, 1, 7, 26) // cross-section height in px

  return (
    <div className="pad-selector">
      <figure className="pad-stage" style={{ '--core': core } as React.CSSProperties}>
        <svg viewBox="0 0 200 380" className="pad-svg" role="img"
          aria-label={`${level.name} pad, ${mm} millimetres`}>
          <defs>
            <linearGradient id={`${sliderId}-sheen`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.35" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0.75" />
            </linearGradient>
          </defs>

          {/* wings */}
          <path
            d={`M60 ${190 - 26} C 18 ${190 - 40}, 18 ${190 + 40}, 60 ${190 + 26}
                L140 ${190 + 26} C 182 ${190 + 40}, 182 ${190 - 40}, 140 ${190 - 26} Z`}
            fill="#fff"
            stroke="rgba(11,42,91,.10)"
          />

          {/* pad body */}
          <rect x="60" y={bodyY} width="80" height={bodyH} rx="40" fill="#fff"
            stroke="rgba(11,42,91,.12)" />
          {/* absorbent core */}
          <rect x="70" y={bodyY + 12} width="60" height={bodyH - 24} rx="30"
            fill="var(--core)" opacity="0.92" />
          {/* channels */}
          {Array.from({ length: channels }).map((_, i) => {
            const y = bodyY + 26 + (i + 0.5) * ((bodyH - 52) / channels)
            return (
              <line key={i} x1="80" x2="120" y1={y} y2={y}
                stroke="#fff" strokeOpacity="0.45" strokeWidth="2" strokeLinecap="round" />
            )
          })}
          {/* top sheet sheen */}
          <rect x="60" y={bodyY} width="80" height={bodyH} rx="40"
            fill={`url(#${sliderId}-sheen)`} opacity="0.25" />
        </svg>

        <figcaption className="pad-readout">
          <span className="pad-name">{level.name}</span>
          <span className="pad-mm">{mm}<i>mm</i></span>
        </figcaption>
      </figure>

      <div className="pad-controls">
        <div className="pad-meta">
          <div className="pad-drops" aria-label={`${level.drops} of 5 absorbency`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={i < level.drops ? 'drop on' : 'drop'} />
            ))}
          </div>
          <p className="pad-note">{level.note}</p>
        </div>

        <div className="pad-thick" aria-hidden="true">
          <span className="pad-thick-label">ultra-thin</span>
          <span className="pad-thick-bar">
            <span className="pad-thick-fill" style={{ height: `${thickness}px` }} />
          </span>
          <span className="pad-thick-label">cushioned</span>
        </div>

        <label className="pad-slider" htmlFor={sliderId}>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={v}
            onChange={(e) => setV(clamp(Number(e.target.value), 0, 1))}
            style={{ '--v': v } as React.CSSProperties}
          />
          <span className="pad-slider-ends">
            <span>Spotting</span>
            <span>Heavy flow</span>
          </span>
        </label>
      </div>
    </div>
  )
}
