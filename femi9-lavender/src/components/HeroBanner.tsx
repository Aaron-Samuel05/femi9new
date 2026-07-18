import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Hero } from './Hero'
import { PantyArt } from './PantyArt'
import { Bag, ArrowRight } from './Icons'

const SLIDE_MS = 6500
const N = 3

function PromoPanty() {
  return (
    <div className="hbanner-promo promo-panty">
      <div className="wrap hbanner-promo-in">
        <div className="hbanner-promo-copy">
          <span className="eyebrow">New in</span>
          <h2 className="display">Meet reusable Period Panties.</h2>
          <p>
            Soft organic cotton, a quiet leak-proof core and a breathable outer, washable up to
            40 times. A full night of comfort you can wear, wash and wear again.
          </p>
          <div className="hero-actions">
            <Link to="/product/ppanty" className="btn btn-primary"><Bag /> Shop panties</Link>
            <Link to="/periods-wall" className="btn btn-ghost">Read real stories</Link>
          </div>
        </div>
        <div className="hbanner-promo-art">
          <div className="promo-frame"><PantyArt variant="plum" /></div>
        </div>
      </div>
    </div>
  )
}

function PromoSub() {
  return (
    <div className="hbanner-promo promo-sub">
      <div className="wrap hbanner-promo-in">
        <div className="hbanner-promo-copy">
          <h2 className="display">Never run out. Save 15% every cycle.</h2>
          <p>
            Your Femi9 pack arrives about three days before your period, synced to your cycle, so
            you are always ready. Skip, pause or cancel anytime.
          </p>
          <div className="hero-actions">
            <Link to="/product/p330dw" className="btn btn-primary">Start a subscription</Link>
            <Link to="/#tracker" className="btn btn-ghost">Track my cycle</Link>
          </div>
        </div>
        <div className="hbanner-promo-art">
          <div className="promo-frame promo-frame--sub">
            <svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" role="presentation" aria-hidden="true">
              <circle cx="230" cy="120" r="120" fill="#ffffff" opacity=".22" />
              <circle cx="90" cy="300" r="120" fill="#563184" opacity=".08" />
              <g fill="none" stroke="#563184" strokeOpacity=".4" strokeWidth="2.5">
                <circle cx="160" cy="200" r="96" />
                <circle cx="160" cy="200" r="64" strokeOpacity=".25" />
              </g>
              <circle cx="160" cy="104" r="10" fill="#D8A22F" />
              <g transform="translate(160 200)">
                <rect x="-34" y="-26" width="68" height="52" rx="10" fill="#563184" fillOpacity=".9" />
                <path d="M-34 -8 h68" stroke="#FBF9FF" strokeWidth="3" strokeOpacity=".5" />
                <path d="M-10 -8 v-14 a10 10 0 0 1 20 0 v14" fill="none" stroke="#FBF9FF" strokeWidth="3" strokeOpacity=".55" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

export function HeroBanner() {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const startX = useRef<number | null>(null)

  const go = useCallback((idx: number) => setI(((idx % N) + N) % N), [])
  const next = useCallback(() => setI((v) => (v + 1) % N), [])

  useEffect(() => {
    if (paused) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(next, SLIDE_MS)
    return () => window.clearInterval(t)
  }, [paused, next, i])

  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX
  }
  const onUp = (e: React.PointerEvent) => {
    if (startX.current == null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (dx < -44) setI((v) => (v + 1) % N)
    else if (dx > 44) setI((v) => (v - 1 + N) % N)
  }

  return (
    <section
      className="hbanner"
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      // Focus pause, not just hover: pausing on hover alone is a hover-only
      // affordance, so keyboard users had no way to stop the rotation while
      // tabbing through the slide's links (WCAG 2.2.2). Capture phase so focus
      // anywhere inside the carousel counts.
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onPointerDown={onDown}
      onPointerUp={onUp}
    >
      <div className="hbanner-track" style={{ transform: `translateX(-${i * 100}%)` }}>
        <div className="hbanner-slide" aria-hidden={i !== 0}><Hero /></div>
        <div className="hbanner-slide" aria-hidden={i !== 1}><PromoPanty /></div>
        <div className="hbanner-slide" aria-hidden={i !== 2}><PromoSub /></div>
      </div>

      <div className="hbanner-dots" role="tablist" aria-label="Choose slide">
        {[0, 1, 2].map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === i}
            className={`hbanner-dot${d === i ? ' on' : ''}`}
            onClick={() => go(d)}
            aria-label={`Go to slide ${d + 1}`}
          />
        ))}
        <button className="hbanner-next" onClick={next} aria-label="Next slide"><ArrowRight /></button>
      </div>
    </section>
  )
}
