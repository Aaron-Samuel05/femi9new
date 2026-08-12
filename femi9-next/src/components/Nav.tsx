import { useEffect, useState } from 'react'
import { Link } from '@/lib/router-compat'
import { useCart } from '../store/cart'
import { Bag, Menu } from './Icons'
import { IUser } from './AppIcons'

const LINKS = [
  { to: '/#products', label: 'Products' },
  { to: '/#why', label: 'Why Femi9' },
  { to: '/about', label: 'About Us' },
  { to: '/blog', label: 'Journal' },
  { to: '/partner', label: 'Opportunities' },
]

// secondary links — shown in the mobile menu + footer, not the desktop bar
const MORE = [
  { to: '/periods-wall', label: 'Periods Wall' },
  { to: '/affiliate', label: 'Affiliate' },
]

export function Nav() {
  const { count, openCart } = useCart()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Client-resolved auth state. null = signed out / unknown (the safe default),
  // so a failed/slow /api/auth/me leaves the account entry pointing at /login.
  const [user, setUser] = useState<{ firstName?: string } | null>(null)

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

  // Reflect the session in the nav. The httpOnly cookie is invisible to JS, so we
  // ask the server who we are. Same-origin fetch sends the cookie by default.
  useEffect(() => {
    let active = true
    fetch('/api/auth/me')
      // A signed-out request may answer 401 — treat any non-OK as "no user".
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return
        // Tolerate the likely envelopes: { user: {...} }, { user: null }, or the
        // bare session object (identified by its `sub` claim).
        const u = data.user ?? (typeof data.sub === 'string' ? data : null)
        if (!u) return
        const name = typeof u.name === 'string' ? u.name.trim() : ''
        setUser({ firstName: name ? name.split(/\s+/)[0] : undefined })
      })
      .catch(() => {
        // Network/parse failure: stay signed-out so the icon links to /login.
      })
    return () => {
      active = false
    }
  }, [])

  const handleLinkClick = (to: string) => {
    setMenuOpen(false)
    if (to.startsWith('/#')) {
      const hash = to.substring(1)
      const el = document.querySelector(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  // Signed-in shoppers go to their account; everyone else to sign-in.
  const accountHref = user ? '/account' : '/login'

  return (
    <header className={`nav${scrolled ? ' scrolled' : ''}`} id="nav">
      <div className="wrap nav-in">
        <Link to="/" className="nav-logo" aria-label="Femi9 home">
          <img src="/assets/figma-home/navbar-imgImage29.png" alt="Femi9" />
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => handleLinkClick(l.to)}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          <Link to={accountHref} className="cart-btn" aria-label={user ? 'My account' : 'Sign in'}>
            <IUser />
          </Link>
          <button
            className="cart-btn"
            onClick={openCart}
            aria-label={count > 0 ? `Open bag, ${count} item${count === 1 ? '' : 's'}` : 'Open bag'}
          >
            <Bag />
            <span className={`cart-count${count > 0 ? ' show' : ''}`} aria-hidden="true">
              {count}
            </span>
          </button>
          <button
            className="burger"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Menu />
          </button>
        </div>
      </div>
      <div id="mobile-menu" className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        {[...LINKS, ...MORE].map((l) => (
          <Link key={l.to} to={l.to} onClick={() => handleLinkClick(l.to)}>
            {l.label}
          </Link>
        ))}
        <Link to={accountHref} onClick={() => setMenuOpen(false)}>
          {user ? (user.firstName ? `Hi, ${user.firstName}` : 'My account') : 'Sign in'}
        </Link>
      </div>
    </header>
  )
}
