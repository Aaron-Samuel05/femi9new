import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from './Icons'
import { PRODUCTS } from '../data/products'

const slides = [
  {
    id: 'p330dw',
    eyebrow: 'FEMI9 SANITARY PADS',
    title: 'Periods.',
    accent: 'But Softer, Brighter.',
    note: 'Ultra-thin. Ultra-comfortable. Made for real life.',
  },
  {
    id: 'p290l9',
    eyebrow: 'FEMI9 SANITARY PADS',
    title: 'Everyday.',
    accent: 'Comfort, Reimagined.',
    note: 'Light, breathable protection for your everyday cycle.',
  },
  {
    id: 'p330cw',
    eyebrow: 'FEMI9 SANITARY PADS',
    title: 'Protection.',
    accent: 'Without The Bulk.',
    note: 'Extra length, secure wings and a soft cotton finish.',
  },
  {
    id: 'p290l3',
    eyebrow: 'FEMI9 SANITARY PADS',
    title: 'Try Femi9.',
    accent: 'Feel The Difference.',
    note: 'Three pads to discover a softer period-care routine.',
  },
]

export function Hero() {
  const [active, setActive] = useState(0)
  const touchStart = useRef<number | null>(null)
  const slide = slides[active]
  const product = PRODUCTS.find((item) => item.id === slide.id) ?? PRODUCTS[0]

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
      className="hero hero-apple"
      aria-labelledby="hero-title"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return
        const end = event.changedTouches[0]?.clientX ?? touchStart.current
        const delta = end - touchStart.current
        touchStart.current = null
        if (Math.abs(delta) > 45) delta < 0 ? next() : previous()
      }}
    >
      <div className="hero-apple-bg" aria-hidden="true" />
      <div className="hero-apple-ribbon hero-apple-ribbon-a" aria-hidden="true" />
      <div className="hero-apple-ribbon hero-apple-ribbon-b" aria-hidden="true" />

      <div className="hero-apple-inner">
        <div className="hero-apple-stage">
          <div className="hero-apple-product" key={product.id}>
            <div className="hero-apple-product-glow" aria-hidden="true" />
            <div className="hero-apple-product-shadow" aria-hidden="true" />
            <img
              src={product.img}
              alt={`${product.name} Femi9 sanitary pads`}
              width={1200}
              height={800}
              fetchPriority={active === 0 ? 'high' : 'auto'}
              draggable={false}
            />
          </div>

          <button
            className="hero-apple-arrow hero-apple-arrow-prev"
            type="button"
            onClick={previous}
            aria-label="Previous product"
          >
            ‹
          </button>
          <button
            className="hero-apple-arrow hero-apple-arrow-next"
            type="button"
            onClick={next}
            aria-label="Next product"
          >
            ›
          </button>
        </div>

        <div className="hero-apple-bottom">
          <div className="hero-apple-copy">
            <span className="hero-apple-eyebrow">{slide.eyebrow}</span>
            <h1 id="hero-title">
              <span>{slide.title}</span>
              <strong>{slide.accent}</strong>
            </h1>
            <p>{slide.note}</p>
          </div>

          <div className="hero-apple-buybar">
            <div className="hero-apple-price">
              <b>From Rs.{product.price.toLocaleString('en-IN')}</b>
              <span>{product.meta} · {product.flow}</span>
            </div>
            <a href={`/product/${product.id}`} className="hero-apple-buy">
              Shop Now <ArrowRight />
            </a>
          </div>
        </div>

        <div className="hero-apple-controls">
          <div className="hero-apple-dots" aria-label="Hero products">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === active ? 'active' : ''}
                onClick={() => setActive(index)}
                aria-label={`Show ${item.id}`}
                aria-current={index === active ? 'true' : undefined}
              />
            ))}
          </div>
          <div className="hero-apple-tomorrow">
            <span aria-hidden="true" />
            <p>A BRIGHTER TOMORROW<br />FOR EVERY WOMAN</p>
          </div>
        </div>
      </div>
    </section>
  )
}
