import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useCart } from '../store/cart'
import { FREE_SHIP, WA_NUMBER, rupees } from '../data/products'
import { Bag, Close, Whatsapp } from './Icons'

export function CartDrawer() {
  // Lines come straight from the server cart now — variant-aware and server-priced,
  // so there is no static PRODUCTS lookup that could miss a newly-created product.
  const { items, open, subtotal, closeCart, setQty } = useCart()
  const isEmpty = items.length === 0
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  // Basic focus handling: when the dialog opens, move focus into it (the close
  // control) so keyboard/AT users land on the drawer rather than being left
  // behind it; restore focus to the trigger when it closes.
  useEffect(() => {
    if (open) {
      lastFocusedRef.current = document.activeElement as HTMLElement | null
      closeBtnRef.current?.focus()
    } else if (lastFocusedRef.current) {
      lastFocusedRef.current.focus?.()
      lastFocusedRef.current = null
    }
  }, [open])

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

  // WhatsApp is now the SECONDARY path; the message is built from server lines.
  function orderOnWhatsApp() {
    if (isEmpty) return
    let msg = 'Hi Femi9! I would like to order:\n'
    for (const it of items) {
      msg += `\n• ${it.name} - ${it.variantLabel} x${it.qty} (${rupees(it.lineTotal)})`
    }
    msg += `\n\nTotal: ${rupees(subtotal)}`
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const away = FREE_SHIP - subtotal

  return (
    <>
      <div className={`overlay${open ? ' open' : ''}`} onClick={closeCart} />
      <aside
        className={`drawer${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping bag"
        aria-hidden={!open}
      >
        <div className="drawer-head">
          <h3>Your bag</h3>
          <button ref={closeBtnRef} className="drawer-close" onClick={closeCart} aria-label="Close bag">
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
                  window.location.assign('/#products')
                }}
              >
                Shop pads
              </button>
            </div>
          ) : (
            items.map((it) => (
              <div className="ci" key={it.variantId}>
                <div className="ci-img">
                  <img src={it.img} alt={it.name} />
                </div>
                <div className="ci-info">
                  <b>{it.name}</b>
                  <small>{it.variantLabel}</small>
                  <div className="ci-bottom">
                    <div className="qty">
                      <button onClick={() => setQty(it.variantId, it.qty - 1)} aria-label="Decrease quantity">
                        &minus;
                      </button>
                      <span>{it.qty}</span>
                      <button onClick={() => setQty(it.variantId, it.qty + 1)} aria-label="Increase quantity">
                        +
                      </button>
                    </div>
                    <span className="ci-price">{rupees(it.lineTotal)}</span>
                  </div>
                </div>
              </div>
            ))
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
            <Link href="/checkout" className="btn btn-primary" onClick={closeCart}>
              Proceed to checkout
            </Link>
            <button className="btn btn-ghost" onClick={orderOnWhatsApp}>
              <Whatsapp />
              Order on WhatsApp
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
