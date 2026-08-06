import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getAccountData } from '@/lib/services/account'
import { listRewardOptions } from '@/lib/services/rewards'
import { Account } from '@/screens/Account'

// Reads the session cookie + per-user DB rows, so it must render per request.
export const dynamic = 'force-dynamic'

/**
 * /account — the signed-in customer's dashboard. Middleware already gate-keeps
 * this path, but we resolve the session again here (Node runtime) to fetch the
 * user's real data. A missing session, or a session whose user record is gone,
 * bounces to /login.
 */
export default async function AccountPage() {
  const s = await getSession()
  if (!s) redirect('/login')

  const [data, rewardOptions] = await Promise.all([getAccountData(s.sub), listRewardOptions()])
  if (!data) redirect('/login')

  return (
    <Account
      user={data.user}
      pointsBalance={data.pointsBalance}
      orders={data.orders}
      addresses={data.addresses}
      subscription={data.subscription}
      spendTrend={data.spendTrend}
      activity={data.activity}
      rewardOptions={rewardOptions}
    />
  )
}
