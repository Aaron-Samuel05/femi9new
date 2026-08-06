'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import '../styles/rewards.css'
import { Check, Leaf, Recycle, Truck } from './Icons'
import { IStar } from './AppIcons'
import type { RewardOptionView } from '@/lib/services/rewards'
import type { ActivityItem } from '@/lib/services/account'

interface EarnRule {
  icon: React.FC<{ style?: React.CSSProperties }>
  title: string
  pts: string
  done?: boolean
}

// "Ways to earn" is illustrative programme copy (not per-user state), so it stays
// a static list — the real, personalised numbers live in the balance + activity.
const EARN: EarnRule[] = [
  { icon: Check, title: 'Sign-up bonus', pts: '+200', done: true },
  { icon: Truck, title: 'Every Rs.10 you spend', pts: '+1' },
  { icon: IStar, title: 'Write a product review', pts: '+50' },
  { icon: Recycle, title: 'Refer a friend', pts: '+250' },
  { icon: Leaf, title: 'Complete your profile', pts: '+100' },
]

interface RewardsProps {
  pointsBalance: number
  rewardOptions: RewardOptionView[]
  /** Real recent points-ledger rows (earned + redeemed), newest first. */
  activity?: ActivityItem[]
}

/** One-line perk description synthesised from the coupon the reward issues. */
function rewardSub(o: RewardOptionView): string {
  return o.couponType === 'pct'
    ? `${o.couponValue}% off your next order`
    : `Rs.${o.couponValue} off your next order`
}

export function Rewards({ pointsBalance, rewardOptions, activity = [] }: RewardsProps) {
  const router = useRouter()
  // Seeded from the server balance; nudged optimistically on redeem, then
  // reconciled to server truth via router.refresh() below.
  const [balance, setBalance] = useState(pointsBalance)
  const [flash, setFlash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Rewards sorted by cost drive the progress bar toward the next affordable perk.
  const sorted = useMemo(
    () => [...rewardOptions].sort((a, b) => a.costPoints - b.costPoints),
    [rewardOptions],
  )
  const nextTier = useMemo(() => sorted.find((r) => r.costPoints > balance) ?? null, [sorted, balance])
  const prevCost = useMemo(() => {
    const below = [...sorted].reverse().find((r) => r.costPoints <= balance)
    return below ? below.costPoints : 0
  }, [sorted, balance])
  const pct = nextTier
    ? Math.min(100, Math.round(((balance - prevCost) / (nextTier.costPoints - prevCost)) * 100))
    : 100

  async function redeem(r: RewardOptionView) {
    if (balance < r.costPoints || busyId) return
    setBusyId(r.id)
    setError(null)
    setFlash(null)
    try {
      const res = await fetch('/api/rewards/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rewardOptionId: r.id }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Could not redeem that reward right now. Please try again.')
        return
      }
      setBalance((b) => b - r.costPoints) // optimistic; refresh confirms it
      setFlash(`${r.title} unlocked! Use code ${data.couponCode} at checkout.`)
      // Re-pull the server data so the hero points badge + recent activity update.
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="panel pad-lg rewards">
      <div className="panel-head">
        <div>
          <h3>Femi9 Rewards</h3>
          <div className="sub">Earn Bloom points on every order and redeem for perks</div>
        </div>
      </div>

      <div className="rewards-grid">
        {/* balance + progress */}
        <div className="rw-balance">
          <span className="rw-balance-label">Your balance</span>
          <div className="rw-balance-num display">{balance.toLocaleString('en-IN')}</div>
          <span className="rw-balance-unit">Bloom points</span>
          <div className="rw-progress">
            <div className="rw-progress-track"><span className="rw-progress-fill" style={{ width: `${pct}%` }} /></div>
            <p className="rw-progress-note">
              {nextTier
                ? <>{(nextTier.costPoints - balance).toLocaleString('en-IN')} pts to <b>{nextTier.title}</b></>
                : sorted.length > 0
                  ? <>You can redeem every reward below 🎉</>
                  : <>Earn points on your next order to unlock rewards.</>}
            </p>
          </div>
          {flash && <p className="rw-flash" role="status">{flash}</p>}
          {error && <p className="rw-flash" role="alert" style={{ color: '#9a2237' }}>{error}</p>}
        </div>

        {/* ways to earn */}
        <div className="rw-earn">
          <span className="rw-sub-label">Ways to earn</span>
          <ul className="rw-earn-list">
            {EARN.map((e) => {
              const Icon = e.icon
              return (
                <li key={e.title} className={e.done ? 'is-done' : ''}>
                  <span className="rw-earn-ic"><Icon /></span>
                  <span className="rw-earn-t">{e.title}</span>
                  <span className="rw-earn-pts">{e.done ? 'Earned' : e.pts}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      {/* redeem */}
      <span className="rw-sub-label rw-redeem-label">Redeem your points</span>
      {rewardOptions.length === 0 ? (
        <p className="oitems" style={{ marginBottom: 8 }}>No rewards available just yet - check back soon.</p>
      ) : (
        <div className="rw-redeem">
          {rewardOptions.map((r) => {
            const affordable = balance >= r.costPoints
            const busy = busyId === r.id
            return (
              <div className={`rw-reward${affordable ? ' can' : ''}`} key={r.id}>
                <div className="rw-reward-top">
                  <b>{r.title}</b>
                  <span className="rw-reward-cost">{r.costPoints.toLocaleString('en-IN')} pts</span>
                </div>
                <p className="rw-reward-sub">{rewardSub(r)}</p>
                <button
                  className="btn btn-primary rw-reward-btn"
                  disabled={!affordable || busy}
                  onClick={() => redeem(r)}
                >
                  {busy ? 'Redeeming…' : affordable ? 'Redeem' : 'Keep earning'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* recent activity */}
      <span className="rw-sub-label">Recent activity</span>
      <div className="rw-activity">
        {activity.length === 0 ? (
          <div className="rw-act-row"><div><b>No activity yet</b><span>Earn points on your next order</span></div></div>
        ) : (
          activity.map((a, idx) => (
            <div className="rw-act-row" key={idx}>
              <div><b>{a.label}</b><span>{a.date}</span></div>
              <span className="rw-act-pts">{a.pts}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
