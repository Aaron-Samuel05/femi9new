import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDb } from '../helpers/db'
import { CycleConsentRequiredError, getCycleData, logPeriod, logSymptom } from '@femi9/core/services/cycle'

describe('cycle data encryption', () => {
  beforeEach(resetDb)

  it('stores health payloads encrypted while preserving the dashboard model', async () => {
    // Cycle writes are gated on explicit consent now, so the fixture has to give
    // it — that gate is the feature, not an obstacle to work around.
    const user = await prisma.user.create({
      data: { phone: '9888877777', role: 'customer', cycleDataConsent: true },
    })

    await logPeriod('femi9', user.id, '2026-07-01', 5)
    await logSymptom('femi9', user.id, '2026-07-02', 'Cramps', 2)

    const period = await prisma.periodLog.findFirstOrThrow({ where: { userId: user.id } })
    expect(period.startDate).toBeNull()
    expect(period.lengthDays).toBeNull()
    expect(period.encryptedData).toMatch(/^v1\./)
    expect(period.encryptedData).not.toContain('2026-07-01')

    const symptom = await prisma.symptomLog.findFirstOrThrow({ where: { userId: user.id } })
    expect(symptom.date).toBeNull()
    expect(symptom.symptom).toBeNull()
    expect(symptom.level).toBeNull()
    expect(symptom.encryptedData).toMatch(/^v1\./)
    expect(symptom.encryptedData).not.toContain('Cramps')

    const data = await getCycleData('femi9', user.id)
    // Entries also carry the row id (the dashboard needs it to delete a log),
    // so match on the decrypted fields rather than the whole object.
    expect(data.periods).toContainEqual(expect.objectContaining({ start: '2026-07-01', length: 5 }))
    expect(data.symptomLog).toContainEqual(expect.objectContaining({ day: 'Cramps', level: 2 }))
  })

  it('refuses to write anything until the user has consented', async () => {
    const user = await prisma.user.create({
      data: { phone: '9888877778', role: 'customer' },
    })

    await expect(logPeriod('femi9', user.id, '2026-07-01', 5)).rejects.toBeInstanceOf(CycleConsentRequiredError)
    await expect(logSymptom('femi9', user.id, '2026-07-02', 'Cramps', 2)).rejects.toBeInstanceOf(
      CycleConsentRequiredError,
    )

    expect(await prisma.periodLog.count({ where: { userId: user.id } })).toBe(0)
    expect(await prisma.symptomLog.count({ where: { userId: user.id } })).toBe(0)
  })

  it('re-logging the same start corrects the row instead of duplicating it', async () => {
    const user = await prisma.user.create({
      data: { phone: '9888877779', role: 'customer', cycleDataConsent: true },
    })

    // The landing tracker re-POSTs on every "Show Prediction", so this happened
    // constantly. Two rows on one day gave a gap of 0, an avgCycle of 0, and
    // "Period in NaN days" across the entire dashboard.
    const first = await logPeriod('femi9', user.id, '2026-07-01', 5)
    const second = await logPeriod('femi9', user.id, '2026-07-01', 6)

    expect(second.deduped).toBe(true)
    expect(second.id).toBe(first.id)
    expect(await prisma.periodLog.count({ where: { userId: user.id } })).toBe(1)

    const data = await getCycleData('femi9', user.id)
    expect(data.periods).toHaveLength(1)
    expect(data.periods[0]).toMatchObject({ start: '2026-07-01', length: 6 })
    // Whatever the history, the prediction must stay finite and in range.
    expect(data.prediction.avgCycle).toBeGreaterThanOrEqual(21)
    expect(data.prediction.avgCycle).toBeLessThanOrEqual(35)
    expect(Number.isFinite(data.prediction.daysUntilNext)).toBe(true)
  })
})
