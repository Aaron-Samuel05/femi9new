import { ArrowRight } from './Icons'

const HERO_PRODUCT = {
  name: 'Femi9 330mm Extra-Large Double Wings',
  image: '/assets/img/prod-330-double.jpg',
  alt: 'Femi9 330mm Extra-Large sanitary pads with double wings',
}

export function Hero() {
  return (
    <section className="hero hero-product-first hero-single-product" aria-labelledby="hero-title">
      <div className="hero-apple-atmosphere" aria-hidden="true" />
      <div className="hero-fabric hero-fabric-left" aria-hidden="true" />
      <div className="hero-fabric hero-fabric-right" aria-hidden="true" />
      <div className="hero-petal hero-petal-one" aria-hidden="true" />
      <div className="hero-petal hero-petal-two" aria-hidden="true" />

      <div className="hero-apple-inner">
        <div className="hero-single-copy">
          <span className="hero-apple-eyebrow">NATURAL CARE FOR A BRIGHTER TOMORROW</span>
          <h1 id="hero-title">
            <span>Periods.</span>
            <strong>But Softer, Brighter<span className="hero-dot">.</span></strong>
          </h1>
          <p className="hero-apple-note">Ultra-thin. Ultra-comfortable. Made for real life.</p>
        </div>

        <div className="hero-single-stage">
          <div className="hero-single-halo" aria-hidden="true" />
          <div className="hero-single-ground" aria-hidden="true" />
          <div className="hero-single-product">
            <img
              src={HERO_PRODUCT.image}
              alt={HERO_PRODUCT.alt}
              width={1200}
              height={800}
              fetchPriority="high"
              draggable={false}
            />
          </div>
        </div>

        <div className="hero-single-action">
          <a href="/product-options/p330dw" className="hero-buy-now">
            Buy Now <span><ArrowRight /></span>
          </a>
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
