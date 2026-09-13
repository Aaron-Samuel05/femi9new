import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from './Icons'
import { PRODUCTS } from '../data/products'

const slides = [
  { id: 'p330dw', eyebrow: 'NATURAL CARE FOR A BRIGHTER TOMORROW', title: 'Periods.', accent: 'But Softer, Brighter.', note: 'Ultra-thin. Ultra-comfortable. Made for real life.' },
  { id: 'p290l9', eyebrow: 'EVERYDAY COMFORT, REIMAGINED', title: 'Everyday.', accent: 'Comfort, Reimagined.', note: 'Light, breathable protection made for real life.' },
  { id: 'p330cw', eyebrow: 'PROTECTION WITHOUT THE BULK', title: 'Protection.', accent: 'Without The Bulk.', note: 'Extra length, secure wings and a soft cotton finish.' },
  { id: 'p290l3', eyebrow: 'START WITH SOMETHING SOFTER', title: 'Try Femi9.', accent: 'Feel The Difference.', note: 'A simple starter pack for your period-care routine.' },
]

export function Hero() {
  const [active, setActive] = useState(0)
  const touchStart = useRef<number | null>(null)
  const product = PRODUCTS.find((item) => item.id === slides[active].id) ?? PRODUCTS[0]

  const next = () => setActive((value) => (value + 1) % slides.length)
  const previous = () => setActive((value) => (value - 1 + slides.length) % slides.length)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') next()
      if (event.key === 'ArrowLeft') previous()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(next, 6500)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <section
      className="hero hero-apple hero-product-first"
      aria-labelledby="hero-title"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return
        const end = event.changedTouches[0]?.clientX ?? touchStart.current
        const distance = end - touchStart.current
        touchStart.current = null
        if (Math.abs(distance) > 45) distance < 0 ? next() : previous()
      }}
    >
      <div className="hero-apple-atmosphere" aria-hidden="true" />
      <div className="hero-apple-inner">
        <div className="hero-product-copy">
          <span className="hero-apple-eyebrow">{slides[active].eyebrow}</span>
          <h1 id="hero-title"><span>{slides[active].title}</span><strong>{slides[active].accent}</strong></h1>
          <p className="hero-apple-note">{slides[active].note}</p>
        </div>

        <div className="hero-product-stage">
          <div className="hero-product-halo" aria-hidden="true" />
          <div className="hero-product-backdrop" aria-hidden="true" />
          <div className="hero-product" key={product.id}>
            <img
              src={product.img}
              alt={`${product.name} by Femi9`}
              width={1200}
              height={800}
              fetchPriority={active === 0 ? 'high' : 'auto'}
              draggable={false}
            />
          </div>
          <div className="hero-product-caption" aria-live="polite">
            <span>{product.name}</span>
            <small>{product.meta} · {product.flow}</small>
          </div>
        </div>

        <div className="hero-product-actions">
          <a href={`/product-options/${product.id}`} className="hero-buy-now">
            Buy Now <span><ArrowRight /></span>
          </a>
          <div className="hero-product-switcher" aria-label="Choose a Femi9 product">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={index === active ? 'active' : ''}
                onClick={() => setActive(index)}
                aria-label={`Show ${PRODUCTS.find((item) => item.id === slide.id)?.name ?? slide.id}`}
                aria-current={index === active ? 'true' : undefined}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="hero-product-benefits" aria-label="Product benefits">
          <span><i>✦</i> Natural Comfort</span>
          <span><i>◌</i> Toxin-Free &amp; Safe</span>
          <span><i>≈</i> Breathable All Day</span>
          <span><i>✓</i> Leak Protection</span>
        </div>

        <div className="hero-scroll-cue" aria-hidden="true"><span>Scroll</span><i /></div>
      </div>
    </section>
  )
}
