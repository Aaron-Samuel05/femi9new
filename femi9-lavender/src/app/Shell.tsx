import { useState, type ComponentType, type ReactNode, type SVGProps } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { user } from '../data/account'
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

export function Shell({ variant, title, subtitle, children }: Props) {
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const groups = variant === 'admin' ? ADMIN_NAV : USER_NAV
  const foot = variant === 'admin'
    ? { name: 'Femi9 Ops', sub: 'Administrator', initials: 'FA' }
    : { name: user.name, sub: user.tier, initials: user.initials }

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
            <button className="icon-btn" aria-label="Search"><ISearch /></button>
            <button className="icon-btn" aria-label="Notifications"><IBell /></button>
            <span className="avatar">{foot.initials}</span>
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  )
}
