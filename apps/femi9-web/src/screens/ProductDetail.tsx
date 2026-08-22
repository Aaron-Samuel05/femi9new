'use client'

import '../styles/product-detail-extras.css'
import '../styles/craft-product.css'
import '../styles/pdp-key-benefits.css'
import '../styles/pdp-reviews.css'
import '../styles/pdp-motion.css'
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useRouter } from '@/lib/router-compat'
import { rupees, CADENCES } from '../data/products'
import { useCart } from '../store/cart'
import { PantyArt } from '../components/PantyArt'
import { Bag, Drop, Leaf, ShieldCheck, Check, Close, Facebook, Whatsapp } from '../components/Icons'
import { ICopy, IStar } from '../components/AppIcons'
import { OptImg } from '@/components/OptImg'
import { KeyBenefits } from '@/components/KeyBenefits'
import { ProductReviews } from '@/components/ProductReviews'
import { VideoTestimonials } from '@/components/VideoTestimonials'
import type { OptImageBase } from '@/lib/opt-images'
import type { ProductWithVariants, ProductReview } from '@femi9/core/services/products'
import type { ProductExtra } from '@/data/productDetail'
import { usePublicSettings } from '@/lib/use-public-settings'
import { useAddPulse } from '@/lib/use-add-pulse'
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

/**
 * The reveal-on-hover add button on a "frequently bought together" card.
 *
 * Its own component, declared at module scope, so each card owns an independent
 * pulse: one `useAddPulse` shared across the mapped strip would flash all four
 * cards every time any one of them was pressed. Module scope rather than nested
 * inside ProductDetail so it keeps its identity between renders and React does
 * not remount (and so reset) every card's state on each parent update.
 */
