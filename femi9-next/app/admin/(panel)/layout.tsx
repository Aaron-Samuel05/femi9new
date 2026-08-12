import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAdminSession } from '@/lib/admin-auth'
import '@/styles/admin.css'
import { AdminNavLink, SignOutButton } from './_nav'

// Authentication is cookie-backed and must be evaluated for every request.
export const dynamic = 'force-dynamic'

/**
 * Guarded admin shell. Server component: it resolves the session before any
 * child renders and redirects unauthenticated visitors to the login screen
 * (belt-and-braces with the edge middleware). The login page lives OUTSIDE this
 * (panel) group, so it never inherits this sidebar chrome.
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')

  return (
    <div className="adm">
      <aside className="adm-sidebar">
        <div className="adm-brand">
          <img className="adm-brand-mark" src="/assets/img/logo-mark.svg" alt="Femi9" />
          <span className="adm-brand-badge">Ops</span>
        </div>

        <nav className="adm-nav" aria-label="Admin">
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

      <div className="adm-main">
        <header className="adm-topbar">
          <h1 className="adm-topbar-title">Femi9 Ops</h1>
        </header>
        <main className="adm-content">{children}</main>
      </div>
    </div>
  )
}
