'use client'

import { useState, type FormEvent } from 'react'
import { Link } from '@/lib/router-compat'
import { useCart } from '../store/cart'
import { WA_NUMBER } from '../data/products'
import { Instagram, Facebook, Youtube, Linkedin, Whatsapp } from './Icons'

const WA = `https://wa.me/${WA_NUMBER}`
const IG = 'https://www.instagram.com/femi9official/'

const SOCIALS = [
  { href: IG, label: 'Instagram', Icon: Instagram },
  { href: 'https://www.facebook.com/femi9official/', label: 'Facebook', Icon: Facebook },
  { href: 'https://www.youtube.com/@femi9official', label: 'YouTube', Icon: Youtube },
  { href: 'https://www.linkedin.com/company/femi9-official/', label: 'LinkedIn', Icon: Linkedin },
  { href: WA, label: 'WhatsApp', Icon: Whatsapp },
]

export function Footer() {
  const { notify } = useCart()
  const [email, setEmail] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const value = email.trim()
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      notify('Please enter a valid email')
      return
    }
    setEmail('')
    notify('Thanks! You are on the list')
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
                />
                <button type="submit" className="nl-submit">
                  SUBSCRIBE
                </button>
              </form>
            </div>

            <div className="footer-social">
              {SOCIALS.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Column 2: SHOP */}
          <div className="footer-col">
            <h4>Shop Our Products</h4>
            <Link to="/product/p330dw">330mm XL Pads (Heavy Flow)</Link>
            <Link to="/product/p290l9">290mm Large Pads (Regular Flow)</Link>
            <Link to="/product/p180m9">180mm Mini Pads (Light Flow & Daily Freshness)</Link>
          </div>

          {/* Column 3: FEMI9 */}
          <div className="footer-col">
            <h4>FEMI9</h4>
            <Link to="/#why">Why Femi9</Link>
            <Link to="/about">Our Story</Link>
            <Link to="/#opportunities">Impact</Link>
            <Link to="/dashboard">My dashboard</Link>
          </div>

          {/* Column 4: SUPPORT */}
          <div className="footer-col">
            <h4>SUPPORT</h4>
            <a href={WA} target="_blank" rel="noopener noreferrer">
              Phone: +91 90429 16499
            </a>
            <a href="mailto:support@femi9.in">
              Email: support@femi9.in
            </a>
            <a href={WA} target="_blank" rel="noopener noreferrer">
              Contact us via WhatsApp
            </a>
            <a href={IG} target="_blank" rel="noopener noreferrer">
              @femi9official
            </a>
            <Link to="/admin">Admin dashboard</Link>
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
