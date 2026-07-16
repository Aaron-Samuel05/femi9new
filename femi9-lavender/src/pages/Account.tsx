import { Shell } from '../app/Shell'
import { AreaChart } from '../charts/AreaChart'
import { C } from '../charts/theme'
import { fmtRs } from '../charts/util'
import { user, addresses, orders, subscription, spendTrend } from '../data/account'
import { Rewards } from '../components/Rewards'

export function Account() {
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
                {user.points.toLocaleString('en-IN')} Bloom points
              </span>
              <button className="btn btn-ghost">Edit profile</button>
            </div>
          </div>
        </div>

        {/* rewards */}
        <div className="col-12" id="rewards">
          <Rewards />
        </div>

        {/* orders */}
        <div className="col-8" id="orders">
          <div className="panel pad-lg">
            <div className="panel-head"><div><h3>Order history</h3><div className="sub">{orders.length} orders</div></div></div>
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
          </div>
        </div>

        {/* subscription */}
        <div className="col-4">
          <div className="sub-card">
            <span className="stag">Active subscription</span>
            <h3>{subscription.product} ×{subscription.qty}</h3>
            <div style={{ marginTop: 14 }}>
              <div className="srow"><span className="k">Frequency</span><span className="v">{subscription.frequency}</span></div>
              <div className="srow"><span className="k">Next delivery</span><span className="v">{subscription.nextDelivery}</span></div>
              <div className="srow"><span className="k">Saved so far</span><span className="v">{fmtRs(subscription.saved)}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn btn-primary" style={{ flex: 1 }}>Manage</button>
              <button className="btn btn-ghost">Skip next</button>
            </div>
          </div>
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
            <div className="panel-head"><div><h3>Saved addresses</h3></div><button className="btn btn-ghost" style={{ padding: '.5em 1em', fontSize: '.85rem' }}>Add new</button></div>
            {addresses.map((a) => (
              <div className={`addr${a.primary ? ' primary' : ''}`} key={a.label}>
                <span className="alabel">{a.label}</span>
                <b>{a.name}</b>
                <span>{a.line}<br />{a.city}<br />{a.phone}</span>
              </div>
            ))}
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
