import { CATEGORICAL, C } from '../charts/theme'

/* KPI tiles (anonymized, aggregate). Messy numbers on purpose. */
export const kpis = [
  { label: 'Revenue · July', value: 'Rs.18.4L', delta: { value: 12.4, dir: 'up' as const }, spark: [9.2, 10.1, 11.8, 12.6, 14.9, 16.2, 18.4], color: C.forest },
  { label: 'Orders · July', value: '4,182', delta: { value: 8.1, dir: 'up' as const }, spark: [2980, 3120, 3340, 3510, 3720, 3910, 4182], color: C.blue },
  { label: 'Active subscribers', value: '2,637', delta: { value: 5.6, dir: 'up' as const }, spark: [1980, 2120, 2260, 2380, 2470, 2560, 2637], color: C.plum },
  { label: 'Avg cycle (cohort)', value: '28.4 days', delta: { value: 0.3, dir: 'down' as const }, spark: [28.9, 28.8, 28.6, 28.5, 28.5, 28.4, 28.4], color: C.gold },
]

/* Revenue with a 2-month forecast (dashed). Values in rupees. */
export const revenueTrend = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
  values: [920000, 1010000, 1180000, 1260000, 1490000, 1620000, 1840000, 2010000, 2170000],
  forecastFrom: 6,
}

/* Orders per month. */
export const ordersByMonth = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  values: [2980, 3120, 3340, 3510, 3720, 3910, 4182],
}

/* Product mix — donut. */
export const productMix = [
  { label: '330mm Double Wings', value: 1589, color: CATEGORICAL[2] },
  { label: '290mm Large', value: 1129, color: CATEGORICAL[1] },
  { label: '330mm Centre Wings', value: 795, color: CATEGORICAL[0] },
  { label: '290mm Starter', value: 376, color: CATEGORICAL[3] },
  { label: 'Combos & other', value: 293, color: CATEGORICAL[4] },
]

/* Anonymized cycle-length distribution across consenting subscribers. */
export const cycleDistribution = {
  labels: ['24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34'],
  values: [42, 88, 164, 281, 437, 512, 468, 362, 214, 120, 58],
  modeIndex: 5, // 29 days
}

/* Predicted pad demand (units/week) with forecast. Tied to aggregate cycle timing. */
export const demandForecast = {
  labels: ['W26', 'W27', 'W28', 'W29', 'W30', 'W31', 'W32', 'W33'],
  values: [3820, 4010, 4460, 4230, 4880, 5240, 4610, 4390],
  forecastFrom: 3,
}

/* Demand by district — ranked bars. */
export const regionalDemand = [
  { label: 'Erode', value: 1284 },
  { label: 'Coimbatore', value: 1042 },
  { label: 'Salem', value: 786 },
  { label: 'Tiruppur', value: 634 },
  { label: 'Chennai', value: 523 },
  { label: 'Madurai', value: 388 },
]

/* Prediction-model panel (anonymized, consent-based). */
export const modelPanel = {
  windowUsers: 1642,
  windowPct: 62,
  demandUplift: 18,
  restock: '330mm Double Wings',
  restockUnits: 2400,
  accuracy: 91.3,
}
