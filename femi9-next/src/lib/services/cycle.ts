import 'server-only'
import { prisma } from '@/lib/db'
import { decryptCyclePayload, encryptCyclePayload } from '@/lib/cycle-crypto'

/**
 * Cycle service — the read/write model behind /dashboard.
 *
 * Presentation-shaped on purpose (same convention as services/account.ts): it
 * hands UserDashboard the exact primitive shapes it draws so a Server Component →
 * Client Component handoff stays serializable. Dates cross the boundary as plain
 * `YYYY-MM-DD` keys (never Date objects), and every human-facing string (ranges,
 * the next-period label) is formatted here so the client never has to.
 *
 * All date arithmetic runs on UTC-midnight Dates. That makes day math DST-proof
 * and, crucially, makes a stored PeriodLog.startDate round-trip to the SAME
 * calendar day regardless of the server's timezone (we write UTC midnight and
 * read it back with UTC getters). The client re-parses the keys into local
 * midnight for the calendar, which only compares dates to each other — so the
 * calendar day is preserved end to end.
 */

// ── View models (mirror exactly what UserDashboard renders) ──────────────────

/** Phase keys that also index the PHASE theme map in the UI. */
export type EventPhase = 'pms' | 'predicted' | 'fertile' | 'ovulation'
export type InsightTone = 'good' | 'warning' | 'info'

export interface CyclePrediction {
  avgCycle: number
  avgPeriod: number
  confidence: number // 0-100
  cycleDay: number
  nextStart: string // 'YYYY-MM-DD'
  nextStartLabel: string // "15 July" — preformatted so the client parses no dates
  daysUntilNext: number
  ovulation: string
  fertileStart: string
  fertileEnd: string
  pmsStart: string
  pmsEnd: string
  lastStart: string
}

export interface UpcomingEvent {
  label: string
  range: string
  phase: EventPhase
  days: number
}

export interface CycleTrend {
  labels: string[]
  values: number[]
}

export interface Insight {
  title: string
  body: string
  tone: InsightTone
}

export interface SymptomEntry {
  day: string // symptom name (the UI keys/labels on `s.day`)
  level: number // 0-3
}

export interface PeriodEntry {
  id: string
  start: string // 'YYYY-MM-DD'
  length: number
}

export interface CycleData {
  consent: boolean
  needsData: boolean // true when the user has logged no periods yet
  today: string // 'YYYY-MM-DD' — the reference "today" the math was run against
  prediction: CyclePrediction
  upcomingEvents: UpcomingEvent[]
  cycleLengthTrend: CycleTrend
  insights: Insight[]
  symptomLog: SymptomEntry[]
  periods: PeriodEntry[] // logged history, so the client can rebuild the calendar getPhase
}

// ── Date helpers (UTC-midnight, so day math is DST- and TZ-stable) ───────────

const DAY = 86_400_000

