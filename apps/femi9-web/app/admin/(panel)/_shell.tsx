'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AdminNavLink, SignOutButton } from './_nav'

export interface AdminShellProps {
  session: {
    name: string
    email: string
  }
  tharaEnabled: boolean
  children: React.ReactNode
}

/**
 * Interactive Client Shell for the Admin Console.
 * On desktop (> 900px): renders a clean, scrollable vertical sidebar.
 * On mobile / tablet (≤ 900px): provides a Hamburger Menu button (☰) that opens
 * a smooth slide-out Drawer navigation with a backdrop blur scrim.
 */
export function AdminShell({ session, tharaEnabled, children }: AdminShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  // Automatically close the mobile drawer on route navigation
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  // Prevent background body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileMenuOpen])

  return (
    <div className="adm">
      {/* Mobile Drawer Backdrop Scrim */}
      {mobileMenuOpen && (
        <div
          className="adm-scrim"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Sidebar Navigation Drawer */}
      <aside className={`adm-sidebar ${mobileMenuOpen ? 'is-open' : ''}`}>
        <div className="adm-sidebar-header">
          <div className="adm-brand">
            <img className="adm-brand-mark" src="/assets/img/logo-mark.svg" alt="Femi9" />
            <span className="adm-brand-badge">Ops</span>
          </div>
          <button
            type="button"
            className="adm-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        <nav className="adm-nav" aria-label="Admin Navigation">
          <div className="adm-nav-group">
            <p className="adm-nav-eyebrow">Overview</p>
            <AdminNavLink href="/admin" label="Dashboard" icon="dashboard" exact />
          </div>

          <div className="adm-nav-group">
            <p className="adm-nav-eyebrow">Catalog</p>
            <AdminNavLink href="/admin/products" label="Products" icon="products" />
            <AdminNavLink href="/admin/inventory" label="Inventory" icon="inventory" />
          </div>

          <div className="adm-nav-group">
            <p className="adm-nav-eyebrow">Sales</p>
            <AdminNavLink href="/admin/orders" label="Orders" icon="orders" />
            <AdminNavLink href="/admin/subscriptions" label="Subscriptions" icon="subscriptions" />
            <AdminNavLink href="/admin/customers" label="Customers" icon="customers" />
            <AdminNavLink href="/admin/coupons" label="Coupons" icon="coupons" />
          </div>

          <div className="adm-nav-group">
            <p className="adm-nav-eyebrow">Growth</p>
            <AdminNavLink href="/admin/affiliates" label="Affiliates" icon="affiliates" />
            <AdminNavLink href="/admin/partners" label="Partners" icon="partners" />
          </div>

          {tharaEnabled && (
            <div className="adm-nav-group">
              <p className="adm-nav-eyebrow">Programs</p>
              <AdminNavLink href="/admin/thara" label="Thara Model" icon="thara" />
            </div>
          )}

          <div className="adm-nav-group">
            <p className="adm-nav-eyebrow">Content</p>
            <AdminNavLink href="/admin/content/blog" label="Blog" icon="blog" />
            <AdminNavLink href="/admin/reviews" label="Reviews" icon="reviews" />
            <AdminNavLink href="/admin/community" label="Community" icon="community" />
          </div>

          <div className="adm-nav-group">
            <p className="adm-nav-eyebrow">Configure</p>
            <AdminNavLink href="/admin/settings" label="Settings" icon="settings" />
            <AdminNavLink href="/admin/pricing" label="Pricing zones" icon="pricing" />
          </div>
        </nav>

        <div className="adm-sidebar-foot">
          <div className="adm-who">
            <span className="adm-who-name">{session.name}</span>
            <span className="adm-who-role">Administrator</span>
          </div>
          <div className="adm-foot-actions">
            <Link className="adm-foot-link" href="/">
              Storefront
            </Link>
            <SignOutButton />
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="adm-main">
        <header className="adm-topbar">
          <button
            type="button"
            className="adm-menu-toggle"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open menu navigation"
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
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div className="adm-topbar-brand">
            <img className="adm-brand-mark" src="/assets/img/logo-mark.svg" alt="Femi9" />
            <span className="adm-brand-badge">Ops</span>
          </div>

          <h1 className="adm-topbar-title">Femi9 Ops</h1>
        </header>

        <main className="adm-content">{children}</main>
      </div>
    </div>
  )
}
