import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight } from '../components/Icons'
import { PRODUCTS } from '../data/products'
import { useCart } from '../store/cart'
import './ProductOptions.css'

const PACKS = [3, 6, 9]

export function ProductOptions() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { add, setQty, openCart, notify } = useCart()
  const product = PRODUCTS.find((item) => item.id === id) ?? PRODUCTS[0]
  const [pack, setPack] = useState<number>(Number(product.meta.match(/\d+/)?.[0] ?? 9))
  const [quantity, setQuantity] = useState(1)

  const unitPrice = useMemo(() => {
    const currentPack = Number(product.meta.match(/\d+/)?.[0] ?? 9)
    return Math.round(product.price / currentPack * pack)
  }, [product, pack])

  const payNow = () => {
    add(product.id)
    setQty(product.id, quantity)
    notify(`${product.name} · ${pack} pads added to your bag`)
    openCart()
  }

  return (
    <main className="options-page">
      <div className="options-shell">
        <Link className="options-back" to="/"><span>←</span> Back to Femi9</Link>
        <div className="options-grid">
          <section className="options-media">
            <div className="options-glow" aria-hidden="true" />
            <div className="options-media-frame"><img src={product.img} alt={`${product.name} by Femi9`} /></div>
            <div className="options-dots">{PRODUCTS.slice(0, 4).map((item) => <i key={item.id} className={item.id === product.id ? 'active' : ''} />)}</div>
          </section>

          <section className="options-copy">
            <span className="options-eyebrow">FEMI9 PERIOD CARE</span>
            <h1>{product.name}</h1>
            <p className="options-subtitle">{product.desc}</p>
            <div className="options-divider" />

            <div className="options-section">
              <div className="options-heading"><b>Choose your pack</b><span>9 pads · 330mm</span></div>
              <div className="pack-grid">
                {PACKS.map((value) => (
                  <button key={value} type="button" className={`pack-card${pack === value ? ' selected' : ''}`} onClick={() => setPack(value)}>
                    <span>{value} pads</span>
                    <strong>Rs.{Math.round(product.price / Number(product.meta.match(/\d+/)?.[0] ?? 9) * value)}</strong>
                    {pack === value && <i>✓</i>}
                  </button>
                ))}
              </div>
            </div>

            <div className="options-section">
              <div className="options-heading"><b>Quantity</b><span>How many packs?</span></div>
              <div className="quantity-control">
                <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Decrease quantity">−</button>
                <strong>{quantity}</strong>
                <button type="button" onClick={() => setQuantity((value) => value + 1)} aria-label="Increase quantity">+</button>
              </div>
            </div>

            <div className="options-total"><span>Total</span><strong>Rs.{(unitPrice * quantity).toLocaleString('en-IN')}</strong></div>
            <button className="options-pay" type="button" onClick={payNow}>Pay Now <span><ArrowRight /></span></button>
            <p className="options-note">Secure checkout · Free shipping on orders above Rs.999</p>
          </section>
        </div>
      </div>
    </main>
  )
}
