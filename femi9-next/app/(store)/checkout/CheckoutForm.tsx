'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useCart } from '@/store/cart'

/**
 * Checkout form — collects shipping details, POSTs /api/checkout, then drives
 * the payment step returned in that response.
 *
 * On checkout success we refresh the client cart mirror (so the drawer empties
 * to match the now-deleted server cart) and then, depending on the payment
 * intent the server hands back:
 *   • configured (live Razorpay keys) → load Checkout.js, open the modal, and on
 *     a successful payment POST the handles to /api/payments/verify before
 *     routing to the confirmation. A dismissed modal routes to the pending
 *     order page so the shopper is not left on a checkout whose cart is gone.
 *   • not configured (test/mock mode) → there is no gateway, so we POST
 *     { mock:true } to /api/payments/verify to simulate a capture, and say so
 *     honestly with a "Test mode" note before routing.
 *
 * Server-side failures surface inline; the out-of-stock 409 message is shown
 * verbatim so the shopper knows exactly which item to fix.
 *
 * Styling stays on the storefront's tokens (var(--…)) + the shared .btn classes,
 * deliberately NOT the admin .adm-* system.
 */

const RAZORPAY_SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

// The payment intent mirrored from PlaceOrderResult.payment (see checkout.ts):
// `amount` is in RUPEES (matches Order.total); Razorpay wants PAISE, so we ×100
// only at the moment we hand it to the widget.
interface PaymentIntent {
  razorpayOrderId: string
  amount: number
  keyId: string
  configured: boolean
}

type CheckoutResponse = { orderNo?: string; payment?: PaymentIntent; token?: string; error?: string }

// Minimal shape of the Razorpay Checkout global we call into. Hand-declared
// (instead of pulling in @types/razorpay) to keep the dependency footprint nil.
interface RazorpaySuccess {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}
interface RazorpayOptions {
  key: string
  amount: number // paise
  currency: string
  name: string
  order_id: string
  prefill?: { name?: string; email?: string; contact?: string }
  handler?: (res: RazorpaySuccess) => void
  modal?: { ondismiss?: () => void }
}
interface RazorpayInstance {
  open: () => void
}
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance
  }
}

