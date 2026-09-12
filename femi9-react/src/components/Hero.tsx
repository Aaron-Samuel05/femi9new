import { ArrowRight, Bag, Leaf, Recycle } from './Icons'

const featureItems = [
  { icon: Leaf, title: 'Certified', text: 'Organic Cotton' },
  { icon: Recycle, title: 'Toxin-Free', text: '& Safe' },
  { icon: Leaf, title: 'Breathable', text: 'Comfort' },
  { icon: Bag, title: 'Made For', text: 'Everyday Movement' },
]

export function Hero() {
  return (
    <section className="hero hero-premium" aria-labelledby="hero-title">
      <div className="hero-premium-glow hero-premium-glow-a" aria-hidden="true" />
      <div className="hero-premium-glow hero-premium-glow-b" aria-hidden="true" />
      <div className="hero-premium-ribbon hero-premium-ribbon-a" aria-hidden="true" />
      <div className="hero-premium-ribbon hero-premium-ribbon-b" aria-hidden="true" />

      <div className="wrap hero-premium-in">
        <div className="hero-premium-heading">
          <span className="hero-premium-kicker">F E M I 9&nbsp;&nbsp; S A N I T A R Y&nbsp;&nbsp; P A D S</span>
          <h1 id="hero-title">
            <span>Periods.</span>
            <strong>But Softer, Brighter.</strong>
          </h1>
          <p>Ultra-thin. Ultra-comfortable. Made for real life.</p>
        </div>

        <div className="hero-premium-stage">
          <div className="hero-premium-wordmark" aria-hidden="true">Femi9</div>

          <div className="hero-premium-feature-column hero-premium-feature-left">
            {featureItems.slice(0, 3).map(({ icon: Icon, title, text }) => (
              <div className="hero-premium-feature" key={`${title}-${text}`}>
                <span className="hero-premium-feature-icon"><Icon /></span>
                <span><b>{title}</b><em>{text}</em></span>
              </div>
            ))}
          </div>

          <div className="hero-premium-product">
            <div className="hero-premium-product-shadow" aria-hidden="true" />
            <div className="hero-premium-platform" aria-hidden="true" />
            <img
              src="/assets/img/hero.jpg"
              alt="Femi9 sanitary pad and product pack"
              width={920}
              height={1150}
              fetchPriority="high"
            />
          </div>

          <div className="hero-premium-feature-column hero-premium-feature-right">
            <div className="hero-premium-handwritten" aria-hidden="true">Comfort<br />in every move ♡</div>
            <div className="hero-premium-feature">
              <span className="hero-premium-feature-icon"><Recycle /></span>
              <span><b>Leak</b><em>Protection</em></span>
            </div>
            <div className="hero-premium-feature">
              <span className="hero-premium-feature-icon"><Leaf /></span>
              <span><b>Skin-Friendly</b><em>pH Balanced</em></span>
            </div>
            <div className="hero-premium-feature">
              <span className="hero-premium-feature-icon"><Bag /></span>
              <span><b>Made For</b><em>Everyday Movement</em></span>
            </div>
          </div>
        </div>

        <div className="hero-premium-footer">
          <div className="hero-premium-message">
            <span>CONFIDENCE IN EVERY MOVE</span>
            <h2>Made for her.<br />Made for every day.</h2>
            <a href="#products" className="btn btn-primary">Shop Now <ArrowRight /></a>
          </div>

          <div className="hero-premium-dots" aria-label="Hero carousel">
            <button className="active" aria-label="Slide 1" />
            <button aria-label="Slide 2" />
            <button aria-label="Slide 3" />
            <button aria-label="Slide 4" />
          </div>

          <div className="hero-premium-tomorrow">
            <span />
            <p>A BRIGHTER TOMORROW<br />FOR EVERY WOMAN</p>
          </div>
        </div>
      </div>
    </section>
  )
}
