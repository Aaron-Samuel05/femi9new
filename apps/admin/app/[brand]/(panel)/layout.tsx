import { requireConsole } from '@/lib/guard'
import { brandConfig, type AdminModule } from '@femi9/core/brands'
import { brandsFor } from '@femi9/core/admin-identity'
import { AdminShell, type NavGroup } from './_shell'

/**
 * The console shell's server half. It resolves the session, works out which
 * sections this brand actually has, and hands a plain description of the nav to
 * `<AdminShell>` — which is a client component only because the mobile drawer
 * needs a piece of state.
 *
 * The nav is built FROM the brand's module list, so a brand that does not have
 * a module never sees a link to it — and the route itself 404s regardless,
 * because a hidden link is decoration.
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
  content: 'Blog',
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
  // The content module's only page is the blog index; there is no /content.
  content: '/content/blog',
  reviews: '/reviews',
  community: '/community',
  affiliates: '/affiliates',
  partners: '/partners',
  thara: '/thara',
  settings: '/settings',
}

/**
 * The sidebar's eyebrow headings, in order. Every module belongs to exactly one
 * group; a group whose modules this brand does not have is dropped whole, so
 * Lumi9 never renders an empty "Growth" heading.
 */
const GROUPS: { eyebrow: string; modules: AdminModule[] }[] = [
  { eyebrow: 'Overview', modules: ['dashboard'] },
  { eyebrow: 'Catalog', modules: ['catalog', 'inventory'] },
  { eyebrow: 'Sales', modules: ['orders', 'subscriptions', 'customers', 'coupons'] },
  { eyebrow: 'Growth', modules: ['affiliates', 'partners'] },
  { eyebrow: 'Programs', modules: ['thara'] },
  { eyebrow: 'Content', modules: ['content', 'reviews', 'community'] },
  { eyebrow: 'Configure', modules: ['settings', 'pricing'] },
]

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

  const has = new Set(config.modules)
  const groups: NavGroup[] = GROUPS.map((group) => ({
    eyebrow: group.eyebrow,
    items: group.modules
      .filter((m) => has.has(m))
      .map((m) => ({
        module: m,
        label: LABELS[m],
        href: `/${session.brand}${HREF[m]}`,
        // The dashboard's href IS the brand root, so a prefix match would leave
        // it lit on every other page.
        exact: m === 'dashboard',
      })),
  })).filter((group) => group.items.length > 0)

  return (
    <AdminShell
      brand={session.brand}
      brandName={config.name}
      host={config.host}
      accent={config.accent}
      groups={groups}
      who={{ name: session.name, role: session.role }}
      switches={mine
        .filter((b) => b !== session.brand)
        .map((b) => ({ brand: b, shortName: brandConfig(b).shortName }))}
      showGroupLink={mine.length > 1}
    >
      {children}
    </AdminShell>
  )
}
