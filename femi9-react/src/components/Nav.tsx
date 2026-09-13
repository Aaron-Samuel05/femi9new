import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../store/cart'
import { Bag, ArrowRight, Menu, Close } from './Icons'
import { IUser, ISearch } from './AppIcons'
import { PRODUCTS } from '../data/products'

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
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return PRODUCTS
    return PRODUCTS.filter((product) => `${product.name} ${product.flow} ${product.meta} ${product.desc}`.toLowerCase().includes(value))
  }, [query])

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
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!searchOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [searchOpen])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <>
      <header className={`nav${scrolled ? ' scrolled' : ''}`} id="nav">
        <div className="nav-in">
          <Link to="/" className="nav-logo" aria-label="Femi9 home">
            <img src="/assets/img/logo.png" alt="Femi9" />
          </Link>

          <nav className="nav-links" aria-label="Primary">
            {LINKS.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
          </nav>

          <div className="nav-right">
            <button className="cart-btn nav-search" aria-label="Search" onClick={() => setSearchOpen(true)}><ISearch /></button>
            <Link to="/dashboard" className="cart-btn nav-account" aria-label="My account"><IUser /></Link>
            <button className="cart-btn nav-bag" onClick={openCart} aria-label={`Open bag${count > 0 ? `, ${count} items` : ''}`}>
              <Bag />
              <span className={`cart-count${count > 0 ? ' show' : ''}`}>{count}</span>
            </button>
            <Link to="/#products" className="btn nav-cta">Care for a Brighter Tomorrow <ArrowRight /></Link>
            <button className="burger" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              {menuOpen ? <Close /> : <Menu />}
            </button>
          </div>
        </div>

        <div className="nav-promo">A brighter period-care routine starts here. <Link to="/#products">Shop Femi9 <ArrowRight /></Link></div>

        <div className={`mobile-menu${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
          <button className="mobile-search" onClick={() => { setMenuOpen(false); setSearchOpen(true) }}><ISearch /> Search Femi9</button>
          {LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setMenuOpen(false)}>{l.label}</Link>)}
          <Link to="/dashboard" onClick={() => setMenuOpen(false)}>My account</Link>
          <Link to="/#products" className="btn btn-primary" onClick={() => setMenuOpen(false)}>Shop pads</Link>
        </div>
      </header>

      {searchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search Femi9" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false) }}>
          <div className="search-panel">
            <div className="search-head">
              <div className="search-input-wrap"><ISearch /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products" aria-label="Search products" /></div>
              <button className="search-close" onClick={() => setSearchOpen(false)} aria-label="Close search"><Close /></button>
            </div>
            <div className="search-results">
              {results.length > 0 ? results.map((product) => (
                <Link key={product.id} to={`/product/${product.id}`} className="search-result" onClick={() => setSearchOpen(false)}>
                  <span className="search-result-image"><img src={product.img} alt="" /></span>
                  <span><b>{product.name}</b><small>{product.flow} · {product.meta} · Rs.{product.price}</small></span>
                  <ArrowRight />
                </Link>
              )) : <p className="search-empty">No products found. Try “large”, “heavy” or “starter”.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
