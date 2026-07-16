import { useState } from 'react'
import { Shell } from '../app/Shell'
import { AreaChart } from '../charts/AreaChart'
import { BarChart } from '../charts/BarChart'
import { DonutChart } from '../charts/DonutChart'
import { StatTile, RankBars, Legend } from '../charts/mini'
import { C } from '../charts/theme'
import { fmtRsK, fmtInt, fmtCompact } from '../charts/util'
import { kpis, revenueTrend, ordersByMonth, productMix, cycleDistribution, demandForecast, regionalDemand, modelPanel } from '../data/analytics'
import { IRupee, IBox, IUsers, ICycle, ISparkles, IInfo } from '../components/AppIcons'

const kpiIcons = [IRupee, IBox, IUsers, ICycle]

export function AdminDashboard() {
  const [range, setRange] = useState<'6M' | 'FY'>('FY')
  const rev =
    range === 'FY'
      ? revenueTrend
      : { labels: revenueTrend.labels.slice(3), values: revenueTrend.values.slice(3), forecastFrom: revenueTrend.forecastFrom - 3 }

  const distData = cycleDistribution.labels.map((l, i) => ({
    label: l,
    value: cycleDistribution.values[i],
    color: i === cycleDistribution.modeIndex ? C.gold : C.forest,
  }))

  return (
    <Shell variant="admin" title="Overview" subtitle="Femi9 · anonymized aggregate analytics">
      <div className="dash-grid">
        {/* KPIs */}
        {kpis.map((k, i) => {
          const Icon = kpiIcons[i]
          return (
            <div className="col-3" key={k.label}>
              <StatTile label={k.label} value={k.value} delta={k.delta} spark={k.spark} sparkColor={k.color} icon={<Icon />} />
            </div>
          )
        })}

        {/* revenue + product mix */}
        <div className="col-8" id="sales">
          <div className="panel pad-lg">
            <div className="panel-head">
              <div><h3>Revenue &amp; forecast</h3><div className="sub">Monthly, with 2-month projection</div></div>
              <div className="seg">
                <button className={range === '6M' ? 'on' : ''} onClick={() => setRange('6M')}>Last 6</button>
                <button className={range === 'FY' ? 'on' : ''} onClick={() => setRange('FY')}>Full year</button>
              </div>
            </div>
            <AreaChart labels={rev.labels} series={[{ name: 'Revenue', color: C.forest, points: rev.values }]} forecastFrom={rev.forecastFrom} height={244} yFormat={fmtRsK} />
          </div>
        </div>
        <div className="col-4">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><div><h3>Product mix</h3><div className="sub">Units this month</div></div></div>
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <DonutChart data={productMix} size={186} thickness={22} centerLabel="Units" format={fmtInt} />
            </div>
            <Legend items={productMix.map((p) => ({ label: p.label, color: p.color }))} />
          </div>
        </div>

        {/* demand forecast + cycle distribution */}
        <div className="col-7">
          <div className="panel pad-lg">
            <div className="panel-head"><div><h3>Predicted pad demand</h3><div className="sub">Units per week · dashed = forecast from cycle timing</div></div></div>
            <AreaChart labels={demandForecast.labels} series={[{ name: 'Units', color: C.blue, points: demandForecast.values }]} forecastFrom={demandForecast.forecastFrom} height={224} yFormat={fmtCompact} />
          </div>
        </div>
        <div className="col-5" id="cycle">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><div><h3>Cycle-length distribution</h3><div className="sub">Anonymized subscribers · gold = mode (29d)</div></div></div>
            <BarChart data={distData} height={224} yFormat={fmtCompact} />
          </div>
        </div>

        {/* orders + regional */}
        <div className="col-6">
          <div className="panel pad-lg">
            <div className="panel-head"><div><h3>Orders per month</h3><div className="sub">Jan to Jul 2026</div></div></div>
            <BarChart data={ordersByMonth.labels.map((l, i) => ({ label: l, value: ordersByMonth.values[i] }))} color={C.blue} height={214} yFormat={fmtCompact} />
          </div>
        </div>
        <div className="col-6" id="customers">
          <div className="panel pad-lg" style={{ height: '100%' }}>
            <div className="panel-head"><div><h3>Demand by district</h3><div className="sub">Orders, Tamil Nadu</div></div></div>
            <div style={{ marginTop: 6 }}>
              <RankBars data={regionalDemand} format={fmtInt} />
            </div>
          </div>
        </div>

        {/* prediction model panel */}
        <div className="col-12">
          <div className="model-panel">
            <div className="panel-head">
              <div>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 9 }}><ISparkles style={{ width: 20, height: 20 }} /> Period-prediction model</h3>
                <div className="sub">Anonymized, consent-based · backtested accuracy {modelPanel.accuracy}%</div>
              </div>
            </div>
            <div className="model-grid">
              <div className="model-stat"><b>{fmtInt(modelPanel.windowUsers)}</b><span>subscribers entering their period window in the next 14 days ({modelPanel.windowPct}%)</span></div>
              <div className="model-stat accent"><b>+{modelPanel.demandUplift}%</b><span>predicted pad-demand uplift this fortnight</span></div>
              <div className="model-stat"><b>+{fmtInt(modelPanel.restockUnits)}</b><span>recommended restock · {modelPanel.restock}</span></div>
              <div className="model-stat"><b>{modelPanel.accuracy}%</b><span>model accuracy, backtested on 12 cycles</span></div>
            </div>
            <div className="model-note">
              <IInfo />
              Built only from cycle data customers opt in to share, aggregated across cohorts. It forecasts demand and never identifies an individual.
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}
