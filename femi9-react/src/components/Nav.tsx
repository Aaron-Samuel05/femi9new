import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../store/cart'
import { Bag, ArrowRight, Menu } from './Icons'
import { IUser, ISearch } from './AppIcons'

const LINKS = [
  { to: '/#products', label: 'Shop' },
  { to: '/#why', label: 'Why Femi9' },
  { to: '/#story', label: 'About Us' },
  { to: '/blog', label: 'Journal' },
  { to: '/#impact', label: 'Opportunities' },
]

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
      <div className="nav-in">
        <Link to="/" className="nav-logo" aria-label="Femi9 home">
          <img src="/assets/img/logo.png" alt="Femi9" />
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
        </nav>
        <div className="nav-right">
          <button className="cart-btn nav-search" aria-label="Search"><ISearch /></button>
          <Link to="/dashboard" className="cart-btn nav-account" aria-label="My account"><IUser /></Link>
          <button className="cart-btn nav-bag" onClick={openCart} aria-label="Open bag">
            <Bag />
            <span className={`cart-count${count > 0 ? ' show' : ''}`}>{count}</span>
          </button>
          <Link to="/#products" className="btn nav-cta">Care for a Brighter Tomorrow <ArrowRight /></Link>
          <button className="burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><Menu /></button>
        </div>
      </div>
      <div className="nav-promo">A brighter period-care routine starts here. <Link to="/#products">Shop Femi9 <ArrowRight /></Link></div>
      <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        {LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}>{l.label}</Link>)}
        <Link to="/dashboard" onClick={() => setMenuOpen(false)}>My account</Link>
        <Link to="/#products" className="btn btn-primary" onClick={() => setMenuOpen(false)}>Shop pads</Link>
      </div>
    </header>
  )
}
