import type { Metadata } from 'next'
import { isBrand, type Brand } from '@femi9/db'
import { LoginCard } from './LoginCard'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
}

/**
 * `?brand=` preselects the toggle — used by the route guard when it bounces an
 * expired session, and by bookmarks. Unvalidated input never reaches the form:
 * anything that is not a brand falls back to Femi9.
 *
 * The card, not this page, carries `.adm-auth`: the wash behind it re-themes
 * with the toggle, and the toggle is client state.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; next?: string; invited?: string }>
}) {
  const params = await searchParams
  const brand: Brand = isBrand(params.brand) ? params.brand : 'femi9'
  // `next` is validated again server-side after sign-in; passing it through
  // here only preselects the destination.
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : null
  // `invited=1` is set on the sign-in URL in an admin-invite email. The
  // recipient was granted a role on ONE brand only (or already knows which
  // console they're activating), so a toggle to a brand they can't sign into
  // is noise at best and misleading at worst — hide it.
  const invited = params.invited === '1'

  return <LoginCard initialBrand={brand} next={next} lockBrand={invited} />
}
