'use client'

import { AreaChart } from '@/charts/AreaChart'
import { BarChart } from '@/charts/BarChart'
import { DonutChart } from '@/charts/DonutChart'
import { fmtInt, fmtRsK } from '@/charts/util'
import { C } from '@/charts/theme'

/**
 * Client boundary for the dashboard charts.
 *
 * The reusable charts in src/charts use client-only hooks but ship WITHOUT a
 * "use client" directive (they're normally imported by client screens), and the
 * dashboard page is an async server component. This module is the thin bridge:
 * it re-exports the charts fed with the plain, already-serializable data the
 * server computed — no data fetching happens here. Mirrors the _nav.tsx split.
 */

/** Revenue-over-time — plum area line, rupee (k/L) y-axis. */
export function RevenueArea({ labels, values }: { labels: string[]; values: number[] }) {
  return (
    <AreaChart
      labels={labels}
      series={[{ name: 'Revenue', color: C.plum, points: values }]}
      yFormat={fmtRsK}
      height={240}
    />
  )
}

/** Orders per city — forest bars, integer y-axis. */
export function CityBars({ data }: { data: { label: string; value: number }[] }) {
  return <BarChart data={data} color={C.forest} yFormat={fmtInt} height={230} />
}

/** Order pipeline split — donut with the total order count in the middle. */
export function StatusDonut({
  data,
}: {
  data: { label: string; value: number; color: string }[]
}) {
  return <DonutChart data={data} centerLabel="Orders" format={fmtInt} size={188} thickness={24} />
}
