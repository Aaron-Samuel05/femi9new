'use client'

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useRouter } from '@/lib/router-compat'
import { rupees, CADENCES } from '../data/products'
import { useCart } from '../store/cart'
import { PantyArt } from '../components/PantyArt'
import { Bag, Drop, Leaf, ShieldCheck, Check, Facebook, Instagram, Whatsapp } from '../components/Icons'
import { IStar, IThumbDown, IThumbUp } from '../components/AppIcons'
import type { ProductWithVariants, ProductReview } from '@/lib/services/products'
import type { ProductExtra } from '@/data/productDetail'
import { usePublicSettings } from '@/lib/use-public-settings'

interface Props {
  product: ProductWithVariants
  extra: ProductExtra
  reviews: ProductReview[]
  relatedProducts: ProductWithVariants[]
}

const featIcons = [Drop, Leaf, ShieldCheck]

const rvInput: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  border: '1px solid var(--line)',
  borderRadius: 12,
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: '.92rem',
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <IStar key={i} style={{ opacity: i < Math.round(rating) ? 1 : 0.24 }} />
      ))}
    </span>
  )
}

function deliveryDate(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86400000)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function ProductDetail({ product, extra, reviews, relatedProducts }: Props) {
  const { subscribeSavePct } = usePublicSettings()
  const [imgIdx, setImgIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [packIdx, setPackIdx] = useState<number>((product.packs?.length ?? 1) - 1)
  const [sizeIdx, setSizeIdx] = useState(1)
  const [mode, setMode] = useState<'once' | 'sub'>('once')
  const [cadence, setCadence] = useState(CADENCES[0].id)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [specsOpen, setSpecsOpen] = useState(true)
  const [reviewsOpen, setReviewsOpen] = useState(true)
  const { add, openCart, notify } = useCart()
  const router = useRouter()

  const [rvName, setRvName] = useState('')
  const [rvPlace, setRvPlace] = useState('')
  const [rvBody, setRvBody] = useState('')
  const [rvRating, setRvRating] = useState(5)
  const [rvState, setRvState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const isPanty = product.type === 'panty'
  const packs = product.packs
  const related = relatedProducts
  const mmPart = product.meta.split('·').pop()?.trim() ?? ''
  const selectedPack = packs ? packs[packIdx] : null
  const basePrice = selectedPack ? selectedPack.price : product.price
  const subscriptionPrice = Math.round(basePrice * (100 - subscribeSavePct) / 100)
  const effPrice = mode === 'sub' ? subscriptionPrice : basePrice
  const activeCadence = CADENCES.find((c) => c.id === cadence) ?? CADENCES[0]
  const averageRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : extra.rating
  const reviewTotal = reviews.length || extra.reviews
  const shortDescription = extra.long || product.desc

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 620px)').matches
    setSpecsOpen(!isMobile)
    setReviewsOpen(!isMobile)
  }, [])

  const submitReview = async (e: FormEvent) => {
    e.preventDefault()
    if (rvState === 'sending') return
    setRvState('sending')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSlug: product.id,
          name: rvName.trim(),
          place: rvPlace.trim() || undefined,
          rating: rvRating,
          body: rvBody.trim(),
        }),
      })
      if (!res.ok) throw new Error(`review submit failed: ${res.status}`)
      setRvState('sent')
    } catch {
      setRvState('error')
    }
  }

  const submit = async () => {
    const variant = isPanty
      ? product.variants.find((v) => v.kind === 'size' && v.size === product.sizes?.[sizeIdx])
      : product.variants.find((v) => v.kind === 'pack' && v.packCount === selectedPack?.count)
    if (!variant) {
      notify('Sorry, that option is currently unavailable')
      return
    }

    if (mode === 'sub') {
      try {
        const res = await fetch('/api/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantId: variant.id, qty, cadenceCode: cadence }),
        })
        if (res.status === 401) {
          router.push('/login')
          return
        }
        if (!res.ok) {
          notify('Sorry, we could not start your subscription')
          return
        }
        notify(`Subscription started · ${product.name}`)
      } catch {
        notify('Sorry, we could not start your subscription')
      }
      return
    }

    void add(variant.id, qty)
    openCart()
  }

  const renderGalleryImage = (full = false) => (
    isPanty ? (
      <PantyArt variant={extra.gallery[imgIdx] as 'lilac' | 'plum' | 'gold'} />
    ) : (
      <img src={extra.gallery[imgIdx]} alt={full ? `${product.name} enlarged` : product.name} />
    )
  )

  return (
    <div className="pdp-page">
      <main className="pdp-main-content">
        <div className="wrap">
          {/* BREADCRUMB */}
          <div className="crumbs">
            <Link to="/">Home</Link> / <Link to="/#products">Sanitary Care</Link> / {product.name}
          </div>

          {/* 3. TWO-COLUMN PRODUCT LAYOUT */}
          <div className="pdp-grid">
            {/* LEFT COLUMN — VERTICAL THUMBNAILS + STAGE */}
            <div className="pdp-gallery-layout">
              {/* Stacked Vertical Thumbnails */}
              <div className="pdp-thumb-stack">
                {extra.gallery.map((g, i) => (
                  <button
                    key={i}
                    className={`pdp-vertical-thumb${i === imgIdx ? ' active' : ''}`}
                    onClick={() => setImgIdx(i)}
                    aria-label={`View photo ${i + 1}`}
                  >
                    {isPanty ? <PantyArt variant={g as 'lilac' | 'plum' | 'gold'} /> : <img src={g} alt="" />}
                  </button>
                ))}
              </div>

              {/* Main Display Stage + Gap Filling Feature Image */}
              <div className="pdp-stage-column">
                <div className="pdp-hero-stage" onClick={() => setIsFullscreen(true)}>
                  {renderGalleryImage()}
                </div>

                {/* Gap Filling Image Banner */}
                <div className="pdp-hero-gap-banner">
                  <img src="/assets/img/sample.jpeg" alt="Femi9 Organic Care Quality" />
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN — PRODUCT INFORMATION */}
            <div className="pdp-right-col">
              <span className="pdp-eyebrow">SANITARY &amp; PERIOD CARE</span>
              <h1 className="pdp-title">{product.name}</h1>

              {/* Rating Row with Score */}
              <div className="pdp-rating-row">
                <Stars rating={averageRating} />
                <span className="pdp-rating-score">{averageRating.toFixed(1)} / 5</span>
                <span className="pdp-rating-count">({reviewTotal} reviews)</span>
                <span className="pdp-rating-divider">&middot;</span>
                <span className="pdp-rating-sub">Organic Certified</span>
              </div>

              {/* Price Line with Was Price, Active Price & Discount Badge */}
              <div className="pdp-price-block">
                <div className="pdp-price-line">
                  <span className="pdp-was-price">{rupees(Math.round(basePrice * 1.18))}</span>
                  <span className="pdp-now-price">{rupees(effPrice)}</span>
                  <span className="pdp-discount-badge">-15% OFF</span>
                </div>
                <span className="pdp-tax-note">Tax included. Free shipping on orders over Rs. 499.</span>
              </div>

              {/* Short Description */}
              <p className="pdp-desc-text">{shortDescription}</p>

              {/* 4 CIRCULAR BENEFIT BADGES */}
              <div className="pdp-benefit-badges">
                <div className="pdp-benefit-item">
                  <div className="benefit-circle"><Leaf /></div>
                  <span>Organic Cotton</span>
                </div>
                <div className="pdp-benefit-item">
                  <div className="benefit-circle"><ShieldCheck /></div>
                  <span>Chlorine Free</span>
                </div>
                <div className="pdp-benefit-item">
                  <div className="benefit-circle"><Check /></div>
                  <span>Dermat Tested</span>
                </div>
                <div className="pdp-benefit-item">
                  <div className="benefit-circle"><Drop /></div>
                  <span>All Flow Types</span>
                </div>
              </div>

              {/* Pack Selector */}
              {packs && (
                <div className="pdp-block">
                  <div className="pdp-label">Choose your pack</div>
                  <div className="pack-cards">
                    {packs.map((p, i) => (
                      <button
                        key={p.count}
                        className={`pack-card${i === packIdx ? ' active' : ''}`}
                        onClick={() => setPackIdx(i)}
                        aria-pressed={i === packIdx}
                      >
                        <b>{p.count} pcs</b>
                        <span>{rupees(p.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Panty Sizes */}
              {isPanty && product.sizes && (
                <div className="pdp-block">
                  <div className="pdp-label">Choose your size</div>
                  <div className="size-cards">
                    {product.sizes.map((s, i) => (
                      <button
                        key={s}
                        className={`size-card${i === sizeIdx ? ' active' : ''}`}
                        onClick={() => setSizeIdx(i)}
                        aria-pressed={i === sizeIdx}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchase Options */}
              <div className="pdp-block">
                <div className="pdp-label">Purchase options</div>
                <div className="sub-options" role="radiogroup" aria-label="Purchase options">
                  <button
                    className={`sub-row${mode === 'once' ? ' active' : ''}`}
                    onClick={() => setMode('once')}
                    aria-pressed={mode === 'once'}
                  >
                    <span className="sub-radio-dot" />
                    <div className="sub-row-content">
                      <b>One-time purchase</b>
                      <span>{rupees(basePrice)}</span>
                    </div>
                  </button>
                  <button
                    className={`sub-row${mode === 'sub' ? ' active' : ''}`}
                    onClick={() => setMode('sub')}
                    aria-pressed={mode === 'sub'}
                  >
                    <span className="sub-radio-dot" />
                    <div className="sub-row-content">
                      <b>Subscribe &amp; save {subscribeSavePct}%</b>
                      <span>{rupees(subscriptionPrice)} &middot; skip or cancel anytime</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Quantity Stepper & Add to Bag */}
              <div className="cta-row">
                <div className="qty-stepper">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">&minus;</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
                </div>
                <button className="add-to-bag-btn" onClick={submit}>
                  <Bag /> {mode === 'sub' ? 'Start subscription' : 'Add to bag'} &mdash; {rupees(effPrice * qty)}
                </button>
              </div>

              {/* Social Share Row (Reference Layout) */}
              <div className="pdp-share-row">
                <span className="pdp-share-label">Share:</span>
                <div className="pdp-share-links">
                  <a
                    href="https://facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pdp-share-link"
                    aria-label="Share on Facebook"
                  >
                    <Facebook />
                  </a>
                  <a
                    href="https://whatsapp.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pdp-share-link"
                    aria-label="Share on WhatsApp"
                  >
                    <Whatsapp />
                  </a>
                  <a
                    href="https://instagram.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pdp-share-link"
                    aria-label="Share on Instagram"
                  >
                    <Instagram />
                  </a>
                </div>
              </div>

              {/* Collapsible Accordions */}
              <div className="pdp-accordions">
                <details className="pdp-accordion-item" open>
                  <summary className="pdp-accordion-summary">Product Information</summary>
                  <div className="pdp-accordion-body">
                    <p>{extra.long}</p>
                  </div>
                </details>
                <details className="pdp-accordion-item">
                  <summary className="pdp-accordion-summary">Specifications &amp; Materials</summary>
                  <div className="pdp-accordion-body">
                    <dl className="specs-table">
                      {extra.specs.map((s) => (
                        <div className="spec-item" key={s.k}>
                          <dt className="spec-key">{s.k}</dt>
                          <dd className="spec-dash" />
                          <dd className="spec-val">{s.v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </details>
                <details className="pdp-accordion-item">
                  <summary className="pdp-accordion-summary">Shipping &amp; Delivery</summary>
                  <div className="pdp-accordion-body">
                    <p>Free standard shipping across India on orders over Rs. 499. Orders dispatch within 24 hours in discreet, eco-friendly paper packaging.</p>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* 2. BENEFITS STORYTELLING SECTION ("Why Femi9 feels different") */}
          <section className="pdp-benefits-section">
            <div className="pdp-sec-head">
              <h2 className="pdp-sec-title">Why Femi9 feels different</h2>
              <p className="pdp-sec-subtitle">
                Thoughtfully engineered for complete peace of mind, daily comfort, and rash-free period care.
              </p>
            </div>

            <div className="pdp-benefits-banner-wrapper">
              <img
                src={
                  product.id.includes('330')
                    ? '/assets/img/330mm.jpeg'
                    : product.id.includes('290')
                    ? '/assets/img/290mm.jpeg'
                    : product.img || '/assets/img/290mm.jpeg'
                }
                alt={`${product.name} product benefits`}
                className="pdp-benefits-full-img"
              />
            </div>
          </section>

          {/* 3. CUSTOMER REVIEWS SECTION (Senior UI/UX Designed) */}
          <section className="pdp-reviews-section">
            <div className="pdp-sec-head">
              <h2 className="pdp-sec-title">Customer Reviews</h2>
              <p className="pdp-sec-subtitle">
                Real experiences from women who trust Femi9 for a rash-free, comfortable cycle.
              </p>
            </div>

            {/* 3 FEATURED REVIEW CARDS */}
            <div className="pdp-reviews-grid">
              {reviews.slice(0, 3).map((rv: any, idx: number) => (
                <article className="pdp-review-card" key={idx}>
                  <div className="pdp-review-card-head">
                    <div className="pdp-review-stars">
                      <Stars rating={rv.rating || 5} />
                    </div>
                    <span className="pdp-review-date">{rv.date || 'Jun 2026'}</span>
                  </div>

                  <div className="pdp-review-user-row">
                    <div className="pdp-review-avatar">
                      {rv.name.charAt(0)}
                    </div>
                    <div className="pdp-review-user-info">
                      <b>{rv.name}</b>
                      <span>{rv.place || 'Coimbatore'} &middot; <span className="verified-text">Verified Buyer</span></span>
                    </div>
                  </div>

                  <h4 className="pdp-review-title">
                    {idx === 0 ? 'Works wonders for overnight sleep' : idx === 1 ? 'Zero rashes & comfortable fit' : 'Magical & so soft'}
                  </h4>

                  <p className="pdp-review-body">{rv.body}</p>

                  <div className="pdp-review-footer">
                    <span className="pdp-review-full-link">Full Review</span>
                    <div className="pdp-review-helpful">
                      <button type="button" aria-label="Helpful review"><IThumbUp aria-hidden="true" /> {idx === 0 ? 12 : idx === 1 ? 8 : 15}</button>
                      <button type="button" aria-label="Not helpful review"><IThumbDown aria-hidden="true" /> 0</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* RATING DISTRIBUTION SUMMARY (No Write Review or Pill Buttons) */}
            <div className="pdp-rating-summary-box">
              <div className="pdp-rating-score-col">
                <div className="pdp-rating-big">{averageRating.toFixed(2)}</div>
                <div className="pdp-rating-summary-meta">
                  <Stars rating={averageRating} />
                  <span>Based on {reviewTotal} verified reviews</span>
                </div>
              </div>

              <div className="pdp-rating-bars-col">
                <div className="pdp-rating-bar-row">
                  <span className="pdp-rating-label">5 <IStar aria-hidden="true" /></span>
                  <div className="pdp-bar-track">
                    <div className="pdp-bar-fill" style={{ width: '88%' }} />
                  </div>
                  <span className="pdp-bar-count">88%</span>
                </div>
                <div className="pdp-rating-bar-row">
                  <span className="pdp-rating-label">4 <IStar aria-hidden="true" /></span>
                  <div className="pdp-bar-track">
                    <div className="pdp-bar-fill" style={{ width: '9%' }} />
                  </div>
                  <span className="pdp-bar-count">9%</span>
                </div>
                <div className="pdp-rating-bar-row">
                  <span className="pdp-rating-label">3 <IStar aria-hidden="true" /></span>
                  <div className="pdp-bar-track">
                    <div className="pdp-bar-fill" style={{ width: '3%' }} />
                  </div>
                  <span className="pdp-bar-count">3%</span>
                </div>
                <div className="pdp-rating-bar-row">
                  <span className="pdp-rating-label">2 <IStar aria-hidden="true" /></span>
                  <div className="pdp-bar-track">
                    <div className="pdp-bar-fill" style={{ width: '0%' }} />
                  </div>
                  <span className="pdp-bar-count">0%</span>
                </div>
                <div className="pdp-rating-bar-row">
                  <span className="pdp-rating-label">1 <IStar aria-hidden="true" /></span>
                  <div className="pdp-bar-track">
                    <div className="pdp-bar-fill" style={{ width: '0%' }} />
                  </div>
                  <span className="pdp-bar-count">0%</span>
                </div>
              </div>
            </div>
          </section>

          {/* 5. RECOMMENDED PRODUCTS (Frequently Bought Together — Reference Layout) */}
          <section className="pdp-related-section">
            <div className="pdp-sec-head">
              <h2 className="pdp-sec-title">Frequently Bought Together</h2>
              <p className="pdp-sec-subtitle">
                Complete your personal care routine with these organic essentials.
              </p>
            </div>

            <div className="related-grid">
              {related.slice(0, 4).map((p) => (
                <article className="related-card" key={p.id}>
                  <Link to={`/product/${p.id}`} className="related-img-box">
                    <span className="related-badge">{p.flow || 'Sanitary Care'}</span>
                    <img src={p.img || '/assets/img/pad-detail-1.webp'} alt={p.name} loading="lazy" />
                  </Link>
                  <div className="related-card-content">
                    <Link to={`/product/${p.id}`} className="related-title">{p.name}</Link>
                    <p className="related-desc">{p.desc}</p>
                    <div className="related-price-block">
                      <span className="related-was-price">{rupees(Math.round(p.price * 1.18))}</span>
                      <b className="related-now-price">{rupees(p.price)}</b>
                      <span className="related-discount-pill">-15% OFF</span>
                    </div>

                    <Link to={`/product/${p.id}`} className="related-add-btn-pill">
                      <Bag /> Add to bag
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>


      {/* Review Modal */}
      {reviewOpen && (
        <div className="pdp-modal" role="dialog" aria-modal="true" aria-label="Write a review">
          <button className="pdp-modal-backdrop" onClick={() => setReviewOpen(false)} aria-label="Close review form" />
          <div className="pdp-modal-card">
            <button className="pdp-modal-close" onClick={() => setReviewOpen(false)} aria-label="Close">x</button>
            {rvState === 'sent' ? (
              <div className="review">
                <b style={{ color: 'var(--ink)' }}>Thanks - your review is awaiting approval.</b>
                <p style={{ marginTop: 8, color: 'var(--text-soft)' }}>
                  We read every review before it goes live. It will appear here once approved.
                </p>
              </div>
            ) : (
              <form className="review-form" onSubmit={submitReview}>
                <div>
                  <div className="pdp-label" style={{ marginBottom: 8 }}>Write a review</div>
                  <h2 className="pdp-title" style={{ fontSize: 24 }}>Share your experience</h2>
                </div>
                <span className="stars" role="radiogroup" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRvRating(n)}
                      aria-label={`${n} star${n > 1 ? 's' : ''}`}
                      aria-pressed={rvRating === n}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0, color: 'inherit' }}
                    >
                      <IStar style={{ opacity: n <= rvRating ? 1 : 0.24 }} />
                    </button>
                  ))}
                </span>
                <input value={rvName} onChange={(e) => setRvName(e.target.value)} placeholder="Your name" required style={rvInput} />
                <input value={rvPlace} onChange={(e) => setRvPlace(e.target.value)} placeholder="City (optional)" style={rvInput} />
                <textarea value={rvBody} onChange={(e) => setRvBody(e.target.value)} placeholder="Share your experience" required rows={4} style={{ ...rvInput, resize: 'vertical' }} />
                {rvState === 'error' && <p style={{ color: 'var(--mustard-deep)', fontSize: '.88rem', margin: 0 }}>Something went wrong. Please try again.</p>}
                <button type="submit" className="add-to-bag-btn" disabled={rvState === 'sending'}>
                  {rvState === 'sending' ? 'Submitting...' : 'Submit review'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Image Modal */}
      {isFullscreen && (
        <div className="pdp-modal pdp-image-modal" role="dialog" aria-modal="true" aria-label="Product image fullscreen">
          <button className="pdp-modal-backdrop" onClick={() => setIsFullscreen(false)} aria-label="Close image view" />
          <div className="pdp-image-modal-card">
            <button className="pdp-modal-close" onClick={() => setIsFullscreen(false)} aria-label="Close">x</button>
            {renderGalleryImage(true)}
          </div>
        </div>
      )}
    </div>
  )
}