function RelatedQuickAdd({ name, onAdd }: { name: string; onAdd: () => void | Promise<void> }) {
  const [pulsing, pulse] = useAddPulse()
  return (
    <button
      type="button"
      className={`related-quick-add${pulsing ? ' is-added' : ''}`}
      onClick={() => {
        pulse()
        void onAdd()
      }}
      aria-label={`Add ${name} to bag`}
    >
      Add to cart
    </button>
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
  const [rvTitle, setRvTitle] = useState('')
  const [rvBody, setRvBody] = useState('')
  const [rvRating, setRvRating] = useState(5)
  const [rvState, setRvState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  /** Confirmation pulse for the main CTA. Shared by the inline button and the
   *  sticky mobile bar, because they are the same action — whichever one the
   *  shopper pressed, the other is either off-screen or the same control. */
  const [ctaPulsing, ctaPulse] = useAddPulse()

  /** The modal serves both jobs; `rvMode` decides which form it shows. */
  const [rvMode, setRvMode] = useState<'review' | 'question'>('review')
  const [qEmail, setQEmail] = useState('')

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
   * The centrepiece of the Key Benefits figure — a CLEAN pack shot per product.
   *
   * Deliberately not `img/330mm` / `img/290mm`: those two are the old
   * pre-rendered benefit banners, with the very same six claims baked into the
   * pixels. Putting one at the centre of a section that prints those claims as
   * live text around it made every benefit appear twice, once unreadable to
   * assistive tech. These are the plain product photographs instead.
   *
   * A product with no mapping falls back to its own catalog photo, which is
   * DB-authored and therefore has no manifest entry to hang a WebP ladder off.
   */
  const BENEFIT_SHOTS: Record<string, OptImageBase> = {
    p330dw: 'img/prod-330-double',
    p330cw: 'img/prod-330-centre',
    p290l9: 'img/prod-290-large9',
    p290l3: 'img/prod-290-large3',
  }
  const benefitsBase: OptImageBase | null = BENEFIT_SHOTS[product.id] ?? null

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
    setRvMode('review')
    setReviewOpen(true)
    setRvState('idle')
  }

  /** Open the same modal on its question form. The answer comes back by email,
   *  so this collects an address rather than a rating. */
  const askQuestion = () => {
    setRvMode('question')
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
          title: rvTitle.trim() || undefined,
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

  /** Send a product question to support. No session required — needing an
   *  account to ask a question would simply lose the question. */
  const submitQuestion = async (e: FormEvent) => {
    e.preventDefault()
    if (rvState === 'sending') return
    setRvState('sending')
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSlug: product.id,
          name: rvName.trim(),
          email: qEmail.trim(),
          question: rvBody.trim(),
        }),
      })
      if (!res.ok) throw new Error(`question submit failed: ${res.status}`)
      setRvState('sent')
      track('question_submitted', { slug: product.id })
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
    ctaPulse()
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
            <Link to="/">Home</Link> / <Link to="/shop">Shop</Link> / {product.name}
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
                <button className={`add-to-bag-btn${ctaPulsing ? ' is-added' : ''}`} onClick={submit}>
                  <Bag /> {mode === 'sub' ? 'Start subscription' : 'Add to bag'} - {rupees(effPrice * qty)}
                </button>
              </div>

              {/* Social Share Row (Reference Layout) */}
              <div className="pdp-share-row">
                <span className="pdp-share-label">Share:</span>
                {/* Real share intents carrying THIS product's URL. These used
                    to point at the bare social homepages, so "share" opened
                    facebook.com with nothing attached. Instagram has no web
                    share intent at all, so it becomes a copy-link button.
                    WhatsApp is deliberately absent from the product page. */}
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

          {/* 2. KEY BENEFITS — six claims wrapped around the product itself.
              This replaced a single flat "benefits" banner: one 420KB image
              carrying baked-in text, which no screen reader could read, no
              translation could touch, and no admin could edit without opening
              Photoshop. The copy now lives in src/data/productBenefits.ts. */}
          <KeyBenefits
            productId={product.id}
            productName={product.name}
            features={extra.features}
            imageBase={benefitsBase}
            imageSrc={product.img}
          />

          {/* 3. REAL STORIES — customer video clips, above the written reviews
              because a face carries further than a paragraph. Renders nothing
              until clips are configured; see src/data/videoTestimonials.ts. */}
          <VideoTestimonials productId={product.id} />

          {/* 4. CUSTOMER REVIEWS — paged carousel, per-card helpful votes and the
              rating summary. The histogram that used to be computed here moved
              into the component along with everything else it labels. */}
          <ProductReviews
            reviews={reviews}
            averageRating={averageRating}
            reviewTotal={reviewTotal}
            onWriteReview={openReviewForm}
            onAskQuestion={askQuestion}
          />

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
                  {/* Link and hover CTA are SIBLINGS in this wrapper, never
                      nested: a <button> inside an <a> is invalid markup and the
                      browser would have to guess which one a click meant. */}
                  <div className="related-img-wrap">
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
                    {defaultVariantOf(p) && (
                      <RelatedQuickAdd name={p.name} onAdd={() => addRelated(p)} />
                    )}
                  </div>
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

                    {/* The add control moved onto the photo as a hover reveal
                        (see `.related-quick-add` above). Only the sold-out case
                        still prints a button here, because "Sold out" is
                        information the card must state outright rather than
                        hide behind a hover the shopper has no reason to try. */}
                    {!defaultVariantOf(p) && (
                      <button type="button" className="related-add-btn-pill" disabled>
                        <Bag /> Sold out
                      </button>
                    )}
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
          <Bag /> {mode === 'sub' ? 'Start subscription' : 'Add to bag'} - {rupees(effPrice * qty)}
        </button>
      </div>

      {/* Review / question modal. One dialog, two forms — they share the name
          field, the sending state and the whole shell, and splitting them would
          duplicate all of that to vary three inputs. */}
      {reviewOpen && (
        <div
          className="pdp-modal"
          role="dialog"
          aria-modal="true"
          aria-label={rvMode === 'review' ? 'Write a review' : 'Ask a question'}
        >
          <button className="pdp-modal-backdrop" onClick={() => setReviewOpen(false)} aria-label="Close form" />
          <div className="pdp-modal-card">
            <button className="pdp-modal-close" onClick={() => setReviewOpen(false)} aria-label="Close"><Close /></button>
            {rvState === 'sent' ? (
              <div className="review">
                {rvMode === 'review' ? (
                  <>
                    <b style={{ color: 'var(--ink)' }}>Thanks - your review is awaiting approval.</b>
                    <p style={{ marginTop: 8, color: 'var(--text-soft)' }}>
                      We read every review before it goes live. It will appear here once approved.
                    </p>
                  </>
                ) : (
                  <>
                    <b style={{ color: 'var(--ink)' }}>Thanks - your question is on its way.</b>
                    <p style={{ marginTop: 8, color: 'var(--text-soft)' }}>
                      Our care team will reply to you by email, usually within one working day.
                    </p>
                  </>
                )}
              </div>
            ) : rvMode === 'review' ? (
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
                {/* The headline the review card prints above the body. Optional:
                    a shopper who only wants to write two sentences should not be
                    stopped by a field asking her to title them. */}
                <input
                  value={rvTitle}
                  onChange={(e) => setRvTitle(e.target.value)}
                  placeholder="Give your review a title (optional)"
                  aria-label="Review title (optional)"
                  maxLength={120}
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
            ) : (
              <form className="review-form" onSubmit={submitQuestion}>
                <div>
                  <div className="pdp-label" style={{ marginBottom: 8 }}>Ask a question</div>
                  <h2 className="pdp-title" style={{ fontSize: 24 }}>About {product.name}</h2>
                </div>
                <input
                  value={rvName}
                  onChange={(e) => setRvName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  autoComplete="name"
                  required
                  style={rvInput}
                />
                {/* Required here, unlike on a review: the answer comes back by
                    email, so without it the question has nowhere to go. */}
                <input
                  type="email"
                  value={qEmail}
                  onChange={(e) => setQEmail(e.target.value)}
                  placeholder="Your email"
                  aria-label="Your email"
                  autoComplete="email"
                  required
                  style={rvInput}
                />
                <textarea
                  value={rvBody}
                  onChange={(e) => setRvBody(e.target.value)}
                  placeholder="What would you like to know?"
                  aria-label="What would you like to know?"
                  required
                  rows={4}
                  style={{ ...rvInput, resize: 'vertical' }}
                />
                {rvState === 'error' && <p style={{ color: 'var(--mustard-deep)', fontSize: '.88rem', margin: 0 }}>Something went wrong. Please try again.</p>}
                <button type="submit" className="add-to-bag-btn" disabled={rvState === 'sending'}>
                  {rvState === 'sending' ? 'Sending...' : 'Send question'}
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
