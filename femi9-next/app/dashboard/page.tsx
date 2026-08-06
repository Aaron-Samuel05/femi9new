import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getCycleData } from '@/lib/services/cycle'
import { UserDashboard } from '@/screens/UserDashboard'

/**
 * Customer dashboard (server component). Reading the session via cookies() opts
 * this route into dynamic rendering, so it's always evaluated against the
 * current request — never statically cached and served to the wrong shopper.
 */
export default async function DashboardPage() {
  const s = await getSession()
  // Middleware already guards /dashboard, but the page re-checks so it never
  // renders for an anonymous request (defence in depth) and so it has a concrete
  // user id to load data for.
  if (!s) redirect('/login')

  // Re-read the name from the DB by session subject rather than trusting the
  // JWT's convenience `name` claim, which can be stale if the user renamed after
  // their last sign-in. The cycle model is computed from the user's real
  // PeriodLog / SymptomLog rows in the same round-trip.
  const [user, cycle] = await Promise.all([
    prisma.user.findUnique({ where: { id: s.sub }, select: { name: true } }),
    getCycleData(s.sub),
  ])

  return <UserDashboard {...cycle} userName={user?.name ?? s.name} />
}
