import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../store/cart'
import { Bag, Menu } from './Icons'
import { IUser } from './AppIcons'

const LINKS = [
  { to: '/#products', label: 'Products' },
  { to: '/#why', label: 'Why Femi9' },
  { to: '/blog', label: 'Journal' },
  { to: '/periods-wall', label: 'Periods Wall' },
  { to: '/partner', label: 'Opportunities' },
]

// secondary links — shown in the mobile menu + footer, not the desktop bar
const MORE = [{ to: '/affiliate', label: 'Affiliate' }]

export function Nav() {
  const { count, openCart } = useCart()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 12)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}`} id="nav">
      <div className="wrap nav-in">
        <Link to="/" className="nav-logo" aria-label="Femi9 home">
          <img src="/assets/img/logo.png" alt="Femi9" />
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <Link to="/dashboard" className="cart-btn" aria-label="My account">
            <IUser />
          </Link>
          <button className="cart-btn" onClick={openCart} aria-label="Open bag">
            <Bag />
            <span className={`cart-count${count > 0 ? ' show' : ''}`}>{count}</span>
          </button>
          <Link to="/#products" className="btn btn-primary nav-cta">
            Shop pads
          </Link>
          <button className="burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <Menu />
          </button>
        </div>
      </div>
      <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        {[...LINKS, ...MORE].map((l) => (
          <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}>
            {l.label}
          </Link>
        ))}
        <Link to="/dashboard" onClick={() => setMenuOpen(false)}>My dashboard</Link>
        <Link to="/#products" className="btn btn-primary" onClick={() => setMenuOpen(false)}>
          Shop pads
        </Link>
      </div>
    </header>
  )
}
