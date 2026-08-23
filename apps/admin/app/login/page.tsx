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
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; next?: string }>
}) {
  const params = await searchParams
  const brand: Brand = isBrand(params.brand) ? params.brand : 'femi9'
  // `next` is validated again server-side after sign-in; passing it through
  // here only preselects the destination.
  const next = typeof params.next === 'string' && params.next.startsWith('/') ? params.next : null

  return (
    <main className="loginShell">
      <LoginCard initialBrand={brand} next={next} />
    </main>
  )
}
