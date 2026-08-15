'use client'

import '../styles/product-detail-extras.css'
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useRouter } from '@/lib/router-compat'
import { rupees, CADENCES } from '../data/products'
import { useCart } from '../store/cart'
import { PantyArt } from '../components/PantyArt'
import { Bag, Drop, Leaf, ShieldCheck, Check, Close, Facebook, Whatsapp } from '../components/Icons'
import { ICopy, IStar } from '../components/AppIcons'
import { OptImg } from '@/components/OptImg'
import type { OptImageBase } from '@/lib/opt-images'
import type { ProductWithVariants, ProductReview } from '@/lib/services/products'
import type { ProductExtra } from '@/data/productDetail'
import { usePublicSettings } from '@/lib/use-public-settings'
import { track } from '@/lib/track'

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
  // Must stay >= 16px. iOS Safari zooms the visual viewport in on focus for any
  // control below that and never zooms back out on blur; because this is an
  // inline style no breakpoint could have rescued it.
  fontSize: '16px',
}

function Stars({ rating }: { rating: number }) {
  // Five bare <svg>s used to be announced as five unlabelled graphics. role=img
  // + a label makes the group a single leaf that reads the rating once — which
  // matters most on the review cards, where the stars are the only place that
  // review's score appears.
  return (
    <span className="stars" role="img" aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
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
  const [showGapBanner, setShowGapBanner] = useState(false)
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

  /**
   * The benefits banner. The two size-specific shots are in the image manifest,
   * so they can go through the WebP ladder; a product whose id matches neither
   * falls back to its own catalog photo, which is DB-authored and therefore not
   * in the manifest.
   */
  const benefitsBase: OptImageBase | null = product.id.includes('330')
    ? 'img/330mm'
    : product.id.includes('290') || !product.img
    ? 'img/290mm'
    : null

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 620px)').matches
    setSpecsOpen(!isMobile)
    setReviewsOpen(!isMobile)
    // The gap-filler banner exists only to square off the desktop gallery
    // column. It used to be hidden below 769px with display:none, which does
    // not cancel the fetch — every phone paid 284KB for pixels never painted.
    // Gating it in JSX is the only way to actually not download it.
    setShowGapBanner(window.matchMedia('(min-width: 769px)').matches)
  }, [])

  // /api/events existed with zero instrumentation — not a single storefront
  // interaction was ever recorded. A product view is the cheapest useful signal.
  useEffect(() => {
    track('product_view', { slug: product.id, name: product.name })
  }, [product.id, product.name])

  /**
   * The real rating distribution, computed from the reviews we were handed.
   * Five literal bars (88/9/3/0/0%) used to sit directly beneath a genuinely
   * computed average, so a product with three 4-star reviews still claimed 88%
   * five-star.
   */
  const ratingHistogram = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((stars) => {
        const count = reviews.filter((r) => Math.round(r.rating) === stars).length
        return { stars, count, pct: reviews.length ? Math.round((count / reviews.length) * 100) : 0 }
      }),
    [reviews],
  )

  /** Absolute URL for this product, for the share intents. */
  const shareUrl =
    (typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_SITE_URL ?? '') +
    `/product/${product.id}`

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      notify('Link copied')
    } catch {
      notify('Copying is blocked in this browser')
    }
  }

  /** Open the review form. Signed-out visitors are sent to sign in first — the
   *  endpoint requires a session and would otherwise fail after they had typed. */
  const openReviewForm = () => {
    setReviewOpen(true)
    setRvState('idle')
  }

  /** The cheapest in-stock variant of a related product, mirroring ProductCard. */
  const defaultVariantOf = (p: ProductWithVariants) =>
    p.variants.find((v) => v.stock > 0) ?? p.variants[0]

  const addRelated = async (p: ProductWithVariants) => {
    const variant = defaultVariantOf(p)
    if (!variant) {
      notify('Sorry, that option is currently unavailable')
      return
    }
    await add(variant.id, 1)
    track('add_to_cart', { slug: p.id, variantId: variant.id, qty: 1 })
    openCart()
  }

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
      if (res.status === 401) {
        // The endpoint needs a session. Send her to sign in and bring her back
        // here rather than showing a generic failure after she typed a review.
        router.push(`/login?next=/product/${product.id}`)
        return
      }
      if (!res.ok) throw new Error(`review submit failed: ${res.status}`)
      setRvState('sent')
      track('review_submitted', { slug: product.id, rating: rvRating })
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
          router.push(`/login?next=/product/${product.id}`)
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
    track('add_to_cart', { slug: product.id, variantId: variant.id, qty })
    openCart()
  }

  const renderGalleryImage = (full = false) => (
    isPanty ? (
      <PantyArt variant={extra.gallery[imgIdx] as 'lilac' | 'plum' | 'gold'} />
    ) : (
      // Gallery URLs are DB-authored, so there is no manifest entry to hang an
      // OptImg ladder off. No width/height here on purpose: both the stage and
      // the fullscreen card size this image entirely from CSS, and the
      // fullscreen card sets only `width`, so a height attribute would become
      // the used height and letterbox it. This is the page's LCP image, hence
      // eager (the default) with a high fetch priority rather than lazy.
      <img
        src={extra.gallery[imgIdx]}
        alt={full ? `${product.name} enlarged` : product.name}
        decoding="async"
        fetchPriority={full ? undefined : 'high'}
      />
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
                    {isPanty ? (
                      <PantyArt variant={g as 'lilac' | 'plum' | 'gold'} />
                    ) : (
                      <img src={g} alt="" width={76} height={76} loading="lazy" decoding="async" />
                    )}
                  </button>
                ))}
              </div>

              {/* Main Display Stage + Gap Filling Feature Image */}
              <div className="pdp-stage-column">
                <div className="pdp-hero-stage" onClick={() => setIsFullscreen(true)}>
                  {renderGalleryImage()}
                </div>

                {/* Gap Filling Image Banner — desktop only, see the effect above */}
                {showGapBanner && (
                  <div className="pdp-hero-gap-banner">
                    <OptImg
                      base="img/sample"
                      sizes="(max-width: 1200px) 46vw, 620px"
                      alt="Femi9 Organic Care Quality"
                    />
                  </div>
                )}
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
                {/* Real share intents carrying THIS product's URL. These used
                    to point at the bare social homepages, so "share" opened
                    facebook.com with nothing attached. Instagram has no web
                    share intent at all, so it becomes a copy-link button. */}
                <div className="pdp-share-links">
                  <a
                    href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pdp-share-link"
                    aria-label="Share on Facebook"
                  >
                    <Facebook />
                  </a>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${product.name} ${shareUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pdp-share-link"
                    aria-label="Share on WhatsApp"
                  >
                    <Whatsapp />
                  </a>
                  <button
                    type="button"
                    className="pdp-share-link"
                    onClick={copyShareLink}
                    aria-label="Copy link to this product"
                  >
                    <ICopy />
                  </button>
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
                          {/* Decorative leader line. It used to be an empty
                              <dd>, which made VoiceOver announce a blank
                              definition before every real one. */}
                          <span className="spec-dash" aria-hidden="true" />
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
              {/* 420KB served at full desktop resolution into a 324px column,
                  eagerly, with no intrinsic size to reserve the box. OptImg
                  emits the WebP ladder plus width/height/lazy/decoding. */}
              {benefitsBase ? (
                <OptImg
                  base={benefitsBase}
                  sizes="(max-width: 768px) 100vw, 1120px"
                  alt={`${product.name} product benefits`}
                  className="pdp-benefits-full-img"
                />
              ) : (
                <img
                  src={product.img}
                  alt={`${product.name} product benefits`}
                  className="pdp-benefits-full-img"
                  width={720}
                  height={960}
                  loading="lazy"
                  decoding="async"
                />
              )}
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
              {reviews.slice(0, 3).map((rv) => (
                <article className="pdp-review-card" key={rv.id}>
                  <div className="pdp-review-card-head">
                    <div className="pdp-review-stars">
                      <Stars rating={rv.rating} />
                    </div>
                    {/* The real posting month. Every card used to read 'Jun 2026'
                        because the DTO carried no date field at all. */}
                    <span className="pdp-review-date">{rv.date}</span>
                  </div>

                  <div className="pdp-review-user-row">
                    <div className="pdp-review-avatar">{rv.name.charAt(0)}</div>
                    <div className="pdp-review-user-info">
                      <b>{rv.name}</b>
                      <span>
                        {rv.place ?? 'Femi9 customer'}
                        {/* Only shown when this reviewer really has a paid order
                            for this product; it used to be unconditional. */}
                        {rv.verified && (
                          <>
                            {' '}
                            &middot; <span className="verified-text">Verified Buyer</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <p className="pdp-review-body">{rv.body}</p>
                </article>
              ))}
            </div>

            {/* Empty state — a product with no reviews yet should invite one,
                not show the fabricated 88/9/3/0/0 distribution that used to be
                hardcoded here regardless of what the database held. */}
            {reviews.length === 0 ? (
              <div className="pdp-reviews-empty">
                <p>No reviews yet for this product.</p>
                <button type="button" className="btn btn-primary" onClick={openReviewForm}>
                  Be the first to review it
                </button>
              </div>
            ) : (
              <div className="pdp-rating-summary-box">
                <div className="pdp-rating-score-col">
                  <div className="pdp-rating-big">{averageRating.toFixed(2)}</div>
                  <div className="pdp-rating-summary-meta">
                    <Stars rating={averageRating} />
                    <span>
                      Based on {reviewTotal} {reviewTotal === 1 ? 'review' : 'reviews'}
                    </span>
                  </div>
                  {/* The entry point to the review form. The modal and the
                      endpoint behind it both worked, but setReviewOpen(true) was
                      never called anywhere in this file — it was dead code. */}
                  <button type="button" className="btn btn-primary pdp-write-review" onClick={openReviewForm}>
                    Write a review
                  </button>
                </div>

                <div className="pdp-rating-bars-col">
                  {ratingHistogram.map((row) => (
                    <div className="pdp-rating-bar-row" key={row.stars}>
                      <span className="pdp-rating-label">
                        {row.stars} <IStar aria-hidden="true" />
                      </span>
                      <div className="pdp-bar-track">
                        <div className="pdp-bar-fill" style={{ width: row.pct + '%' }} />
                      </div>
                      <span className="pdp-bar-count">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Second entry point, below the cards, for a reader who scrolled the
                reviews rather than the summary. */}
            {reviews.length > 0 && (
              <div className="pdp-reviews-cta">
                <button type="button" className="btn btn-ghost" onClick={openReviewForm}>
                  Write a review
                </button>
              </div>
            )}
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
                    <img
                      src={p.img || '/assets/img/pad-detail-1.webp'}
                      alt={p.name}
                      width={720}
                      height={960}
                      loading="lazy"
                      decoding="async"
                    />
                  </Link>
                  <div className="related-card-content">
                    <Link to={`/product/${p.id}`} className="related-title">{p.name}</Link>
                    <p className="related-desc">{p.desc}</p>
                    {/* A struck-through `price * 1.18` and a literal "-15% OFF"
                        pill used to sit here. There is no compareAtPrice in the
                        catalog, so that MRP was synthesised — presenting a
                        fabricated reference price is consumer-law exposure in
                        India, not merely a UI bug. */}
                    <div className="related-price-block">
                      <b className="related-now-price">{rupees(p.price)}</b>
                    </div>

                    {/* Was a <Link> carrying a bag icon and the words "Add to
                        bag" that only navigated. Same pattern as ProductCard,
                        including the no-variant guard. */}
                    <button
                      type="button"
                      className="related-add-btn-pill"
                      onClick={() => addRelated(p)}
                      disabled={!defaultVariantOf(p)}
                    >
                      <Bag /> {defaultVariantOf(p) ? 'Add to bag' : 'Sold out'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Persistent mobile add-to-bag bar. app.css has styled `.pdp-mobile-bar`
          — safe-area padding, z-index and all — since before this rewrite, but
          nothing ever rendered it: the only CTA was the `.cta-row` roughly
          1400px down a 360px page, with the benefits banner, the reviews and the
          related strip below it and no way back. `display:none` above 768px, so
          desktop never sees it. */}
      <div className="pdp-mobile-bar">
        <button className="btn btn-primary" onClick={submit}>
          <Bag /> {mode === 'sub' ? 'Start subscription' : 'Add to bag'} &mdash; {rupees(effPrice * qty)}
        </button>
      </div>

      {/* Review Modal */}
      {reviewOpen && (
        <div className="pdp-modal" role="dialog" aria-modal="true" aria-label="Write a review">
          <button className="pdp-modal-backdrop" onClick={() => setReviewOpen(false)} aria-label="Close review form" />
          <div className="pdp-modal-card">
            <button className="pdp-modal-close" onClick={() => setReviewOpen(false)} aria-label="Close"><Close /></button>
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
                <input
                  value={rvName}
                  onChange={(e) => setRvName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  autoComplete="name"
                  required
                  style={rvInput}
                />
                <input
                  value={rvPlace}
                  onChange={(e) => setRvPlace(e.target.value)}
                  placeholder="City (optional)"
                  aria-label="City (optional)"
                  autoComplete="address-level2"
                  style={rvInput}
                />
                <textarea
                  value={rvBody}
                  onChange={(e) => setRvBody(e.target.value)}
                  placeholder="Share your experience"
                  aria-label="Share your experience"
                  required
                  rows={4}
                  style={{ ...rvInput, resize: 'vertical' }}
                />
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
            <button className="pdp-modal-close" onClick={() => setIsFullscreen(false)} aria-label="Close"><Close /></button>
            {renderGalleryImage(true)}
          </div>
        </div>
      )}
    </div>
  )
}
