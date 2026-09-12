import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from './Icons'
import { PRODUCTS } from '../data/products'

const slides = [
  { id: 'p330dw', eyebrow: 'FEMI9 PERIOD CARE', title: 'Periods.', accent: 'But Softer, Brighter.', note: 'Ultra-thin comfort and dependable protection, designed for real life.' },
  { id: 'p290l9', eyebrow: 'FEMI9 PERIOD CARE', title: 'Everyday.', accent: 'Comfort, Reimagined.', note: 'Light, breathable protection for your everyday cycle.' },
  { id: 'p330cw', eyebrow: 'FEMI9 PERIOD CARE', title: 'Protection.', accent: 'Without The Bulk.', note: 'Extra length, secure wings and a soft cotton finish.' },
  { id: 'p290l3', eyebrow: 'FEMI9 PERIOD CARE', title: 'Try Femi9.', accent: 'Feel The Difference.', note: 'A simple starter pack for a softer period-care routine.' },
]

export function Hero() {
  const [active, setActive] = useState(0)
  const touchStart = useRef<number | null>(null)
  const slide = slides[active]
  const product = PRODUCTS.find((item) => item.id === slide.id) ?? PRODUCTS[0]
  const next = () => setActive((v) => (v + 1) % slides.length)
  const previous = () => setActive((v) => (v - 1 + slides.length) % slides.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') previous() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    const timer = window.setInterval(next, 6500)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section className="hero hero-apple" aria-labelledby="hero-title"
      onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientX ?? null }}
      onTouchEnd={(e) => { if (touchStart.current === null) return; const end = e.changedTouches[0]?.clientX ?? touchStart.current; const d = end - touchStart.current; touchStart.current = null; if (Math.abs(d) > 45) d < 0 ? next() : previous() }}>
      <div className="hero-apple-glow" aria-hidden="true" />
      <div className="hero-apple-inner">
        <div className="hero-apple-copy">
          <span className="hero-apple-eyebrow">{slide.eyebrow}</span>
          <h1 id="hero-title"><span>{slide.title}</span><strong>{slide.accent}</strong></h1>
          <div className="hero-apple-rating" aria-label="Rated 4.9 out of 5 by 2700 plus customers"><span>★★★★★</span><p>Rated 4.9/5 by 2700+ customers</p></div>
          <p className="hero-apple-note">{slide.note}</p>
          <a href={`/product/${product.id}`} className="hero-apple-main-cta">Shop Femi9 <span><ArrowRight /></span></a>
        </div>

        <div className="hero-apple-stage">
          <div className="hero-apple-orbit" aria-hidden="true"><i /><i /><i /></div>
          <div className="hero-apple-product" key={product.id}>
            <div className="hero-apple-product-glow" aria-hidden="true" />
            <img src={product.img} alt={`${product.name} Femi9 sanitary pads`} width={1200} height={800} fetchPriority={active === 0 ? 'high' : 'auto'} draggable={false} />
          </div>
          <button className="hero-apple-arrow hero-apple-arrow-prev" type="button" onClick={previous} aria-label="Previous product">‹</button>
          <button className="hero-apple-arrow hero-apple-arrow-next" type="button" onClick={next} aria-label="Next product">›</button>
        </div>

        <div className="hero-apple-purchase">
          <div><b>From Rs.{product.price.toLocaleString('en-IN')}</b><span>{product.meta} · {product.flow}</span></div>
          <a href={`/product/${product.id}`}>Buy now <ArrowRight /></a>
        </div>
        <div className="hero-apple-controls">
          <div className="hero-apple-dots" aria-label="Hero products">{slides.map((item, i) => <button key={item.id} type="button" className={i === active ? 'active' : ''} onClick={() => setActive(i)} aria-label={`Show ${item.id}`} aria-current={i === active ? 'true' : undefined} />)}</div>
          <span className="hero-apple-signature">A BRIGHTER TOMORROW · FOR EVERY WOMAN</span>
        </div>
      </div>
    </section>
  )
}
