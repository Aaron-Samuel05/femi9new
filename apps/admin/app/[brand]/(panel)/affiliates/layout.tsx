import { requireConsole } from '@/lib/guard'

/**
 * The module gate for `/[brand]/affiliates`.
 *
 * `page.tsx` here is a client component, so it cannot call `requireConsole`
 * itself — and a page that never calls it is gated by nothing but the nav, which
 * is decoration. This server layout is what actually decides.
 *
 * See `src/lib/guard.ts` for why an absent module answers 404 and not 403.
 */
export default async function AffiliatesLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ brand: string }>
}) {
  await requireConsole((await params).brand, 'affiliates')
  return <>{children}</>
}
