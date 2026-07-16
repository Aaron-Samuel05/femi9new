import type { Phase } from '../charts/CycleCalendar'

/* Deterministic "today" so the mock reads consistently. */
export const TODAY = new Date(2026, 6, 9) // 2026-07-09

const DAY = 86400000
const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const between = (d: Date, a: Date, b: Date) => strip(d) >= strip(a) && strip(d) <= strip(b)
const daysBetween = (a: Date, b: Date) => Math.round((strip(b) - strip(a)) / DAY)

/* Logged period history: start date + how many days it lasted. */
const HISTORY: { start: Date; length: number }[] = [
  { start: new Date(2026, 0, 27), length: 5 },
  { start: new Date(2026, 1, 24), length: 5 },
  { start: new Date(2026, 2, 24), length: 4 },
  { start: new Date(2026, 3, 22), length: 5 },
  { start: new Date(2026, 4, 20), length: 5 },
  { start: new Date(2026, 5, 17), length: 5 },
]

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
function std(xs: number[]) {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

const gaps = HISTORY.slice(1).map((h, i) => daysBetween(HISTORY[i].start, h.start))
const avgCycle = Math.round(mean(gaps)) // 28
const avgPeriod = Math.round(mean(HISTORY.map((h) => h.length))) // 5
const regularity = std(gaps) // ~0.5 days
const confidence = Math.round(Math.max(0.6, 1 - regularity / 8) * 100) // ~94%

const lastStart = HISTORY[HISTORY.length - 1].start
const nextStart = addDays(lastStart, avgCycle) // 2026-07-15

/* Future predicted cycles (for calendar navigation). */
const futureCycles = [0, 1, 2, 3].map((k) => {
  const start = addDays(lastStart, avgCycle * (k + 1))
  const ovulation = addDays(start, -14)
  return {
    start,
    end: addDays(start, avgPeriod - 1),
    ovulation,
    fertileStart: addDays(ovulation, -4),
    pmsStart: addDays(start, -5),
    pmsEnd: addDays(start, -1),
  }
})

export const prediction = {
  avgCycle,
  avgPeriod,
  confidence,
  cycleDay: daysBetween(lastStart, TODAY) + 1, // 23
  nextStart,
  daysUntilNext: daysBetween(TODAY, nextStart), // 6
  ovulation: futureCycles[0].ovulation,
  fertileStart: futureCycles[0].fertileStart,
  fertileEnd: futureCycles[0].ovulation,
  pmsStart: futureCycles[0].pmsStart,
  pmsEnd: futureCycles[0].pmsEnd,
  lastStart,
}

/** Phase for any date: precedence period > predicted > ovulation > fertile > pms. */
export function getPhase(date: Date): Phase {
  for (const h of HISTORY) {
    if (between(date, h.start, addDays(h.start, h.length - 1))) return 'period'
  }
  for (const c of futureCycles) {
    if (between(date, c.start, c.end)) return 'predicted'
    if (strip(date) === strip(c.ovulation)) return 'ovulation'
    if (between(date, c.fertileStart, addDays(c.ovulation, -1))) return 'fertile'
    if (between(date, c.pmsStart, c.pmsEnd)) return 'pms'
  }
  return null
}

const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const range = (a: Date, b: Date) => `${fmt(a)} – ${fmt(b)}`

/* Forward-looking events (this cycle's PMS + period, next cycle's fertile window). */
export const upcomingEvents = [
  { label: 'PMS window', range: range(prediction.pmsStart, prediction.pmsEnd), phase: 'pms' as const, days: daysBetween(TODAY, prediction.pmsStart) },
  { label: 'Next period', range: range(nextStart, addDays(nextStart, avgPeriod - 1)), phase: 'predicted' as const, days: prediction.daysUntilNext },
  { label: 'Fertile window', range: range(futureCycles[1].fertileStart, futureCycles[1].ovulation), phase: 'fertile' as const, days: daysBetween(TODAY, futureCycles[1].fertileStart) },
  { label: 'Ovulation', range: fmt(futureCycles[1].ovulation), phase: 'ovulation' as const, days: daysBetween(TODAY, futureCycles[1].ovulation) },
]

/* Cycle-length trend (for a small dashboard chart). */
export const cycleLengthTrend = {
  labels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  values: [28, 29, 28, 29, 28, 28],
}

/* Symptom log intensity (0-3) across the current cycle, for a mood/symptom strip. */
export const symptomLog = [
  { day: 'Cramps', level: 2 },
  { day: 'Mood', level: 3 },
  { day: 'Energy', level: 1 },
  { day: 'Sleep', level: 2 },
  { day: 'Bloating', level: 2 },
]

export const insights = [
  { title: 'Your cycle is very regular', body: `The last 5 cycles varied by under a day. Predictions are ${confidence}% confident.`, tone: 'good' as const },
  { title: 'PMS window opens tomorrow', body: 'Jul 10 to Jul 14. Keep a Night+Day pack handy and take it easy.', tone: 'warning' as const },
  { title: 'Reorder before Jul 15', body: 'Your 330mm Double Wings usually run out around your period start.', tone: 'info' as const },
]
