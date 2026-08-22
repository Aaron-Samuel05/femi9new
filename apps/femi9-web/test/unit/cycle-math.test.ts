import { describe, expect, it } from 'vitest'
import {
  CYCLE_MAX,
  CYCLE_MIN,
  DEFAULT_CYCLE,
  addDaysKey,
  clampCycle,
  clampPeriod,
  cycleWindow,
  dateFromKey,
  dayKeyInZone,
  daysBetweenKeys,
  isDayKey,
  keyFromDate,
  localDayKey,
  phaseForDayKey,
  predictFromLastStart,
} from '@femi9/core/cycle-math'

/**
 * These cover the arithmetic that used to be duplicated three times and had
 * drifted. Every case here maps to a finding: a divide-by-zero that put "NaN"
 * on the dashboard, a fertile window advertised a day wider than it was
 * painted, and a UTC "today" that rejected a user's real date in IST.
 */

describe('day keys', () => {
  it('round-trips a key through a Date without shifting the day', () => {
    for (const key of ['2026-01-01', '2026-02-28', '2026-03-29', '2026-08-13', '2026-12-31']) {
      expect(keyFromDate(dateFromKey(key))).toBe(key)
    }
  })

  it('rejects malformed and non-existent days', () => {
    expect(isDayKey('2026-08-13')).toBe(true)
    expect(isDayKey('2026-02-31')).toBe(false) // rolls over to March
    expect(isDayKey('2026-8-13')).toBe(false)
    expect(isDayKey('')).toBe(false)
    expect(isDayKey(undefined)).toBe(false)
  })

  it('reads the local day, not the UTC day', () => {
    // 01:00 on 14 Aug in a zone 5:30 ahead is still 13 Aug in UTC. The API used
    // to compare against the UTC value and told the user her today was future.
    const istEarlyMorning = new Date('2026-08-13T19:30:00.000Z') // 14 Aug 01:00 IST
    expect(dayKeyInZone('Asia/Kolkata', istEarlyMorning)).toBe('2026-08-14')
    expect(istEarlyMorning.toISOString().slice(0, 10)).toBe('2026-08-13')
  })

  it('falls back rather than throwing on an unknown timezone', () => {
    const at = new Date('2026-08-13T12:00:00.000Z')
    expect(dayKeyInZone('Not/AZone', at)).toBe('2026-08-13')
  })

  it('localDayKey agrees with the runtime local calendar day', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`
    expect(localDayKey(now)).toBe(expected)
  })

  it('adds and subtracts days across a month boundary', () => {
    expect(addDaysKey('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetweenKeys('2026-08-01', '2026-08-29')).toBe(28)
    expect(daysBetweenKeys('2026-08-29', '2026-08-01')).toBe(-28)
  })
})

describe('clamps', () => {
  it('never lets a degenerate average escape the clinical range', () => {
    // gaps of [0] from a duplicate log gave avgCycle 0, then Infinity, then
    // "Period in NaN days" through every panel on the dashboard.
    expect(clampCycle(0)).toBe(DEFAULT_CYCLE)
    expect(clampCycle(NaN)).toBe(DEFAULT_CYCLE)
    expect(clampCycle(Infinity)).toBe(DEFAULT_CYCLE)
    expect(clampCycle(-4)).toBe(DEFAULT_CYCLE)
    // A real but out-of-range measurement is floored/ceilinged, not defaulted.
    expect(clampCycle(12)).toBe(CYCLE_MIN)
    expect(clampCycle(400)).toBe(CYCLE_MAX)
    expect(clampCycle(29)).toBe(29)
  })

  it('clamps period length to 1..15, defaulting rather than flooring a zero', () => {
    expect(clampPeriod(0)).toBe(5) // absent measurement, not a zero-day period
    expect(clampPeriod(-3)).toBe(5)
    expect(clampPeriod(99)).toBe(15)
    expect(clampPeriod(NaN)).toBe(5)
    expect(clampPeriod(1)).toBe(1)
    expect(clampPeriod(6)).toBe(6)
  })
})

describe('cycleWindow', () => {
  const w = cycleWindow(dateFromKey('2026-09-01'), 5)

  it('places ovulation 14 days before the start', () => {
    expect(keyFromDate(w.ovulation)).toBe('2026-08-18')
  })

  it('uses one fertile-window definition: ovulation-5 to ovulation+1', () => {
    expect(keyFromDate(w.fertileStart)).toBe('2026-08-13')
    expect(keyFromDate(w.fertileEnd)).toBe('2026-08-19')
  })

  it('runs PMS through the five days before the start', () => {
    expect(keyFromDate(w.pmsStart)).toBe('2026-08-27')
    expect(keyFromDate(w.pmsEnd)).toBe('2026-08-31')
  })
})

describe('phaseForDayKey', () => {
  const input = { nextStart: '2026-09-01', avgCycle: 28, avgPeriod: 5 }

  it('names the ovulation day itself, not the band around it', () => {
    expect(phaseForDayKey('2026-08-18', input)).toBe('ovulation')
  })

  it('paints the whole advertised fertile window, both edges included', () => {
    // The old painters stopped at ovulation-1 while the text advertised
    // ovulation+1, leaving the last advertised day visibly blank.
    expect(phaseForDayKey('2026-08-13', input)).toBe('fertile')
    expect(phaseForDayKey('2026-08-17', input)).toBe('fertile')
    expect(phaseForDayKey('2026-08-19', input)).toBe('fertile')
    expect(phaseForDayKey('2026-08-12', input)).toBeNull()
  })

  it('paints PMS then the predicted period', () => {
    expect(phaseForDayKey('2026-08-27', input)).toBe('pms')
    expect(phaseForDayKey('2026-08-31', input)).toBe('pms')
    expect(phaseForDayKey('2026-09-01', input)).toBe('predicted')
    expect(phaseForDayKey('2026-09-05', input)).toBe('predicted')
    expect(phaseForDayKey('2026-09-06', input)).toBeNull()
  })

  it('lets a logged period win over any predicted band', () => {
    const withHistory = { ...input, periods: [{ start: '2026-08-18', length: 4 }] }
    // 18 Aug would otherwise be the ovulation day.
    expect(phaseForDayKey('2026-08-18', withHistory)).toBe('period')
    expect(phaseForDayKey('2026-08-21', withHistory)).toBe('period')
  })

  it('still paints the cycles that have already closed, for back-navigation', () => {
    // One cycle earlier: 4 Aug is the previous cycle's start (1 Sep - 28).
    expect(phaseForDayKey('2026-08-04', input)).toBe('predicted')
  })

  it('cannot produce a phase from a degenerate cycle length', () => {
    const broken = { nextStart: '2026-09-01', avgCycle: 0, avgPeriod: 0 }
    // Clamped internally, so this terminates and answers rather than hanging.
    expect(phaseForDayKey('2026-09-01', broken)).toBe('predicted')
  })
})

describe('predictFromLastStart', () => {
  it('rolls a stale start forward to the cycle containing today', () => {
    const p = predictFromLastStart('2026-05-01', '2026-08-13', 28, 5)
    expect(p).not.toBeNull()
    // 1 May + 3*28 = 24 Jul; the next start is 21 Aug.
    expect(p!.cycleStart).toBe('2026-07-24')
    expect(p!.nextStart).toBe('2026-08-21')
    expect(p!.daysUntilNext).toBe(8)
    expect(p!.cycleDay).toBe(21)
  })

  it('always reports a strictly future next start and a positive cycle day', () => {
    for (const today of ['2026-08-01', '2026-08-14', '2026-08-28', '2026-09-30']) {
      const p = predictFromLastStart('2026-08-01', today, 28, 5)!
      expect(p.daysUntilNext).toBeGreaterThan(0)
      expect(p.cycleDay).toBeGreaterThanOrEqual(1)
      expect(p.cycleDay).toBeLessThanOrEqual(28)
      expect(Number.isFinite(p.daysUntilNext)).toBe(true)
    }
  })

  it('survives a degenerate cycle length without dividing by zero', () => {
    const p = predictFromLastStart('2026-08-01', '2026-08-13', 0, 0)!
    expect(p.cycleLength).toBe(DEFAULT_CYCLE)
    expect(Number.isFinite(p.daysUntilNext)).toBe(true)
    expect(p.nextStart).toBe('2026-08-29')
  })

  it('returns null rather than an Invalid Date for junk input', () => {
    expect(predictFromLastStart('not-a-date', '2026-08-13', 28, 5)).toBeNull()
    expect(predictFromLastStart('2026-08-01', 'nope', 28, 5)).toBeNull()
  })

  it('agrees with phaseForDayKey about today, so the two surfaces cannot drift', () => {
    const p = predictFromLastStart('2026-08-01', '2026-08-18', 28, 5)!
    const painted = phaseForDayKey('2026-08-18', {
      nextStart: p.nextStart,
      avgCycle: p.cycleLength,
      avgPeriod: p.periodLength,
      periods: [{ start: p.cycleStart, length: p.periodLength }],
    })
    expect(p.phase).toBe(painted)
  })
})
