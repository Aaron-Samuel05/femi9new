import { useState, type FormEvent } from 'react'
import { Link } from '@/lib/router-compat'
import { useCart } from '../store/cart'
import { WA_NUMBER } from '../data/products'
import { Instagram, Facebook, Youtube, Linkedin, Whatsapp, ArrowRight } from './Icons'

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

  // Client-only: nothing is sent anywhere. Wire this to a real endpoint later.
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
      <div className="footer-watermark" aria-hidden="true">
        <img src="/assets/img/logo-mark.svg" alt="" aria-hidden="true" />
      </div>
      <div className="wrap footer-in">
        <div className="footer-main">
          <div className="footer-brand">
            <img className="footer-logo-white" src="/assets/img/logo-mark.svg" alt="Femi9" />
            <p className="footer-est">Natural. Comfortable. Breathable.</p>
            <p className="footer-desc">
              Organic, breathable period care that is kinder to your body and the planet.
            </p>
            <div className="newsletter">
              <p className="nl-label">Care in your inbox</p>
              <form className="nl-form" onSubmit={onSubmit} noValidate>
                <label
                  htmlFor="footer-newsletter-email"
                  style={{
                    position: 'absolute',
                    width: 1,
                    height: 1,
                    padding: 0,
                    margin: -1,
                    overflow: 'hidden',
                    clip: 'rect(0, 0, 0, 0)',
                    whiteSpace: 'nowrap',
                    border: 0,
                  }}
                >
                  Email address
                </label>
                <input
                  id="footer-newsletter-email"
                  type="email"
                  placeholder="Your email address"
                  aria-label="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button type="submit">
                  Subscribe
                  <ArrowRight />
                </button>
              </form>
            </div>
            <div className="footer-social">
              {SOCIALS.map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener" aria-label={label}>
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          <div className="footer-col">
            <h4>Shop</h4>
            <Link to="/product/p330dw">330mm Double Wings</Link>
            <Link to="/product/p330cw">330mm Centre Wings</Link>
            <Link to="/product/p290l9">290mm Large</Link>
            <Link to="/product/p290l3">290mm Starter</Link>
          </div>

          <div className="footer-col">
            <h4>Femi9</h4>
            <Link to="/#why">Why Femi9</Link>
            <Link to="/#about">Our Story</Link>
            <Link to="/#opportunities">Impact</Link>
            <Link to="/dashboard">My dashboard</Link>
          </div>

          <div className="footer-col">
            <h4>Support</h4>
            <a href={WA} target="_blank" rel="noopener">
              Contact us
            </a>
            <a href={IG} target="_blank" rel="noopener">
              @femi9official
            </a>
            <Link to="/admin">Admin dashboard</Link>
            <p className="footer-addr">222/1, Pavizham Nagar, Thindal, Erode, Tamil Nadu 638012</p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; Femi9 2026. All rights reserved.</span>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  )
}
