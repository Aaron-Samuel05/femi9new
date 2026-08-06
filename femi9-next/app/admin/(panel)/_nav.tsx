'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Client bits of the admin shell. The layout itself is a server component
 * (it runs the auth guard), so anything needing usePathname / onClick lives
 * here.
 */

/** Sidebar link that lights up on the active route. */
export function AdminNavLink({
  href,
  label,
  exact = false,
}: {
  href: string
  label: string
  /** Match the path exactly (used for /admin so it isn't active on every child). */
  exact?: boolean
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      className={'adm-nav-link' + (active ? ' is-active' : '')}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  )
}

/** Clears the session cookie, then returns to the login screen. */
export function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {})
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={signOut}>
      Sign out
    </button>
  )
}
