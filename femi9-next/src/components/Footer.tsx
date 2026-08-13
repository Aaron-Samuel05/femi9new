'use client'

import { useState, type FormEvent } from 'react'
import { Link } from '@/lib/router-compat'
import { useCart } from '../store/cart'
import { usePublicSettings } from '@/lib/use-public-settings'
import { Instagram, Facebook, Youtube, Linkedin, Whatsapp } from './Icons'

const IG = 'https://www.instagram.com/femi9official/'

const SOCIALS = [
  { href: IG, label: 'Instagram', Icon: Instagram },
  { href: 'https://www.facebook.com/femi9official/', label: 'Facebook', Icon: Facebook },
  { href: 'https://www.youtube.com/@femi9official', label: 'YouTube', Icon: Youtube },
  { href: 'https://www.linkedin.com/company/femi9-official/', label: 'LinkedIn', Icon: Linkedin },
]

/** Fallback shop column, used only until /api/settings resolves. These three
 *  slugs are also what the catalog has always shipped with, so the links are
 *  live rather than decorative — but the real list wins the moment it arrives. */
const FALLBACK_SHOP: { slug: string; name: string }[] = []

export function Footer() {
  const { notify } = useCart()
  const { whatsappNumber, tharaEnabled, shopLinks } = usePublicSettings()
  const wa = `https://wa.me/${whatsappNumber}`
  const [email, setEmail] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socials = [...SOCIALS, { href: `https://wa.me/${whatsappNumber}`, label: 'WhatsApp', Icon: Whatsapp }]
  const shop = shopLinks.length > 0 ? shopLinks : FALLBACK_SHOP

  /**
   * Real subscription. This used to clear the input and toast "Thanks! You are
   * on the list" without sending the address anywhere — the shopper was told
   * she had subscribed while her email was discarded. The confirmation now only
   * appears on a 2xx, and a failure says so inline instead of lying quietly.
   */
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    setError(null)
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Please enter a valid email address.')
      return
    }

    setSubscribing(true)
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, source: 'footer' }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; alreadySubscribed?: boolean }
      if (!res.ok) {
        setError(data.error ?? 'We could not sign you up just now. Please try again.')
        return
      }
      setEmail('')
      notify(data.alreadySubscribed ? 'You are already on the list' : 'Thanks! You are on the list')
    } catch {
      setError('We could not reach the server. Please check your connection.')
    } finally {
      setSubscribing(false)
    }
  }

  return (
    <footer className="footer">
      {/* Background Watermark SVG containing script wordmark & female silhouette */}
      <div className="footer-watermark" aria-hidden="true">
        <img className="footer-watermark-img" src="/assets/img/logo-mark.svg" alt="" />
      </div>

      <div className="wrap footer-in">
        <div className="footer-main">
          {/* Column 1: Brand Block */}
          <div className="footer-brand">
            <Link to="/" aria-label="Femi9 Home">
              <img className="footer-logo-white" src="/assets/figma-home/footer-imgImage1.png" alt="Femi9" />
            </Link>
            <p className="footer-tagline">Thoughtfully designed period care for comfort, confidence, and everyday movement.</p>
            <p className="footer-desc">
              Organic, breathable period care that is kinder to your body and the planet.
            </p>

            <div className="footer-newsletter">
              <p className="nl-label">CARE IN YOUR INBOX</p>
              <form className="nl-form" onSubmit={onSubmit} noValidate>
                <input
                  id="footer-newsletter-email"
                  type="email"
                  placeholder="Your email address"
                  aria-label="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'footer-newsletter-error' : undefined}
                  disabled={subscribing}
                />
                <button type="submit" className="nl-submit" disabled={subscribing}>
                  {subscribing ? 'SENDING…' : 'SUBSCRIBE'}
                </button>
              </form>
              {error && (
                <p id="footer-newsletter-error" role="alert" className="nl-error">
                  {error}
                </p>
              )}
            </div>

            <div className="footer-social">
              {socials.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Column 2: SHOP — resolved from the live catalog. Three slugs used to
              be hardcoded here, so archiving or renaming any of them turned a
              footer link on every page of the site into a 404 with no warning. */}
          <div className="footer-col">
            <h4>Shop Our Products</h4>
            {shop.length > 0 ? (
              shop.map((p) => (
                <Link key={p.slug} to={`/product/${p.slug}`}>
                  {p.name}
                </Link>
              ))
            ) : (
              <Link to="/#products">Browse all products</Link>
            )}
          </div>

          {/* Column 3: FEMI9 */}
          <div className="footer-col">
            <h4>FEMI9</h4>
            <Link to="/#why">Why Femi9</Link>
            <Link to="/about">Our Story</Link>
            <Link to="/#opportunities">Impact</Link>
            <Link to="/dashboard">My dashboard</Link>
            {/* Only shown when the programme is actually switched on — nothing
                anywhere in the product linked to /thara before this. */}
            {tharaEnabled && <Link to="/thara">Thara programme</Link>}
          </div>

          {/* Column 4: SUPPORT */}
          <div className="footer-col">
            <h4>SUPPORT</h4>
            <a href={wa} target="_blank" rel="noopener noreferrer">
              Phone: +91 90429 16499
            </a>
            <a href="mailto:support@femi9.in">
              Email: support@femi9.in
            </a>
            <a href={wa} target="_blank" rel="noopener noreferrer">
              Contact us via WhatsApp
            </a>
            <a href={IG} target="_blank" rel="noopener noreferrer">
              @femi9official
            </a>
            <p className="footer-addr">222/1, Pavizham Nagar, Thindal, Erode, Tamil Nadu 638012</p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="footer-bottom">
          <span>&copy; Femi9 2026. All rights reserved.</span>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  )
}
