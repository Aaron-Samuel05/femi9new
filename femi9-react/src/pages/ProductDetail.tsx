import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { PRODUCTS, rupees } from '../data/products'
import { EXTRAS, sampleReviews } from '../data/productDetail'
import { useCart } from '../store/cart'
import { ProductCard } from '../components/ProductCard'
import { ArrowRight, Bag, Close, Drop, Leaf, ShieldCheck } from '../components/Icons'
import { ICheck, IStar } from '../components/AppIcons'

const featIcons = [Leaf, Drop, ShieldCheck]

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <IStar key={i} style={{ opacity: i < Math.round(rating) ? 1 : 0.22 }} />
      ))}
    </span>
  )
}

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { threshold: 0.12 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref} className={`pdp-reveal${visible ? ' in' : ''}${className ? ` ${className}` : ''}`}>{children}</div>
}

function Accordion({ title, children, openByDefault = false }: { title: string; children: ReactNode; openByDefault?: boolean }) {
  const [open, setOpen] = useState(openByDefault)
  return (
    <div className={`pdp-accordion-item${open ? ' open' : ''}`}>
      <button className="pdp-accordion-trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{title}</span>
        {open ? <Close /> : <ArrowRight style={{ transform: 'rotate(90deg)' }} />}
      </button>
      <div className="pdp-accordion-content">
        <div className="pdp-accordion-inner">{children}</div>
      </div>
    </div>
  )
}

