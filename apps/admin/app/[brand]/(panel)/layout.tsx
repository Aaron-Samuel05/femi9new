import Link from 'next/link'
import { requireConsole } from '@/lib/guard'
import { brandConfig, type AdminModule } from '@femi9/core/brands'
import { brandsFor } from '@femi9/core/admin-identity'
import { SignOut } from './SignOut'

/**
 * The console shell. Its nav is rendered FROM the brand's module list, so a
 * brand that does not have a module never sees a link to it — and the route
 * itself 404s regardless, because a hidden link is decoration.
 */

const LABELS: Record<AdminModule, string> = {
  dashboard: 'Overview',
  catalog: 'Products',
  inventory: 'Inventory',
  orders: 'Orders',
  customers: 'Customers',
  coupons: 'Coupons',
  pricing: 'Pricing',
  subscriptions: 'Subscriptions',
  content: 'Content',
  reviews: 'Reviews',
  community: 'Community',
  affiliates: 'Affiliates',
  partners: 'Partners',
  thara: 'Thara',
  settings: 'Settings',
}

const HREF: Record<AdminModule, string> = {
  dashboard: '',
  catalog: '/products',
  inventory: '/inventory',
  orders: '/orders',
  customers: '/customers',
  coupons: '/coupons',
  pricing: '/pricing',
  subscriptions: '/subscriptions',
  content: '/content',
  reviews: '/reviews',
  community: '/community',
  affiliates: '/affiliates',
  partners: '/partners',
  thara: '/thara',
  settings: '/settings',
}

export default async function PanelLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ brand: string }>
}) {
  const { brand } = await params
  const { session } = await requireConsole(brand)
  const config = brandConfig(session.brand)
  // Only offer a switch to brands this person actually holds a role in.
  const mine = await brandsFor(session.sub)

  return (
    <div className="shell" style={{ ['--accent' as string]: config.accent }}>
      <aside className="side">
        <div className="sideHead">
          <span className="dot" />
          <span className="sideName">{config.name}</span>
        </div>
        <nav className="nav">
          {config.modules.map((m) => (
            <Link key={m} href={`/${session.brand}${HREF[m]}`}>
              {LABELS[m]}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="main">
        <div className="topbar">
          <span className="who">
            {session.name} · {session.role}
          </span>
          <div className="switcher">
            {mine
              .filter((b) => b !== session.brand)
              .map((b) => (
                <Link key={b} href={`/${b}`}>
                  Switch to {brandConfig(b).shortName}
                </Link>
              ))}
            <SignOut brand={session.brand} />
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
