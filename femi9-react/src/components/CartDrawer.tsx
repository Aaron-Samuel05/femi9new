import { useEffect } from 'react'
import { useCart } from '../store/cart'
import { PRODUCTS, FREE_SHIP, WA_NUMBER, rupees } from '../data/products'
import { Bag, Close, Whatsapp } from './Icons'

const byId = (id: string) => PRODUCTS.find((p) => p.id === id)!

export function CartDrawer() {
  const { items, open, subtotal, closeCart, setQty } = useCart()
  const ids = Object.keys(items)
  const isEmpty = ids.length === 0

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCart()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, closeCart])

  function checkout() {
    if (isEmpty) return
    let msg = 'Hi Femi9! I would like to order:\n'
    for (const id of ids) {
      const p = byId(id)
      msg += `\n• ${p.name} x${items[id]} (${rupees(p.price * items[id])})`
    }
    msg += `\n\nTotal: ${rupees(subtotal)}`
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const away = FREE_SHIP - subtotal

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={closeCart} />
      <aside className={`drawer${open ? ' open' : ''}`} aria-label="Shopping bag" aria-hidden={!open}>
        <div className="drawer-head">
          <h3>Your bag</h3>
          <button className="drawer-close" onClick={closeCart} aria-label="Close bag">
            <Close />
          </button>
        </div>

        <div className="drawer-body">
          {isEmpty ? (
            <div className="cart-empty">
              <Bag />
              <p>
                Your bag is empty.
                <br />
                Comfort is one tap away.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  closeCart()
                  window.location.hash = '#products'
                }}
              >
                Shop pads
              </button>
            </div>
          ) : (
            ids.map((id) => {
              const p = byId(id)
              const qty = items[id]
              return (
                <div className="ci" key={id}>
                  <div className="ci-img">
                    <img src={p.img} alt={p.name} />
                  </div>
                  <div className="ci-info">
                    <b>{p.name}</b>
                    <small>{p.meta}</small>
                    <div className="ci-bottom">
                      <div className="qty">
                        <button onClick={() => setQty(id, qty - 1)} aria-label="Decrease quantity">
                          &minus;
                        </button>
                        <span>{qty}</span>
                        <button onClick={() => setQty(id, qty + 1)} aria-label="Increase quantity">
                          +
                        </button>
                      </div>
                      <span className="ci-price">{rupees(p.price * qty)}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {!isEmpty && (
          <div className="drawer-foot">
            <div className="row">
              <span>Subtotal</span>
              <span>{rupees(subtotal)}</span>
            </div>
            <div className="row total">
              <span>Total</span>
              <span>{rupees(subtotal)}</span>
            </div>
            <button className="btn btn-primary" onClick={checkout}>
              <Whatsapp />
              Checkout on WhatsApp
            </button>
            <p className="ship-hint">
              {away > 0 ? `Add ${rupees(away)} more for free shipping` : 'You have unlocked free shipping'}
            </p>
          </div>
        )}
      </aside>
    </>
  )
}
