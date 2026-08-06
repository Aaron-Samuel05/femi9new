import { Bag, Leaf, Recycle } from './Icons'

export function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-in">
        <div className="hero-copy">
          <h1>
            Organic pads that feel like <span className="accent">nothing at all.</span>
          </h1>
          <p className="hero-sub">
            Ultra-thin, breathable cotton pads with a mood-lifting anion strip. Toxin-free,
            biodegradable, and made for real life.
          </p>
          <div className="hero-actions">
            <a href="#products" className="btn btn-primary">
              <Bag />
              Shop pads
            </a>
            <a href="#why" className="btn btn-ghost">
              Why Femi9
            </a>
          </div>
          <div className="hero-meta">
            <span className="m">
              <Leaf /> Certified organic cotton
            </span>
            <span className="divider" />
            <span className="m">
              <Recycle /> Biodegradable
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-frame">
            <img
              src="/assets/img/hero.webp"
              alt="Femi9 330mm double-wing sanitary pad and pack on a bright dressing table with a plant"
              width={920}
              height={1150}
              // Keeps the LCP hint on this above-the-fold hero image. React 18.3
              // (used by Next 14) maps the camelCase `fetchPriority` prop to the
              // lowercased DOM attribute, so use the canonical casing.
              fetchPriority="high"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
