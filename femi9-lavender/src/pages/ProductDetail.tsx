import { useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { PRODUCTS, rupees, subPrice, SUBSCRIBE_PCT, CADENCES } from '../data/products'
import { EXTRAS, sampleReviews } from '../data/productDetail'
import { useCart } from '../store/cart'
import { ProductCard } from '../components/ProductCard'
import { PantyArt } from '../components/PantyArt'
import { Bag, Drop, Leaf, ShieldCheck, Check } from '../components/Icons'
import { IStar } from '../components/AppIcons'

const featIcons = [Drop, Leaf, ShieldCheck]

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

function startSubscription(entry: Record<string, unknown>) {
  try {
    const key = 'femi9:subscriptions'
    const list = JSON.parse(localStorage.getItem(key) || '[]')
    list.push(entry)
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    /* storage unavailable — demo only */
  }
}

export function ProductDetail() {
  const { id } = useParams()
  const product = PRODUCTS.find((p) => p.id === id)
  const extra = id ? EXTRAS[id] : undefined
  const [imgIdx, setImgIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const [packIdx, setPackIdx] = useState<number>((product?.packs?.length ?? 1) - 1)
  const [sizeIdx, setSizeIdx] = useState(1)
  const [mode, setMode] = useState<'once' | 'sub'>('once')
  const [cadence, setCadence] = useState(CADENCES[0].id)
  const { add, openCart, notify } = useCart()

  if (!product || !extra) return <Navigate to="/" replace />

  const isPanty = product.type === 'panty'
  const packs = product.packs
  const related = PRODUCTS.filter((p) => p.id !== id)
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

  const submit = () => {
    if (mode === 'sub') {
      startSubscription({
        id: product.id,
        name: product.name,
        cadence,
        pack: selectedPack?.count,
        size: isPanty ? product.sizes?.[sizeIdx] : undefined,
        price: effPrice,
        qty,
        started: Date.now(),
      })
      notify(`Subscription started · ${product.name}`)
    } else {
      for (let i = 0; i < qty; i++) add(product.id)
      openCart()
    }
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
                      <Check /> Next delivery <b>{deliveryDate(activeCadence.days)}</b> — {activeCadence.sub}.
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
            {sampleReviews.map((r) => (
              <div className="review" key={r.name}>
                <Stars rating={r.rating} />
                <p>“{r.body}”</p>
                <div className="who"><b>{r.name}</b> · {r.place} · {r.date}</div>
              </div>
            ))}
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
