'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Brand } from '@femi9/db'
import type { AdminModule } from '@femi9/core/brands'
import { AdminNavLink } from './_nav'
import { SignOut } from './SignOut'

/**
 * The console shell — the markup half of the `.adm` design system.
 *
 * Above 900px it is a two-column grid: a fixed sidebar and a scrolling main
 * column. At or below 900px `.adm` collapses to a block, the sidebar becomes a
 * slide-out drawer, and the topbar grows a hamburger. All of that is CSS; the
 * only thing this component owns is the open/closed bit, which is why it is the
 * one client boundary in the shell.
 *
 * It renders nothing brand-specific of its own accord: the nav groups arrive
 * already filtered by the server against `brandConfig(session.brand).modules`,
 * so a brand without Thara has no Thara link — and `requireConsole` 404s the
 * route regardless, because a hidden link is only decoration.
 *
 * Brand switching and sign-out live in the sidebar foot rather than the topbar.
 * That is not taste: the mobile block gives every `.adm-btn` `width: 100%`, so
 * a button placed in the topbar goes full-bleed on a phone. `.adm-foot-link` is
 * the class the sheet already sizes to a 44px target down there.
 */

export interface NavItem {
  module: AdminModule
  label: string
  href: string
  /** The dashboard's href is the brand root, so it must match exactly. */
  exact?: boolean
}

export interface NavGroup {
  eyebrow: string
  items: NavItem[]
}

export interface ShellProps {
  brand: Brand
  brandName: string
  /** Public storefront host, for the "Storefront" link in the sidebar foot. */
  host: string
  accent: string
  groups: NavGroup[]
  who: { name: string; role: string }
  /** Brands this admin also holds a role in — never every brand. */
  switches: { brand: Brand; shortName: string }[]
  showGroupLink: boolean
  children: React.ReactNode
}

/** The console wordmark: a tinted tile carrying the brand initial. */
function BrandMark({ accent, letter }: { accent: string; letter: string }) {
  return (
    <svg className="adm-brand-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill={accent} />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="12"
        fontWeight="700"
        fill="#fff"
        fontFamily="inherit"
      >
        {letter}
      </text>
    </svg>
  )
}

export function AdminShell({
  brand,
  brandName,
  host,
  accent,
  groups,
  who,
  switches,
  showGroupLink,
  children,
}: ShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const pathname = usePathname()

  // Navigating inside the drawer closes it — otherwise the new page renders
  // behind a scrim nobody asked to keep.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // The drawer is `position: fixed`; without this the page behind it scrolls
  // under the finger on touch.
  useEffect(() => {
    if (!drawerOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [drawerOpen])

  // Escape closes it, the same as tapping the scrim.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const mark = <BrandMark accent={accent} letter={brandName.charAt(0)} />

  return (
    // `data-brand` re-points the accent ramp inside the sheet; `--accent` stays
    // for the handful of places that read it directly.
    <div className="adm" data-brand={brand} style={{ ['--accent' as string]: accent }}>
      {drawerOpen && (
        <div className="adm-scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      )}

      <aside className={drawerOpen ? 'adm-sidebar is-open' : 'adm-sidebar'}>
        <div className="adm-sidebar-header">
          <div className="adm-brand">
            {mark}
            <span className="adm-brand-name">{brandName}</span>
            <span className="adm-brand-badge">Ops</span>
          </div>
          <button
            type="button"
            className="adm-close-btn"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close navigation"
          >
            ✕
          </button>
        </div>

        <nav className="adm-nav" aria-label="Console sections">
          {groups.map((group) => (
            <div className="adm-nav-group" key={group.eyebrow}>
              <p className="adm-nav-eyebrow">{group.eyebrow}</p>
              {group.items.map((item) => (
                <AdminNavLink
                  key={item.module}
                  href={item.href}
                  label={item.label}
                  icon={item.module}
                  exact={item.exact}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="adm-sidebar-foot">
          {(switches.length > 0 || showGroupLink) && (
            <div className="adm-foot-switch">
              {switches.map((s) => (
                <Link key={s.brand} className="adm-foot-link" href={`/${s.brand}`}>
                  Switch to {s.shortName}
                </Link>
              ))}
              {/* Only when they hold more than one brand — there is nothing to
                  compare otherwise. */}
              {showGroupLink && (
                <Link className="adm-foot-link" href="/group">
                  Group
                </Link>
              )}
            </div>
          )}

          <div className="adm-who">
            <span className="adm-who-name">{who.name}</span>
            <span className="adm-who-role">{who.role}</span>
          </div>

          <div className="adm-foot-actions">
            <a
              className="adm-foot-link"
              href={`https://${host}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              Storefront
            </a>
            <SignOut brand={brand} />
          </div>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-topbar">
          <button
            type="button"
            className="adm-menu-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Drawer widths only — the desktop rule hides it, because the
              sidebar three inches to the left already carries the mark. */}
          <div className="adm-topbar-brand">
            {mark}
            <span className="adm-brand-badge">Ops</span>
          </div>

          <h1 className="adm-topbar-title">{brandName} Ops</h1>
        </header>

        <main className="adm-content">{children}</main>
      </div>
    </div>
  )
}