// Inject Checkout.js once, on demand (only shoppers with live keys ever load it),
// and resolve when window.Razorpay is ready. Resolves false on any load failure
// so the caller can fall back to an inline error rather than a dead button.
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false)
    if (window.Razorpay) return resolve(true)

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT_SRC}"]`)
    if (existing) {
      if (window.Razorpay) return resolve(true)
      existing.addEventListener('load', () => resolve(Boolean(window.Razorpay)), { once: true })
      existing.addEventListener('error', () => resolve(false), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = RAZORPAY_SCRIPT_SRC
    script.async = true
    script.onload = () => resolve(Boolean(window.Razorpay))
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

type Field = 'name' | 'phone' | 'email' | 'line' | 'city' | 'state' | 'pincode'

const EMPTY: Record<Field, string> = {
  name: '',
  phone: '',
  email: '',
  line: '',
  city: '',
  state: '',
  pincode: '',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '.72rem .95rem',
  borderRadius: 14,
  border: '1.5px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'inherit',
  outline: 'none',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '.82rem',
  fontWeight: 600,
  color: 'var(--ink)',
  marginBottom: '.35rem',
}

export function CheckoutForm() {
  const router = useRouter()
  const { refresh } = useCart()

  const [form, setForm] = useState<Record<Field, string>>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  // Informational, non-error note (currently used for test-mode disclosure).
  const [note, setNote] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (key: Field, value: string) => setForm((f) => ({ ...f, [key]: value }))

  // Phone/pincode are digit-only; strip as the user types so validation is simple.
  const onDigits = (key: Field, value: string, max: number) => set(key, value.replace(/\D/g, '').slice(0, max))

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {}
    if (!form.name.trim()) next.name = 'Please enter your name.'
    if (form.phone.length !== 10) next.phone = 'Enter your 10-digit mobile number.'
    if (!form.line.trim()) next.line = 'Please enter your address.'
    if (!form.city.trim()) next.city = 'Please enter your city.'
    if (form.pincode && form.pincode.length !== 6) next.pincode = 'Enter a valid 6-digit pincode.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  // POST the verify payload (live handles or { mock:true }). Returns whether the
  // capture was accepted; the confirmation page reflects the true order status
  // regardless, so callers navigate either way and only surface hard failures.
  async function postVerify(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    return Boolean(res && res.ok)
  }

  // Mock mode: no gateway to open, so simulate a captured payment against the
  // pending order and be upfront that it's a test.
  async function simulateMockPayment(orderNo: string, token: string) {
    setNote('Test mode - simulating payment…')
    const okv = await postVerify({ orderNo, mock: true })
    if (!okv) {
      setFormError('We could not confirm the test payment. Please try again.')
      setNote(null)
      setSubmitting(false)
      return
    }
    router.push('/order/' + orderNo + '?t=' + token)
  }

  // Live mode: open the Razorpay Checkout modal for the gateway order the server
  // opened. On success we verify the signature server-side then route; on dismiss
  // the order stays pending and we route to its truthful status page.
  async function openRazorpay(orderNo: string, payment: PaymentIntent, token: string) {
    const ready = await loadRazorpayScript()
    if (!ready || !window.Razorpay) {
      setFormError('We could not load the payment window. Please check your connection and try again.')
      setSubmitting(false)
      return
    }

    const rzp = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount * 100, // rupees → paise for the widget
      currency: 'INR',
      name: 'Femi9',
      order_id: payment.razorpayOrderId,
      prefill: {
        name: form.name,
        email: form.email.trim() || undefined,
        contact: form.phone,
      },
      handler: (res) => {
        // Route to the confirmation regardless of the verify outcome: the page
        // reads the live order status, so a verify hiccup still shows the truthful
        // pending/paid state (and the webhook can still finalize it).
        void postVerify({
          razorpay_order_id: res.razorpay_order_id,
          razorpay_payment_id: res.razorpay_payment_id,
          razorpay_signature: res.razorpay_signature,
          orderNo,
        }).finally(() => router.push('/order/' + orderNo + '?t=' + token))
      },
      modal: {
        ondismiss: () => {
          // The cart was consumed when the pending order was created, so keeping
          // the shopper on checkout would leave them with no valid retry path.
          router.push('/order/' + orderNo + '?t=' + token)
        },
      },
    })
    rzp.open()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setNote(null)
    if (!validate()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await res.json().catch(() => ({}))) as CheckoutResponse

      if (!res.ok) {
        // 409 out-of-stock / 400 empty-or-invalid — show the server's message.
        setFormError(data.error ?? 'Sorry, we could not place your order. Please try again.')
        setSubmitting(false)
        return
      }

      // Empty the drawer to match the server (cart was deleted), then pay.
      await refresh()

      const orderNo = data.orderNo
      if (!orderNo) {
        setFormError('Sorry, we could not place your order. Please try again.')
        setSubmitting(false)
        return
      }

      // Capability token that authorizes the confirmation page (guests have no
      // session); carried through to the /order/<no>?t=<token> navigation.
      const token = data.token ?? ''

      // Hand off to the right payment flow. `submitting` stays true across the
      // async payment step so the button remains disabled; hard failures re-enable
      // it, while a modal dismissal routes to the pending-order page.
      if (data.payment?.configured) {
        await openRazorpay(orderNo, data.payment, token)
      } else {
        await simulateMockPayment(orderNo, token)
      }
    } catch {
      setFormError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-soft)',
        borderRadius: 'var(--r-card)',
        boxShadow: 'var(--shadow-sm)',
        padding: 'clamp(20px,3vw,32px)',
      }}
    >
      <h2 style={{ fontSize: '1.15rem', marginBottom: '1.25rem' }}>Shipping details</h2>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <FormField label="Full name" error={errors.name} full>
          <input
            style={inputStyle}
            type="text"
            autoComplete="name"
            placeholder="e.g. Lakshmi Priya"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={!!errors.name}
          />
        </FormField>

        <FormField label="Phone number" error={errors.phone}>
          <input
            style={inputStyle}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="10-digit mobile"
            value={form.phone}
            onChange={(e) => onDigits('phone', e.target.value, 10)}
            aria-invalid={!!errors.phone}
          />
        </FormField>

        <FormField label="Email (optional)" error={errors.email}>
          <input
            style={inputStyle}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />
        </FormField>

        <FormField label="Address" error={errors.line} full>
          <input
            style={inputStyle}
            type="text"
            autoComplete="street-address"
            placeholder="House / flat, street, area"
            value={form.line}
            onChange={(e) => set('line', e.target.value)}
            aria-invalid={!!errors.line}
          />
        </FormField>

        <FormField label="City" error={errors.city}>
          <input
            style={inputStyle}
            type="text"
            autoComplete="address-level2"
            placeholder="e.g. Coimbatore"
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            aria-invalid={!!errors.city}
          />
        </FormField>

        <FormField label="State (optional)">
          <input
            style={inputStyle}
            type="text"
            autoComplete="address-level1"
            placeholder="e.g. Tamil Nadu"
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
          />
        </FormField>

        <FormField label="Pincode (optional)" error={errors.pincode}>
          <input
            style={inputStyle}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="6-digit pincode"
            value={form.pincode}
            onChange={(e) => onDigits('pincode', e.target.value, 6)}
            aria-invalid={!!errors.pincode}
          />
        </FormField>
      </div>

      {formError && (
        <p
          role="alert"
          style={{
            marginTop: '1.1rem',
            padding: '.7rem .9rem',
            borderRadius: 12,
            background: 'rgba(216,162,47,.12)',
            border: '1px solid rgba(216,162,47,.4)',
            color: 'var(--navy)',
            fontSize: '.88rem',
            lineHeight: 1.45,
          }}
        >
          {formError}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting}
        style={{ width: '100%', marginTop: '1.4rem', opacity: submitting ? 0.75 : 1 }}
      >
        {submitting ? 'Preparing payment…' : 'Continue to secure payment'}
      </button>

      <p style={{ color: 'var(--muted)', fontSize: '.78rem', marginTop: '.8rem', textAlign: 'center' }}>
        Pay securely with Razorpay. UPI, cards and netbanking are supported.
      </p>
    </form>
  )
}

/** Labeled field wrapper; `full` spans both grid columns. */
function FormField({
  label,
  error,
  full,
  children,
}: {
  label: string
  error?: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && (
        <span style={{ display: 'block', marginTop: '.35rem', color: '#b4322f', fontSize: '.78rem' }}>{error}</span>
      )}
    </div>
  )
}
