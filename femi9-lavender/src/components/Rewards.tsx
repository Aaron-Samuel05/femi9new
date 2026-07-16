import { useEffect, useMemo, useState } from 'react'
import '../styles/rewards.css'
import { user, orders } from '../data/account'
import { Check, Leaf, Recycle, Truck } from './Icons'
import { IStar } from './AppIcons'

const STORE_KEY = 'femi9:rewards'

interface EarnRule {
  icon: React.FC<{ style?: React.CSSProperties }>
  title: string
  pts: string
  done?: boolean
}

const EARN: EarnRule[] = [
  { icon: Check, title: 'Sign-up bonus', pts: '+200', done: true },
  { icon: Truck, title: 'Every Rs.10 you spend', pts: '+1' },
  { icon: IStar, title: 'Write a product review', pts: '+50' },
  { icon: Recycle, title: 'Refer a friend', pts: '+250' },
  { icon: Leaf, title: 'Complete your profile', pts: '+100' },
]

interface Redeemable {
  id: string
  label: string
  sub: string
  cost: number
}
const REDEEMABLES: Redeemable[] = [
  { id: 'r100', label: 'Rs.100 off', sub: 'On your next order', cost: 900 },
  { id: 'r250', label: 'Rs.250 off', sub: 'On orders over Rs.499', cost: 2000 },
  { id: 'panty', label: 'Free Period Panties', sub: 'Any size, on us', cost: 2600 },
]

function loadBalance(fallback: number): number {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (typeof v.balance === 'number') return v.balance
    }
  } catch {
    /* ignore */
  }
  return fallback
}
function saveBalance(balance: number) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ balance }))
  } catch {
    /* ignore */
  }
}

export function Rewards() {
  const [balance, setBalance] = useState(user.points)
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    setBalance(loadBalance(user.points))
  }, [])

  // next tier the member can still climb toward
  const nextTier = useMemo(() => REDEEMABLES.find((r) => r.cost > balance) ?? null, [balance])
  const prevCost = useMemo(() => {
    const below = [...REDEEMABLES].reverse().find((r) => r.cost <= balance)
    return below ? below.cost : 0
  }, [balance])
  const pct = nextTier
    ? Math.min(100, Math.round(((balance - prevCost) / (nextTier.cost - prevCost)) * 100))
    : 100

  // recent activity, derived from real orders + the sign-up bonus
  const activity = useMemo(() => {
    const rows = orders
      .slice(0, 3)
      .map((o) => ({ label: `Order ${o.id}`, date: o.date, pts: `+${Math.round(o.total / 10)}` }))
    rows.push({ label: 'Sign-up bonus', date: `Joined ${user.since}`, pts: '+200' })
    return rows
  }, [])

  const redeem = (r: Redeemable) => {
    if (balance < r.cost) return
    const nb = balance - r.cost
    setBalance(nb)
    saveBalance(nb)
    setFlash(`${r.label} unlocked. Check your email for the code.`)
    window.setTimeout(() => setFlash(null), 4000)
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
                ? <>{(nextTier.cost - balance).toLocaleString('en-IN')} pts to <b>{nextTier.label}</b></>
                : <>You can redeem every reward below 🎉</>}
            </p>
          </div>
          {flash && <p className="rw-flash" role="status">{flash}</p>}
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
      <div className="rw-redeem">
        {REDEEMABLES.map((r) => {
          const affordable = balance >= r.cost
          return (
            <div className={`rw-reward${affordable ? ' can' : ''}`} key={r.id}>
              <div className="rw-reward-top">
                <b>{r.label}</b>
                <span className="rw-reward-cost">{r.cost.toLocaleString('en-IN')} pts</span>
              </div>
              <p className="rw-reward-sub">{r.sub}</p>
              <button className="btn btn-primary rw-reward-btn" disabled={!affordable} onClick={() => redeem(r)}>
                {affordable ? 'Redeem' : 'Keep earning'}
              </button>
            </div>
          )
        })}
      </div>

      {/* recent activity */}
      <span className="rw-sub-label">Recent activity</span>
      <div className="rw-activity">
        {activity.map((a, idx) => (
          <div className="rw-act-row" key={idx}>
            <div><b>{a.label}</b><span>{a.date}</span></div>
            <span className="rw-act-pts">{a.pts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
