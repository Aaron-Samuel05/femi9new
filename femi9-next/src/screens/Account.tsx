'use client'

// Client component on purpose: it renders Shell / AreaChart / Rewards, all of
// which use hooks. The server page (app/account/page.tsx) resolves the real user
// and hands everything down as serializable props — this file is a pure view.
import { useState } from 'react'
import { Shell } from '../app/Shell'
import { AreaChart } from '../charts/AreaChart'
import { C } from '../charts/theme'
import { fmtRs } from '../charts/util'
import { Rewards } from '../components/Rewards'
import type {
  AccountUser,
  AccountOrder,
  AccountAddress,
  AccountSubscription,
  SpendTrend,
  ActivityItem,
} from '@/lib/services/account'
import type { RewardOptionView } from '@/lib/services/rewards'

interface AccountProps {
  user: AccountUser
  pointsBalance: number
  orders: AccountOrder[]
  addresses: AccountAddress[]
  subscription: AccountSubscription | null
  spendTrend: SpendTrend
  activity: ActivityItem[]
  rewardOptions: RewardOptionView[]
}

export function Account({
  user,
  pointsBalance,
  orders,
  addresses,
  subscription,
  spendTrend,
  activity,
  rewardOptions,
}: AccountProps) {
  return (
    <Shell variant="user" title="Account" subtitle="Your details, orders and subscription">
      <div className="dash-grid">
        {/* hero */}
        <div className="col-12">
          <div className="panel pad-lg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
            <div className="acct-hero">
              <span className="avatar">{user.initials}</span>
              <div>
                <h2>{user.name}</h2>
                <p>{user.tier} · Member since {user.since}</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'var(--butter)', color: '#8a5a00', fontSize: '.86rem', padding: '8px 14px' }}>
                {pointsBalance.toLocaleString('en-IN')} Bloom points
              </span>
              <button className="btn btn-ghost" type="button" title="Profile editing is not available yet" disabled>Edit profile</button>
            </div>
          </div>
        </div>

        {/* rewards */}
        <div className="col-12" id="rewards">
          <Rewards pointsBalance={pointsBalance} rewardOptions={rewardOptions} activity={activity} />
        </div>

        {/* orders */}
        <div className="col-8" id="orders">
          <div className="panel pad-lg">
            <div className="panel-head"><div><h3>Order history</h3><div className="sub">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</div></div></div>
            {orders.length === 0 ? (
              <p className="oitems" style={{ padding: '18px 4px' }}>No orders yet - your first Femi9 order will show up here.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="dtable">
                  <thead>
                    <tr><th>Order</th><th className="hide-sm">Items</th><th>Total</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td><span className="oid">{o.id}</span><div className="oitems">{o.date}</div></td>
                        <td className="hide-sm oitems">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</td>
                        <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtRs(o.total)}</td>
                        <td><span className={`badge ${o.status.toLowerCase()}`}>{o.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* subscription */}
        <div className="col-4">
          {subscription ? (
            <SubscriptionPanel subscription={subscription} />
          ) : (
            <div className="panel pad-lg" style={{ height: '100%' }}>
              <div className="panel-head"><h3>Subscription</h3></div>
              <p className="oitems">No active subscription. Subscribe &amp; save on the products you reach for every cycle.</p>
              <a className="btn btn-primary" href="/" style={{ marginTop: 16, display: 'inline-block' }}>Browse products</a>
            </div>
          )}
        </div>

        {/* profile details */}
        <div className="col-6">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><h3>Profile details</h3></div>
            <div className="kv">
              <div className="kv-row"><span className="k">Full name</span><span className="v">{user.name}</span></div>
              <div className="kv-row"><span className="k">Email</span><span className="v">{user.email}</span></div>
              <div className="kv-row"><span className="k">Phone</span><span className="v">{user.phone}</span></div>
              <div className="kv-row"><span className="k">Member since</span><span className="v">{user.since}</span></div>
            </div>
          </div>
        </div>

        {/* addresses */}
        <div className="col-6">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><div><h3>Saved addresses</h3></div><button className="btn btn-ghost" type="button" title="Adding addresses is not available yet" style={{ padding: '.5em 1em', fontSize: '.85rem' }} disabled>Add new</button></div>
            {addresses.length === 0 ? (
              <p className="oitems">No saved addresses yet - the address on your next order is saved here automatically.</p>
            ) : (
              addresses.map((a) => (
                <div className={`addr${a.primary ? ' primary' : ''}`} key={a.id}>
                  <span className="alabel">{a.label}</span>
                  <b>{a.name}</b>
                  <span>{a.line}<br />{a.city}<br />{a.phone}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* spend */}
        <div className="col-12">
          <div className="panel pad-lg">
            <div className="panel-head"><div><h3>Your spend</h3><div className="sub">Last 6 months</div></div></div>
            <AreaChart labels={spendTrend.labels} series={[{ name: 'Spend', color: C.plum, points: spendTrend.values }]} height={200} yFormat={fmtRs} />
          </div>
        </div>
      </div>
    </Shell>
  )
}

// Local status model — the account read model only surfaces `active` subscriptions,
// so the panel opens active and moves as the customer acts. 'cancelled' collapses
// the card to a re-subscribe prompt.
type SubStatus = 'active' | 'paused' | 'cancelled'
type SubAction = 'pause' | 'resume' | 'skip' | 'cancel'

/**
 * The subscription card, with real controls. Each button PATCHes
 * /api/subscriptions/[id] and reflects the returned state (status / next delivery /
 * saved), so pausing, skipping and cancelling update in place without a reload.
 * Extracted into its own component so its hooks aren't conditional on `subscription`
 * being present in the parent.
 */
function SubscriptionPanel({ subscription }: { subscription: AccountSubscription }) {
  const [status, setStatus] = useState<SubStatus>('active')
  const [nextDelivery, setNextDelivery] = useState(subscription.nextDelivery)
  const [saved, setSaved] = useState(subscription.saved)
  const [busy, setBusy] = useState<SubAction | null>(null)

  async function run(action: SubAction) {
    if (busy) return
    setBusy(action)
    try {
      const res = await fetch(`/api/subscriptions/${subscription.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        const data = (await res.json()) as {
          subscription?: { status: SubStatus; nextDelivery: string; saved: number }
        }
        if (data.subscription) {
          setStatus(data.subscription.status)
          setNextDelivery(data.subscription.nextDelivery)
          setSaved(data.subscription.saved)
        }
      }
    } catch {
      /* leave the card as-is on a transient failure */
    } finally {
      setBusy(null)
    }
  }

  if (status === 'cancelled') {
    return (
      <div className="panel pad-lg" style={{ height: '100%' }}>
        <div className="panel-head"><h3>Subscription</h3></div>
        <p className="oitems">Your subscription has been cancelled. You can subscribe again anytime from any product page.</p>
        <a className="btn btn-primary" href="/" style={{ marginTop: 16, display: 'inline-block' }}>Browse products</a>
      </div>
    )
  }

  return (
    <div className="sub-card">
      <span className="stag">{status === 'paused' ? 'Paused subscription' : 'Active subscription'}</span>
      <h3>{subscription.product} ×{subscription.qty}</h3>
      <div style={{ marginTop: 14 }}>
        <div className="srow"><span className="k">Frequency</span><span className="v">{subscription.frequency}</span></div>
        <div className="srow"><span className="k">Next delivery</span><span className="v">{nextDelivery}</span></div>
        <div className="srow"><span className="k">Saved so far</span><span className="v">{fmtRs(saved)}</span></div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        {status === 'active' ? (
          <>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => run('pause')} disabled={busy !== null}>
              {busy === 'pause' ? 'Pausing…' : 'Pause'}
            </button>
            <button className="btn btn-ghost" onClick={() => run('skip')} disabled={busy !== null}>
              {busy === 'skip' ? 'Skipping…' : 'Skip next'}
            </button>
          </>
        ) : (
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => run('resume')} disabled={busy !== null}>
            {busy === 'resume' ? 'Resuming…' : 'Resume'}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => run('cancel')} disabled={busy !== null}>
          {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
        </button>
      </div>
    </div>
  )
}
