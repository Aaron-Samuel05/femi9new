import { useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { PRODUCTS, rupees } from '../data/products'
import { EXTRAS, sampleReviews } from '../data/productDetail'
import { useCart } from '../store/cart'
import { ProductCard } from '../components/ProductCard'
import { Bag, Drop, Leaf, ShieldCheck } from '../components/Icons'
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

export function ProductDetail() {
  const { id } = useParams()
  const product = PRODUCTS.find((p) => p.id === id)
  const extra = id ? EXTRAS[id] : undefined
  const [imgIdx, setImgIdx] = useState(0)
  const [qty, setQty] = useState(1)
  const { add, openCart } = useCart()

  if (!product || !extra) return <Navigate to="/" replace />

  const related = PRODUCTS.filter((p) => p.id !== id)

  const addToBag = () => {
    for (let i = 0; i < qty; i++) add(product.id)
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
                <img src={extra.gallery[imgIdx]} alt={product.name} />
              </div>
              <div className="pdp-thumbs">
                {extra.gallery.map((g, i) => (
                  <button key={i} className={`pdp-thumb${i === imgIdx ? ' on' : ''}`} onClick={() => setImgIdx(i)} aria-label={`View ${i + 1}`}>
                    <img src={g} alt="" />
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
                <b>{rupees(product.price)}</b>
                <span className="unit">{product.meta}</span>
              </div>
              <p className="pdp-long">{extra.long}</p>

              <div className="pdp-block-label">Choose your size</div>
              <div className="size-opts">
                {PRODUCTS.map((v) => (
                  <Link key={v.id} to={`/product/${v.id}`} className={`size-opt${v.id === id ? ' on' : ''}`}>
                    <b>{v.name}</b>
                    <span>{v.meta}</span>
                  </Link>
                ))}
              </div>

              <div className="buy-row">
                <div className="stepper">
                  <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease">&minus;</button>
                  <span>{qty}</span>
                  <button onClick={() => setQty((q) => q + 1)} aria-label="Increase">+</button>
                </div>
                <button className="btn btn-primary" onClick={addToBag}>
                  <Bag /> Add to bag · {rupees(product.price * qty)}
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
              <h2 style={{ marginTop: 12 }}>What women say</h2>
            </div>
          </div>
          <div className="reviews">
            {sampleReviews.map((r) => (
              <div className="review" key={r.name}>
                <Stars rating={r.rating} />
                <p>"{r.body}"</p>
                <div className="who"><b>{r.name}</b> · {r.place} · {r.date}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section why">
        <div className="wrap">
          <div className="sec-head"><div><h2>You may also like</h2></div></div>
          <div className="grid-products">
            {related.map((p, i) => (
              <ProductCard key={p.id} product={p} delay={(i % 3 || undefined) as 1 | 2 | undefined} />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
