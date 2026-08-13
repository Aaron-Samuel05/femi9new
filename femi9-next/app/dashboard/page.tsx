import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getAccountData, getProfileStatus } from '@/lib/services/account'
import { getCycleData } from '@/lib/services/cycle'
import { UserDashboard } from '@/screens/UserDashboard'

/**
 * Customer dashboard (server component). Reading the session via cookies() opts
 * this route into dynamic rendering, so it is always evaluated against the
 * current request — never statically cached and served to the wrong shopper.
 *
 * The identity handed to the screen is the SAME `AccountUser` /account renders.
 * The dashboard used to fetch its own name and then let the shared Shell fetch a
 * third one client-side, so a nameless user saw "Guest", "Your account" and
 * "Femi9 member" on one page. One resolver, one fallback, one initials function.
 */
export default async function DashboardPage() {
  const s = await getSession()
  // Middleware already guards /dashboard, but the page re-checks so it never
  // renders for an anonymous request (defence in depth) and so it has a concrete
  // user id to load data for. `next` survives the round trip, unlike before.
  if (!s) redirect('/login?next=/dashboard')

  // Cheap three-column probe before the expensive reads: an account that never
  // finished onboarding has no name to greet and no number to deliver to, so it
  // belongs on /welcome. Typing the URL does not bypass this.
  const status = await getProfileStatus(s.sub)
  if (!status) redirect('/login')
  if (!status.complete) redirect('/welcome?next=/dashboard')

  const [account, cycle] = await Promise.all([getAccountData(s.sub), getCycleData(s.sub)])
  // The token can be valid while the row is gone (a deleted account with a live
  // cookie). Bounce rather than render a page with no identity.
  if (!account) redirect('/login')

  return (
    <UserDashboard
      {...cycle}
      user={account.user}
      pointsBalance={account.pointsBalance}
      // Three is enough for an at-a-glance panel; /account owns the full history.
      orders={account.orders.slice(0, 3)}
      subscriptions={account.subscriptions}
    />
  )
}
