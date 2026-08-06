import Link from 'next/link'
import { getGuestToken } from '@/lib/session'
import { EMPTY_CART, getCart } from '@/lib/services/cart'
import { getSettings } from '@/lib/services/settings'
import { rupees } from '@/data/products'
import { CheckoutForm } from './CheckoutForm'

// Reads the guest cookie + live cart, so it must render per-request, never cached.
export const dynamic = 'force-dynamic'

// Mirror of the service's flat courier fee — this is the DISPLAY summary; the
// order route recomputes the same numbers authoritatively at submit time.
const SHIPPING_FEE = 49

export default async function CheckoutPage() {
  const token = await getGuestToken()
  const [cart, { freeShipThreshold }] = await Promise.all([
    token ? getCart(token) : Promise.resolve(EMPTY_CART),
    getSettings(),
  ])

  if (cart.items.length === 0) {
    return (
      <main className="wrap section" style={{ textAlign: 'center', maxWidth: 640 }}>
        <span className="eyebrow">Checkout</span>
        <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '.4em 0 .3em' }}>Your bag is empty</h1>
        <p style={{ color: 'var(--muted)', marginBottom: '1.6rem' }}>
          Add something you love, then come back to check out.
        </p>
        <Link href="/#products" className="btn btn-primary">
          Shop pads
        </Link>
      </main>
    )
  }

  const shipping = cart.subtotal >= freeShipThreshold ? 0 : SHIPPING_FEE
  const total = cart.subtotal + shipping

  return (
    <main className="wrap section" style={{ maxWidth: 1040 }}>
      <span className="eyebrow">Checkout</span>
      <h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '.35em 0 1.4rem' }}>Almost there</h1>

      <div
        style={{
          display: 'grid',
          gap: 'clamp(24px,4vw,40px)',
          // auto-fit stacks to one column on narrow screens without a media query,
          // so the page never scrolls horizontally on mobile.
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          alignItems: 'start',
        }}
      >
        {/* Shipping details — primary action */}
        <CheckoutForm />

        {/* Order summary — recomputed from the server cart */}
        <aside
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--line-soft)',
            borderRadius: 'var(--r-card)',
            boxShadow: 'var(--shadow-sm)',
            padding: 'clamp(20px,3vw,28px)',
            position: 'sticky',
            top: 24,
          }}
        >
          <h2 style={{ fontSize: '1.15rem', marginBottom: '1rem' }}>Order summary</h2>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem' }}>
            {cart.items.map((it) => (
              <li key={it.variantId} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    flex: '0 0 auto',
                    borderRadius: 12,
                    overflow: 'hidden',
                    background: 'var(--cream-2)',
                  }}
                >
                  {it.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.img}
                      alt={it.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '.95rem' }}>{it.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>
                    {it.variantLabel} · Qty {it.qty}
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: '.9rem', whiteSpace: 'nowrap' }}>
                  {rupees(it.lineTotal)}
                </div>
              </li>
            ))}
          </ul>

          <div style={{ borderTop: '1px solid var(--line-soft)', margin: '1.2rem 0', paddingTop: '1rem', display: 'grid', gap: '.55rem' }}>
            <Row label="Subtotal" value={rupees(cart.subtotal)} />
            <Row label="Shipping" value={shipping === 0 ? 'Free' : rupees(shipping)} muted={shipping === 0} />
          </div>

          <div
            style={{
              borderTop: '1px solid var(--line)',
              paddingTop: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontWeight: 700,
              fontSize: '1.1rem',
            }}
          >
            <span>Total</span>
            <span>{rupees(total)}</span>
          </div>

          <p style={{ color: 'var(--muted)', fontSize: '.78rem', marginTop: '1rem', lineHeight: 1.5 }}>
            Your total is recomputed securely on the server before Razorpay opens.
          </p>
        </aside>
      </div>
    </main>
  )
}

/** A single label/value line in the summary. */
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.92rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: muted ? 'var(--forest-2)' : 'var(--ink)' }}>{value}</span>
    </div>
  )
}