export function ProductDetail() {
  const { id } = useParams()
  const product = PRODUCTS.find((p) => p.id === id)
  const extra = id ? EXTRAS[id] : undefined
  const [imgIdx, setImgIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [changing, setChanging] = useState(false)
  const touchStart = useRef<number | null>(null)
  const { add, openCart } = useCart()

  if (!product || !extra) return <Navigate to="/" replace />

  const related = PRODUCTS.filter((p) => p.id !== id)
  const setImage = (index: number) => {
    if (index === imgIdx) return
    setChanging(true)
    window.setTimeout(() => {
      setImgIdx(index)
      window.setTimeout(() => setChanging(false), 40)
    }, 110)
  }
  const previousImage = () => setImage((imgIdx - 1 + extra.gallery.length) % extra.gallery.length)
  const nextImage = () => setImage((imgIdx + 1) % extra.gallery.length)

  const addToBag = () => {
    for (let i = 0; i < qty; i += 1) add(product.id)
    openCart()
  }

  return (
    <main className="premium-pdp">
      <section className="pdp-shell">
        <div className="pdp-crumbs">
          <Link to="/">Home</Link><span>/</span><Link to="/#products">Shop</Link><span>/</span><span>{product.name}</span>
        </div>

        <div className="pdp-config">
          <Reveal className="pdp-gallery">
            <div
              className="pdp-gallery-main"
              onTouchStart={(e) => { touchStart.current = e.touches[0]?.clientX ?? null }}
              onTouchEnd={(e) => {
                if (touchStart.current === null) return
                const end = e.changedTouches[0]?.clientX ?? touchStart.current
                const delta = end - touchStart.current
                touchStart.current = null
                if (Math.abs(delta) > 45) delta < 0 ? nextImage() : previousImage()
              }}
            >
              <img
                key={extra.gallery[imgIdx]}
                className={`pdp-main-image${changing ? ' is-changing' : ''}`}
                src={extra.gallery[imgIdx]}
                alt={`Femi9 ${product.name}`}
                fetchPriority="high"
                draggable={false}
              />
              <div className="pdp-gallery-controls">
                <button className="pdp-gallery-arrow" onClick={previousImage} aria-label="Previous image"><ArrowRight style={{ transform: 'rotate(180deg)' }} /></button>
                <button className="pdp-gallery-arrow" onClick={nextImage} aria-label="Next image"><ArrowRight /></button>
              </div>
            </div>
            <div className="pdp-thumbs" aria-label="Product gallery">
              {extra.gallery.map((image, index) => (
                <button key={`${image}-${index}`} className={`pdp-thumb${index === imgIdx ? ' on' : ''}`} onClick={() => setImage(index)} aria-label={`View product image ${index + 1}`} aria-current={index === imgIdx}>
                  <img src={image} alt="" loading={index === 0 ? 'eager' : 'lazy'} />
                </button>
              ))}
            </div>
            <div className="pdp-gallery-note">Swipe or select an image</div>
          </Reveal>

          <div className="pdp-purchase">
            <Reveal>
              <span className="pdp-eyebrow">{product.flow}</span>
              <h1>{product.name}</h1>
              <p className="pdp-subtitle">{extra.long}</p>
              <div className="pdp-rating"><Stars rating={extra.rating} /><span>{extra.rating} · {extra.reviews} reviews</span></div>
              <div className="pdp-price-line"><strong>{rupees(product.price)}</strong><span>{product.meta}</span></div>

              <div className="pdp-selector">
                <div className="pdp-selector-head"><b>Choose your format</b><span>{PRODUCTS.length} options</span></div>
                <div className="pdp-options">
                  {PRODUCTS.map((option) => (
                    <Link key={option.id} to={`/product/${option.id}`} className={`pdp-option${option.id === id ? ' on' : ''}`} aria-current={option.id === id ? 'page' : undefined}>
                      <span className="pdp-option-copy"><b>{option.name}</b><span>{option.flow} · {option.meta}</span></span>
                      <span className="pdp-option-price">{rupees(option.price)}</span>
                      <span className="pdp-option-check"><ICheck /></span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="pdp-purchase-row">
                <div className="pdp-stepper" aria-label="Quantity">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">−</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="Increase quantity">+</button>
                </div>
                <button className="btn btn-primary pdp-add" onClick={addToBag}><Bag /> Add to Bag · {rupees(product.price * qty)}</button>
              </div>

              <div className="pdp-trust-row">
                <div className="pdp-trust"><b>Organic cotton</b><span>Top sheet</span></div>
                <div className="pdp-trust"><b>Breathable</b><span>Soft comfort</span></div>
                <div className="pdp-trust"><b>Everyday</b><span>Made to move</span></div>
              </div>

              <div className="pdp-accordion">
                <Accordion title="What's included" openByDefault>
                  <div className="pdp-whats">
                    <div><b>Pack</b><span>{product.meta}</span></div>
                    <div><b>Flow</b><span>{product.flow}</span></div>
                  </div>
                </Accordion>
                <Accordion title="Product details">
                  <p className="pdp-subtitle" style={{ marginTop: 0 }}>{extra.long}</p>
                </Accordion>
                <Accordion title="Specifications">
                  <div className="pdp-specs">
                    {extra.specs.map((spec) => <div className="pdp-spec-row" key={spec.k}><span className="k">{spec.k}</span><span className="v">{spec.v}</span></div>)}
                  </div>
                </Accordion>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="pdp-story pdp-shell">
        <Reveal className="pdp-story-intro">
          <span className="eyebrow">The Femi9 difference</span>
          <h2>Everything you need<br />to feel comfortable.</h2>
          <p className="pdp-story-lead">Designed around the details that matter — softness, breathability and a secure fit — using the product information already available for this Femi9 range.</p>
        </Reveal>
        <div className="pdp-story-grid">
          <Reveal className="pdp-story-card tall">
            <img src={extra.gallery[0]} alt={`Femi9 ${product.name}`} loading="lazy" />
            <div className="pdp-story-card-copy"><h3>Designed around her.</h3><p>Comfort through every movement, with the actual product at the centre of the experience.</p></div>
          </Reveal>
          <Reveal className="pdp-story-card">
            <img src={extra.gallery[Math.min(1, extra.gallery.length - 1)]} alt="Femi9 product detail" loading="lazy" />
            <div className="pdp-story-card-copy"><h3>Made for real life.</h3><p>{product.desc}</p></div>
          </Reveal>
        </div>
      </section>

      <section className="pdp-benefits pdp-shell">
        <Reveal>
          <span className="eyebrow">Made for every day</span>
          <h2 className="pdp-section-heading">Comfort that stays<br />with you.</h2>
        </Reveal>
        <div className="pdp-benefits-grid">
          {extra.features.map((feature, index) => {
            const Icon = featIcons[index % featIcons.length]
            return <Reveal key={feature.title}><article className="pdp-benefit"><span className="pdp-benefit-icon"><Icon /></span><b>{feature.title}</b><p>{feature.body}</p></article></Reveal>
          })}
          <Reveal><article className="pdp-benefit"><span className="pdp-benefit-icon"><ShieldCheck /></span><b>Protection, thoughtfully presented.</b><p>{product.flow} in a calm, easy-to-understand buying experience.</p></article></Reveal>
        </div>
      </section>

      <section className="pdp-reviews pdp-shell">
        <Reveal>
          <span className="eyebrow">Reviews</span>
          <h2 className="pdp-section-heading">What women say.</h2>
        </Reveal>
        <div className="pdp-review-grid">
          {sampleReviews.map((review) => (
            <Reveal key={review.name}><article className="pdp-review-card"><Stars rating={review.rating} /><p>“{review.body}”</p><div className="who"><b>{review.name}</b> · {review.place} · {review.date}</div></article></Reveal>
          ))}
        </div>
      </section>

      <section className="pdp-related">
        <div className="pdp-shell">
          <div className="pdp-related-head">
            <h2>You may also like.</h2>
            <p>Explore the other Femi9 formats available in the existing product range.</p>
          </div>
          <div className="grid-products">
            {related.map((item, index) => <ProductCard key={item.id} product={item} delay={((index % 3) + 1) as 1 | 2 | 3} />)}
          </div>
        </div>
      </section>

      <div className="pdp-mobile-buy" role="region" aria-label="Quick purchase">
        <div className="pdp-mobile-buy-copy"><b>{product.name}</b><span>{rupees(product.price)} · {product.meta}</span></div>
        <button className="btn btn-primary" onClick={addToBag}>Add to Bag</button>
      </div>
    </main>
  )
}
