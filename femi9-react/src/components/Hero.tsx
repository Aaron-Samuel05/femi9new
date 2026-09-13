import { useEffect, useRef } from 'react'
import { ArrowRight } from './Icons'

const HERO_PRODUCT = {
  name: 'Femi9 330mm Extra-Large Double Wings',
  localImage: '/assets/img/prod-330-double.jpg',
  remoteImage: 'https://femi9.in/uploads/Product/1773300828_jFWVIMppz1.webp',
  alt: 'Femi9 330mm Extra-Large Double Wings sanitary pads',
}

export function Hero() {
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5
      stage.style.setProperty('--px', `${x * 14}px`)
      stage.style.setProperty('--py', `${y * 10}px`)
      stage.style.setProperty('--rx', `${-y * 4}deg`)
      stage.style.setProperty('--ry', `${x * 6}deg`)
    }

    const reset = () => {
      stage.style.setProperty('--px', '0px')
      stage.style.setProperty('--py', '0px')
      stage.style.setProperty('--rx', '0deg')
      stage.style.setProperty('--ry', '0deg')
    }

    stage.addEventListener('pointermove', onPointerMove)
    stage.addEventListener('pointerleave', reset)
    return () => {
      stage.removeEventListener('pointermove', onPointerMove)
      stage.removeEventListener('pointerleave', reset)
    }
  }, [])

  return (
    <section className="hero hero-product-first hero-single-product" aria-labelledby="hero-title">
      <div className="hero-apple-atmosphere" aria-hidden="true" />
      <div className="hero-apple-ribbon hero-apple-ribbon-left" aria-hidden="true" />
      <div className="hero-apple-ribbon hero-apple-ribbon-right" aria-hidden="true" />

      <div className="hero-apple-inner">
        <div className="hero-single-copy">
          <span className="hero-apple-eyebrow">NATURAL CARE FOR A BRIGHTER TOMORROW</span>
          <h1 id="hero-title">
            <span>Periods.</span>
            <strong>But Softer, Brighter<span className="hero-dot">.</span></strong>
          </h1>
          <p className="hero-apple-note">Ultra-thin. Ultra-comfortable. Made for real life.</p>
          <div className="hero-single-action">
            <a href="/product/p330dw" className="hero-buy-now">
              Buy Now <span><ArrowRight /></span>
            </a>
          </div>
          <div className="hero-single-product-meta">
            <span>330mm XL</span>
            <span>9 pads</span>
            <span>Double Wings</span>
            <strong>₹225</strong>
          </div>
        </div>

        <div ref={stageRef} className="hero-single-stage hero-pad-parallax">
          <div className="hero-single-halo" aria-hidden="true" />
          <div className="hero-single-ground" aria-hidden="true" />
          <div className="hero-product-media">
            <div className="hero-product-aura" aria-hidden="true" />
            <div className="hero-product-card">
              <div className="hero-product-card-glass" aria-hidden="true" />
              <img
                src={HERO_PRODUCT.localImage}
                alt={HERO_PRODUCT.alt}
                width={750}
                height={1000}
                fetchPriority="high"
                draggable={false}
                onError={(event) => {
                  const image = event.currentTarget
                  if (image.src !== HERO_PRODUCT.remoteImage) image.src = HERO_PRODUCT.remoteImage
                }}
              />
              <span className="hero-product-badge">330mm XL · DOUBLE WINGS</span>
            </div>
          </div>
          <span className="hero-pad-orbit orbit-one" aria-hidden="true" />
          <span className="hero-pad-orbit orbit-two" aria-hidden="true" />
        </div>

        <div className="hero-single-benefits" aria-label="Femi9 product benefits">
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