function todayUTC(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
function keyFromDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function dateFromKey(key: string): Date {
  // Tolerate a full ISO datetime by taking the date part only.
  const [y, m, d] = key.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
const fmtShort = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const fmtLong = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'long' })
const fmtMonth = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'short' })
const rangeStr = (a: Date, b: Date) => `${fmtShort(a)} – ${fmtShort(b)}`

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const std = (xs: number[]) => {
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

// Defaults used until the user has enough history to compute their own values.
const DEFAULT_CYCLE = 28
const DEFAULT_PERIOD = 5

// ── Phase helper (checklist: getPhase(date, prediction)) ─────────────────────

// Calendar phases include the solid 'period' band that logged history paints,
// on top of the four predicted windows.
type CalendarPhase = EventPhase | 'period' | null

/**
 * Phase for any date. Predicted phases (period band / fertile / ovulation / pms)
 * are derived from `prediction` alone; the optional logged `periods` let real,
 * past periods win as a solid 'period' band. The client rebuilds an equivalent
 * closure locally (it can't import this server-only module), so this stays the
 * canonical reference (used server-side / in tests).
 */
export function getPhase(date: Date, prediction: CyclePrediction, periods: PeriodEntry[] = []): CalendarPhase {
  const between = (d: Date, a: Date, b: Date) => d.getTime() >= a.getTime() && d.getTime() <= b.getTime()
  for (const p of periods) {
    const start = dateFromKey(p.start)
    if (between(date, start, addDays(start, p.length - 1))) return 'period'
  }
  const firstNext = dateFromKey(prediction.nextStart)
  for (let k = 0; k < 13; k++) {
    const start = addDays(firstNext, prediction.avgCycle * k)
    const end = addDays(start, prediction.avgPeriod - 1)
    const ovulation = addDays(start, -14)
    if (between(date, start, end)) return 'predicted'
    if (date.getTime() === ovulation.getTime()) return 'ovulation'
    if (between(date, addDays(ovulation, -5), addDays(ovulation, -1))) return 'fertile'
    if (between(date, addDays(start, -5), addDays(start, -1))) return 'pms'
  }
  return null
}

// ── Read model ───────────────────────────────────────────────────────────────

export async function getCycleData(userId: string): Promise<CycleData> {
  const [periodRows, user, symptomRows] = await Promise.all([
    prisma.periodLog.findMany({
      where: { userId },
      select: { id: true, startDate: true, lengthDays: true, encryptedData: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { cycleDataConsent: true } }),
    prisma.symptomLog.findMany({
      where: { userId },
      select: { date: true, symptom: true, level: true, encryptedData: true },
    }),
  ])

  const today = todayUTC()
  const todayKey = keyFromDate(today)

  const periods: PeriodEntry[] = periodRows
    .map((row): PeriodEntry => {
      if (row.encryptedData) {
        const payload = decryptCyclePayload(row.encryptedData)
        if (
          payload.kind !== 'period' ||
          typeof payload.start !== 'string' ||
          typeof payload.length !== 'number'
        ) {
          throw new Error('Invalid encrypted period payload')
        }
        return { id: row.id, start: payload.start, length: payload.length }
      }
      if (!row.startDate || row.lengthDays == null) throw new Error('Incomplete period data')
      return { id: row.id, start: keyFromDate(row.startDate), length: row.lengthDays }
    })
    .sort((a, b) => a.start.localeCompare(b.start))

  // Most recent level per symptom, preserving recency order, capped for the strip.
  const seen = new Set<string>()
  const symptomLog: SymptomEntry[] = []
  const symptoms = symptomRows
    .map((row) => {
      if (row.encryptedData) {
        const payload = decryptCyclePayload(row.encryptedData)
        if (
          payload.kind !== 'symptom' ||
          typeof payload.date !== 'string' ||
          typeof payload.symptom !== 'string' ||
          typeof payload.level !== 'number'
        ) {
          throw new Error('Invalid encrypted symptom payload')
        }
        return { date: payload.date, symptom: payload.symptom, level: payload.level }
      }
      if (!row.date || !row.symptom || row.level == null) throw new Error('Incomplete symptom data')
      return { date: keyFromDate(row.date), symptom: row.symptom, level: row.level }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  for (const symptom of symptoms) {
    if (seen.has(symptom.symptom)) continue
    seen.add(symptom.symptom)
    symptomLog.push({ day: symptom.symptom, level: symptom.level })
    if (symptomLog.length >= 6) break
  }

  const starts = periods.map((p) => dateFromKey(p.start))
  const lengths = periods.map((p) => p.length)
  const gaps = starts.slice(1).map((s, i) => daysBetween(starts[i], s))

  const avgCycle = gaps.length ? Math.round(mean(gaps)) : DEFAULT_CYCLE
  const avgPeriod = lengths.length ? Math.round(mean(lengths)) : DEFAULT_PERIOD

  // No logs yet: hand back a valid (default) shape and flag it so the UI shows
  // the "log your first period" state instead of a fabricated prediction.
  if (periods.length === 0) {
    const nextStart = addDays(today, avgCycle)
    return {
      consent: user?.cycleDataConsent ?? false,
      needsData: true,
      today: todayKey,
      prediction: {
        avgCycle,
        avgPeriod,
        confidence: 0,
        cycleDay: 1,
        nextStart: keyFromDate(nextStart),
        nextStartLabel: fmtLong(nextStart),
        daysUntilNext: avgCycle,
        ovulation: keyFromDate(addDays(nextStart, -14)),
        fertileStart: keyFromDate(addDays(nextStart, -19)),
        fertileEnd: keyFromDate(addDays(nextStart, -13)),
        pmsStart: keyFromDate(addDays(nextStart, -5)),
        pmsEnd: keyFromDate(addDays(nextStart, -1)),
        lastStart: todayKey,
      },
      upcomingEvents: [],
      cycleLengthTrend: { labels: [], values: [] },
      insights: [],
      symptomLog,
      periods,
    }
  }

  const lastStart = starts[starts.length - 1]

  // Roll the last logged start forward by whole average cycles to the cycle that
  // contains today. Keeps cycleDay in range and daysUntilNext positive even if
  // the user hasn't logged in a while (a stale mock would go negative here).
  const sinceLast = Math.max(0, daysBetween(lastStart, today))
  const cyclesPassed = Math.floor(sinceLast / avgCycle)
  const cycleStart = addDays(lastStart, cyclesPassed * avgCycle)
  const nextStart = addDays(cycleStart, avgCycle)
  const cycleDay = Math.max(1, daysBetween(cycleStart, today) + 1)
  const daysUntilNext = daysBetween(today, nextStart)

  // Future cycles (k=0 is the next upcoming period) used for events + windows.
  const fc = (k: number) => {
    const start = addDays(cycleStart, avgCycle * (k + 1))
    const ovulation = addDays(start, -14)
    return {
      start,
      end: addDays(start, avgPeriod - 1),
      ovulation,
      fertileStart: addDays(ovulation, -5),
      fertileEnd: addDays(ovulation, 1),
      pmsStart: addDays(start, -5),
      pmsEnd: addDays(start, -1),
    }
  }
  const c0 = fc(0)
  const c1 = fc(1)

  // Confidence: grows with how many cycles we have (coverage) and how consistent
  // they are (low variance). Deliberately low with only one logged period.
  let confidence: number
  if (gaps.length === 0) {
    confidence = 40 // a single period gives a start date but no measured cycle
  } else {
    const consistency = Math.max(0, 1 - std(gaps) / 8) // 0..1 (tight → 1)
    const coverage = Math.min(1, gaps.length / 5) // 0..1 (≥5 gaps → full)
    confidence = Math.round((0.55 + 0.4 * coverage) * (0.6 + 0.4 * consistency) * 100)
  }
  confidence = Math.min(96, Math.max(35, confidence))

  const prediction: CyclePrediction = {
    avgCycle,
    avgPeriod,
    confidence,
    cycleDay,
    nextStart: keyFromDate(c0.start),
    nextStartLabel: fmtLong(c0.start),
    daysUntilNext,
    ovulation: keyFromDate(c0.ovulation),
    fertileStart: keyFromDate(c0.fertileStart),
    fertileEnd: keyFromDate(c0.fertileEnd),
    pmsStart: keyFromDate(c0.pmsStart),
    pmsEnd: keyFromDate(c0.pmsEnd),
    lastStart: keyFromDate(lastStart),
  }

  const upcomingEvents: UpcomingEvent[] = [
    { label: 'PMS window', range: rangeStr(c0.pmsStart, c0.pmsEnd), phase: 'pms', days: daysBetween(today, c0.pmsStart) },
    { label: 'Next period', range: rangeStr(c0.start, addDays(c0.start, avgPeriod - 1)), phase: 'predicted', days: daysUntilNext },
    { label: 'Fertile window', range: rangeStr(c1.fertileStart, c1.fertileEnd), phase: 'fertile', days: daysBetween(today, c1.fertileStart) },
    { label: 'Ovulation', range: fmtShort(c1.ovulation), phase: 'ovulation', days: daysBetween(today, c1.ovulation) },
  ]

  // Cycle-length trend: real measured gaps (last 6), labelled by the month the
  // cycle closed in. With <2 logged gaps we synthesise a flat 2-point line off
  // the average so the AreaChart still has something to draw.
  let trendValues: number[]
  let trendLabels: string[]
  if (gaps.length >= 2) {
    const lastGaps = gaps.slice(-6)
    const offset = gaps.length - lastGaps.length
    trendValues = lastGaps
    trendLabels = lastGaps.map((_, i) => fmtMonth(starts[offset + i + 1]))
  } else if (gaps.length === 1) {
    trendValues = [gaps[0], gaps[0]]
    trendLabels = [fmtMonth(starts[0]), fmtMonth(starts[1])]
  } else {
    trendValues = [avgCycle, avgCycle]
    trendLabels = [fmtMonth(addDays(lastStart, -avgCycle)), fmtMonth(lastStart)]
  }

  const insights: Insight[] = []
  if (gaps.length < 1) {
    insights.push({
      title: 'Log another period to sharpen this',
      body: `Predictions start rough and tighten with every cycle you log. Right now we are about ${confidence}% confident.`,
      tone: 'info',
    })
  } else {
    const reg = std(gaps)
    if (reg <= 2) {
      insights.push({
        title: 'Your cycle is regular',
        body: `Your last ${gaps.length} cycle${gaps.length === 1 ? '' : 's'} varied by under ${Math.max(1, Math.round(reg))} day${Math.max(1, Math.round(reg)) === 1 ? '' : 's'}. Predictions are ${confidence}% confident.`,
        tone: 'good',
      })
    } else {
      insights.push({
        title: 'Your cycle varies a little',
        body: `Recent cycles swung by about ${Math.round(reg)} days, so treat these dates as a guide. Around ${confidence}% confident.`,
        tone: 'info',
      })
    }
  }
  insights.push({
    title: 'PMS window ahead',
    body: `Around ${rangeStr(c0.pmsStart, c0.pmsEnd)}. Keep a Night+Day pack handy and take it easy.`,
    tone: 'warning',
  })
  insights.push({
    title: `Reorder before ${prediction.nextStartLabel}`,
    body: 'Your 330mm Double Wings usually run out around your period start.',
    tone: 'info',
  })

  return {
    consent: user?.cycleDataConsent ?? false,
    needsData: false,
    today: todayKey,
    prediction,
    upcomingEvents,
    cycleLengthTrend: { labels: trendLabels, values: trendValues },
    insights,
    symptomLog,
    periods,
  }
}

// ── Writers ──────────────────────────────────────────────────────────────────

/**
 * Log a period start. `startDate` is a `YYYY-MM-DD` key; it is stored at UTC
 * midnight so it reads back on the same calendar day (see the module note).
 */
export async function logPeriod(userId: string, startDate: string, lengthDays: number): Promise<void> {
  await prisma.periodLog.create({
    data: {
      userId,
      encryptedData: encryptCyclePayload({ kind: 'period', start: startDate, length: lengthDays }),
    },
  })
}

/** Log a symptom intensity (0-3) for a given day. */
export async function logSymptom(userId: string, date: string, symptom: string, level: number): Promise<void> {
  await prisma.symptomLog.create({
    data: {
      userId,
      encryptedData: encryptCyclePayload({ kind: 'symptom', date, symptom, level }),
    },
  })
}

export async function deletePeriod(userId: string, id: string): Promise<boolean> {
  const result = await prisma.periodLog.deleteMany({ where: { id, userId } })
  return result.count === 1
}

export async function deleteSymptom(userId: string, id: string): Promise<boolean> {
  const result = await prisma.symptomLog.deleteMany({ where: { id, userId } })
  return result.count === 1
}

export async function setCycleConsent(userId: string, consent: boolean): Promise<boolean> {
  const result = await prisma.user.updateMany({ where: { id: userId }, data: { cycleDataConsent: consent } })
  return result.count === 1
}
