'use client'
import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, useRouter } from '@/lib/router-compat'
import { PRODUCTS, rupees, subPrice, SUBSCRIBE_PCT, CADENCES } from '../data/products'
import { useCart } from '../store/cart'
import { ProductCard } from '../components/ProductCard'
import { PantyArt } from '../components/PantyArt'
import { Bag, Drop, Leaf, ShieldCheck, Check } from '../components/Icons'
import { IStar } from '../components/AppIcons'
import type { ProductWithVariants, ProductReview } from '@/lib/services/products'
// ProductExtra lives in the data module; the service imports but does not re-export it.
import type { ProductExtra } from '@/data/productDetail'

interface Props {
  product: ProductWithVariants
  extra: ProductExtra
  reviews: ProductReview[]
}

const featIcons = [Drop, Leaf, ShieldCheck]

// Shared input styling for the review form. Inlined (rather than a new CSS class)
// because this file is the only one we may touch; it mirrors the site's field
// look via existing CSS variables.
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

export function ProductDetail({ product, extra, reviews }: Props) {
  const [imgIdx, setImgIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [packIdx, setPackIdx] = useState<number>((product.packs?.length ?? 1) - 1)
  const [sizeIdx, setSizeIdx] = useState(1)
  const [mode, setMode] = useState<'once' | 'sub'>('once')
  const [cadence, setCadence] = useState(CADENCES[0].id)
  const { add, openCart, notify } = useCart()
  const router = useRouter()

  // ── "Write a review" form ─────────────────────────────────────────────
  // A submission is additive: it never joins the rendered `reviews` list here
  // (that list is approved-only). It POSTs to /api/reviews, lands as `pending`,
  // and the form flips to a thank-you state awaiting moderation.
  const [rvName, setRvName] = useState('')
  const [rvPlace, setRvPlace] = useState('')
  const [rvBody, setRvBody] = useState('')
  const [rvRating, setRvRating] = useState(5)
  const [rvState, setRvState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submitReview = async (e: FormEvent) => {
    e.preventDefault()
    if (rvState === 'sending') return
    setRvState('sending')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // product.id maps to the DB slug (see products service), which the
          // API expects to resolve the product to review.
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

  const isPanty = product.type === 'panty'
  const packs = product.packs
  const related = PRODUCTS.filter((p) => p.id !== product.id)
  const mmPart = product.meta.split('·').pop()?.trim() ?? ''

  const selectedPack = packs ? packs[packIdx] : null
  const basePrice = selectedPack ? selectedPack.price : product.price
  const effPrice = mode === 'sub' ? subPrice(basePrice) : basePrice
  const metaDisplay = selectedPack
    ? `${selectedPack.count} pads · ${mmPart}`
    : isPanty
      ? `Size ${product.sizes?.[sizeIdx]} · ${product.meta}`
      : product.meta
  const activeCadence = CADENCES.find((c) => c.id === cadence) ?? CADENCES[0]

  const submit = async () => {
    // Resolve the on-screen selection to a concrete VARIANT id — the cart and the
    // subscription API are both variant-aware, so we must tell the server which
    // pack/size the shopper picked (adding the product id would be ambiguous).
    const variant = isPanty
      ? product.variants.find((v) => v.kind === 'size' && v.size === product.sizes?.[sizeIdx])
      : product.variants.find((v) => v.kind === 'pack' && v.packCount === selectedPack?.count)
    if (!variant) {
      notify('Sorry, that option is currently unavailable')
      return
    }

    if (mode === 'sub') {
      // Subscriptions are real, per-user records, so they require an account. POST
      // straight away: an unauthenticated request comes back 401 (nothing created),
      // which we treat as "sign in first" and send the shopper to /login.
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

    // One-time purchase — the server applies the quantity, so add once, not in a loop.
    void add(variant.id, qty)
    openCart()
  }

  return (
    <>
      <section className="pdp-section">
        <div className="wrap">
          <div className="crumbs">
            <Link to="/">Home</Link> / <Link to="/#products">Shop</Link> / {product.name}
          </div>
          <div className="pdp">
            <div className="pdp-gallery">
              <div className="pdp-main">
                {isPanty ? (
                  <PantyArt variant={extra.gallery[imgIdx] as 'lilac' | 'plum' | 'gold'} />
                ) : (
                  <img src={extra.gallery[imgIdx]} alt={product.name} />
                )}
              </div>
              <div className="pdp-thumbs">
                {extra.gallery.map((g, i) => (
                  <button key={i} className={`pdp-thumb${i === imgIdx ? ' on' : ''}`} onClick={() => setImgIdx(i)} aria-label={`View ${i + 1}`}>
                    {isPanty ? <PantyArt variant={g as 'lilac' | 'plum' | 'gold'} /> : <img src={g} alt="" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="pdp-info">
              <span className="pdp-flow">{product.flow}</span>
              <h1>{product.name}</h1>
              <div className="pdp-rating">
                <Stars rating={extra.rating} />
                <span>{extra.rating} · {extra.reviews} reviews</span>
              </div>
              <div className="pdp-price">
                <b>{rupees(effPrice)}</b>
                {mode === 'sub' && <span className="pdp-was">{rupees(basePrice)}</span>}
                <span className="unit">{metaDisplay}</span>
              </div>
              <p className="pdp-long">{extra.long}</p>

              {packs && (
                <div className="pdp-choose">
                  <div className="pdp-block-label">Choose your pack</div>
                  <div className="pack-opts">
                    {packs.map((p, i) => (
                      <button key={p.count} className={`pack-opt${i === packIdx ? ' on' : ''}`} onClick={() => setPackIdx(i)}>
                        <b>{p.count} pcs</b>
                        <span>{rupees(p.price)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isPanty && product.sizes && (
                <div className="pdp-choose">
                  <div className="pdp-block-label">Choose your size</div>
                  <div className="size-pills">
                    {product.sizes.map((s, i) => (
                      <button key={s} className={`size-pill${i === sizeIdx ? ' on' : ''}`} onClick={() => setSizeIdx(i)} aria-pressed={i === sizeIdx}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Subscribe & save */}
              <div className="sub-module">
                <button className={`sub-mode${mode === 'once' ? ' on' : ''}`} onClick={() => setMode('once')}>
                  <span className="sub-radio" aria-hidden="true" />
                  <span className="sub-mode-txt"><b>One-time purchase</b><span>{rupees(basePrice)}</span></span>
                </button>
                <button className={`sub-mode${mode === 'sub' ? ' on' : ''}`} onClick={() => setMode('sub')}>
                  <span className="sub-radio" aria-hidden="true" />
                  <span className="sub-mode-txt">
                    <b>Subscribe &amp; save {SUBSCRIBE_PCT}%</b>
                    <span>{rupees(subPrice(basePrice))} · skip or cancel anytime</span>
                  </span>
                  <span className="sub-save">Save {SUBSCRIBE_PCT}%</span>
                </button>
                {mode === 'sub' && (
                  <div className="sub-detail">
                    <div className="sub-cadences">
                      {CADENCES.map((c) => (
                        <button key={c.id} className={`cad${cadence === c.id ? ' on' : ''}`} onClick={() => setCadence(c.id)}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <p className="sub-next">
                      <Check /> Next delivery <b>{deliveryDate(activeCadence.days)}</b> - {activeCadence.sub}.
                    </p>
                  </div>
                )}
              </div>

              <div className="buy-row">
                <div className="stepper">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">&minus;</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
                </div>
                <button className="btn btn-primary" onClick={submit}>
                  <Bag /> {mode === 'sub' ? 'Start subscription' : 'Add to bag'} · {rupees(effPrice * qty)}
                </button>
              </div>

              <div className="pdp-features">
                {extra.features.map((f, i) => {
                  const Icon = featIcons[i % featIcons.length]
                  return (
                    <div className="pdp-feat" key={f.title}>
                      <span className="ficon"><Icon /></span>
                      <div><b>{f.title}</b><p>{f.body}</p></div>
                    </div>
                  )
                })}
              </div>

              <div className="pdp-block-label">Specifications</div>
              <div className="spec-list">
                {extra.specs.map((s) => (
                  <div className="spec-row" key={s.k}>
                    <span className="k">{s.k}</span>
                    <span className="v">{s.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-head">
            <div>
              <span className="eyebrow">Reviews</span>
              <h2 className="display" style={{ marginTop: 12 }}>What women say</h2>
            </div>
          </div>
          <div className="reviews">
            {reviews.map((r) => (
              <div className="review" key={r.name}>
                <Stars rating={r.rating} />
                <p>“{r.body}”</p>
                <div className="who"><b>{r.name}</b> · {r.place}</div>
              </div>
            ))}
          </div>

          {/* Write a review — additive submission form; approved reviews render above. */}
          <div style={{ marginTop: 26, maxWidth: 640 }}>
            {rvState === 'sent' ? (
              <div className="review">
                <b style={{ color: 'var(--navy)' }}>Thanks - your review is awaiting approval.</b>
                <p style={{ marginTop: 8, color: 'var(--muted)' }}>
                  We read every review before it goes live. It’ll appear here once approved.
                </p>
              </div>
            ) : (
              <form className="review" onSubmit={submitReview} style={{ display: 'grid', gap: 14 }}>
                <div className="pdp-block-label" style={{ marginBottom: 0 }}>Write a review</div>

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
                  required
                  style={rvInput}
                />
                <input
                  value={rvPlace}
                  onChange={(e) => setRvPlace(e.target.value)}
                  placeholder="City (optional)"
                  style={rvInput}
                />
                <textarea
                  value={rvBody}
                  onChange={(e) => setRvBody(e.target.value)}
                  placeholder="Share your experience"
                  required
                  rows={4}
                  style={{ ...rvInput, resize: 'vertical' }}
                />

                {rvState === 'error' && (
                  <p style={{ color: '#c0392b', fontSize: '.88rem', margin: 0 }}>
                    Something went wrong. Please try again.
                  </p>
                )}

                <div>
                  <button type="submit" className="btn btn-primary" disabled={rvState === 'sending'}>
                    {rvState === 'sending' ? 'Submitting…' : 'Submit review'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      <section className="section why">
        <div className="wrap">
          <div className="sec-head"><div><h2 className="display">You may also like</h2></div></div>
          <div className="grid-products">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
