import { useEffect, useState } from 'react'
import { ArrowRight, Bag, Leaf, Recycle } from './Icons'
import { PRODUCTS } from '../data/products'

const slides = [
  {
    id: 'p330dw',
    eyebrow: 'Femi9 330mm Double Wings',
    title: 'Periods.',
    accent: 'But Softer, Brighter.',
    note: 'Ultra-thin. Ultra-comfortable. Made for real life.',
  },
  {
    id: 'p290l9',
    eyebrow: 'Femi9 290mm Large',
    title: 'Everyday.',
    accent: 'Comfort, Reimagined.',
    note: 'Light, breathable protection for your everyday cycle.',
  },
  {
    id: 'p330cw',
    eyebrow: 'Femi9 330mm Centre Wings',
    title: 'Protection.',
    accent: 'Without The Bulk.',
    note: 'Extra length, secure wings and a soft cotton finish.',
  },
  {
    id: 'p290l3',
    eyebrow: 'Femi9 290mm Starter',
    title: 'Try Femi9.',
    accent: 'Feel The Difference.',
    note: 'Three pads to discover a softer period-care routine.',
  },
]

const features = [
  { icon: Leaf, title: 'Organic cotton' },
  { icon: Recycle, title: 'Breathable comfort' },
  { icon: Bag, title: 'Made for movement' },
]

export function Hero() {
  const [active, setActive] = useState(0)
  const slide = slides[active]
  const product = PRODUCTS.find((item) => item.id === slide.id) ?? PRODUCTS[0]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setActive((value) => (value + 1) % slides.length)
      if (event.key === 'ArrowLeft') setActive((value) => (value - 1 + slides.length) % slides.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className="hero hero-apple" aria-labelledby="hero-title">
      <div className="hero-apple-bg" aria-hidden="true" />
      <div className="hero-apple-glow hero-apple-glow-left" aria-hidden="true" />
      <div className="hero-apple-glow hero-apple-glow-right" aria-hidden="true" />
      <div className="hero-apple-wordmark" aria-hidden="true">Femi9</div>

      <div className="hero-apple-inner">
        <div className="hero-apple-stage">
          <div className="hero-apple-kicker">{slide.eyebrow}</div>

          <div className="hero-apple-product" key={product.id}>
            <div className="hero-apple-product-halo" aria-hidden="true" />
            <div className="hero-apple-product-shadow" aria-hidden="true" />
            <img
              src={product.img}
              alt={`${product.name} Femi9 sanitary pads`}
              width={1200}
              height={800}
              fetchPriority={active === 0 ? 'high' : 'auto'}
            />
          </div>

          <div className="hero-apple-features" aria-label="Femi9 benefits">
            {features.map(({ icon: Icon, title }) => (
              <span key={title}>
                <Icon />
                {title}
              </span>
            ))}
          </div>

          <button
            className="hero-apple-arrow hero-apple-arrow-prev"
            type="button"
            onClick={() => setActive((value) => (value - 1 + slides.length) % slides.length)}
            aria-label="Previous product"
          >
            ‹
          </button>
          <button
            className="hero-apple-arrow hero-apple-arrow-next"
            type="button"
            onClick={() => setActive((value) => (value + 1) % slides.length)}
            aria-label="Next product"
          >
            ›
          </button>
        </div>

        <div className="hero-apple-bottom">
          <div className="hero-apple-copy">
            <h1 id="hero-title">
              <span>{slide.title}</span>
              <strong>{slide.accent}</strong>
            </h1>
            <p>{slide.note}</p>
          </div>

          <div className="hero-apple-buybar">
            <div>
              <b>From Rs.{product.price.toLocaleString('en-IN')}</b>
              <span>{product.meta} · {product.flow}</span>
            </div>
            <a href={`/product/${product.id}`} className="hero-apple-buy">Shop Now <ArrowRight /></a>
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
                aria-label={`Show ${item.eyebrow}`}
                aria-current={index === active ? 'true' : undefined}
              />
            ))}
          </div>
          <span className="hero-apple-availability">Available now · Free delivery over Rs.999</span>
        </div>
      </div>
    </section>
  )
}
