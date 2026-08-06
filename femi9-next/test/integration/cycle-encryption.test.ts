import { beforeEach, describe, expect, it } from 'vitest'
import { prisma, resetDb } from '../helpers/db'
import { getCycleData, logPeriod, logSymptom } from '@/lib/services/cycle'

describe('cycle data encryption', () => {
  beforeEach(resetDb)

  it('stores health payloads encrypted while preserving the dashboard model', async () => {
    const user = await prisma.user.create({
      data: { phone: '9888877777', role: 'customer' },
    })

    await logPeriod(user.id, '2026-07-01', 5)
    await logSymptom(user.id, '2026-07-02', 'Cramps', 2)

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

    const data = await getCycleData(user.id)
    expect(data.periods).toContainEqual({ start: '2026-07-01', length: 5 })
    expect(data.symptomLog).toContainEqual({ day: 'Cramps', level: 2 })
  })
})
