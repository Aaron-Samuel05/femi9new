import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { Link, useLocation } from '@/lib/router-compat'
import { IHome, ICycle, IUser, ILeaf, IChart, IGrid, ITrend, IUsers, IBell, ISearch, IMenu } from '../components/AppIcons'

type Icon = ComponentType<SVGProps<SVGSVGElement>>
interface NavItem { to: string; label: string; Icon: Icon }
interface Group { title: string; items: NavItem[] }

const USER_NAV: Group[] = [
  { title: 'Menu', items: [
    { to: '/dashboard', label: 'Dashboard', Icon: IHome },
    { to: '/dashboard#cycle', label: 'Cycle tracker', Icon: ICycle },
    { to: '/account', label: 'Account & orders', Icon: IUser },
  ] },
  { title: 'More', items: [
    { to: '/', label: 'Shop', Icon: ILeaf },
    { to: '/admin', label: 'Admin dashboard', Icon: IChart },
  ] },
]

const ADMIN_NAV: Group[] = [
  { title: 'Overview', items: [{ to: '/admin', label: 'Dashboard', Icon: IGrid }] },
  { title: 'Analytics', items: [
    { to: '/admin#sales', label: 'Sales & demand', Icon: ITrend },
    { to: '/admin#customers', label: 'Customers', Icon: IUsers },
    { to: '/admin#cycle', label: 'Cycle insights', Icon: ICycle },
  ] },
  { title: 'Shop', items: [
    { to: '/', label: 'Storefront', Icon: ILeaf },
    { to: '/dashboard', label: 'User app', Icon: IUser },
  ] },
]

interface Props {
  variant: 'user' | 'admin'
  title: string
  subtitle?: string
  children: ReactNode
}

interface FootUser { name: string; sub: string; initials: string }

// Shown before /api/auth/me resolves, and whenever the shopper is signed out or
// the lookup fails — never the old hardcoded persona from '@/data/account'.
const GUEST_FOOT: FootUser = { name: 'Guest', sub: 'Not signed in', initials: 'G' }

/** Initials from a display name: first+last initial, or first two letters of a
 *  single-word name. Falls back to 'G' so the avatar is never blank. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'G'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Shell({ variant, title, subtitle, children }: Props) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const groups = variant === 'admin' ? ADMIN_NAV : USER_NAV

  // Real signed-in shopper for the CUSTOMER footer. The session lives in an
  // httpOnly cookie invisible to JS, so we ask the server who we are (same
  // pattern as Nav.tsx). The 'admin' shell keeps its static ops footer, so we
  // skip the fetch there entirely.
  const [customer, setCustomer] = useState<FootUser | null>(null)
  useEffect(() => {
    if (variant === 'admin') return
    let active = true
    fetch('/api/auth/me')
      // A signed-out request answers { user: null } (200); tolerate any non-OK too.
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return
        // Accept the likely envelopes: { user: {...} } or the bare session object.
        const u = data.user ?? (typeof data.sub === 'string' ? data : null)
        if (!u) return
        const name = typeof u.name === 'string' ? u.name.trim() : ''
        const label = name || 'Your account'
        const sub =
          (typeof u.email === 'string' && u.email) ||
          (typeof u.phone === 'string' && u.phone) ||
          'Member'
        setCustomer({ name: label, sub, initials: initialsFor(label) })
      })
      .catch(() => {
        // Network/parse failure: leave `customer` null so the footer stays Guest.
      })
    return () => {
      active = false
    }
  }, [variant])

  const foot = variant === 'admin'
    ? { name: 'Femi9 Ops', sub: 'Administrator', initials: 'FA' }
    : customer ?? GUEST_FOOT

  const isActive = (to: string) => {
    const [path, hash] = to.split('#')
    if (path !== loc.pathname) return false
    return hash ? loc.hash === `#${hash}` : !loc.hash
  }

  return (
    <div className="app">
      <div className={`scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <img src="/assets/img/logo-mark.svg" alt="Femi9" />
          {variant === 'admin' && <span className="badge">Admin</span>}
        </div>
        {groups.map((g) => (
          <div key={g.title}>
            <div className="side-group">{g.title}</div>
            {g.items.map((it) => (
              <Link
                key={it.label}
                to={it.to}
                className={`side-link${isActive(it.to) ? ' active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <it.Icon />
                {it.label}
              </Link>
            ))}
          </div>
        ))}
        <div className="sidebar-foot">
          <span className="avatar">{foot.initials}</span>
          <div>
            <b>{foot.name}</b>
            <span>{foot.sub}</span>
          </div>
        </div>
      </aside>

      <div className="app-body">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="icon-btn app-menu-btn" onClick={() => setOpen(true)} aria-label="Menu">
              <IMenu />
            </button>
            <div className="topbar-title">
              <h1>{title}</h1>
              {subtitle && <p>{subtitle}</p>}
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" type="button" aria-label="Search" title="Search is not available yet" disabled><ISearch /></button>
            <button className="icon-btn" type="button" aria-label="Notifications" title="Notifications are not available yet" disabled><IBell /></button>
            <span className="avatar">{foot.initials}</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
