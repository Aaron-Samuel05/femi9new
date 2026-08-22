import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, makeProduct, prisma } from './helpers/db'
import { orderToken, verifyOrderToken } from '@femi9/core/order-token'

describe('harness sanity', () => {
  beforeEach(async () => { await resetDb() })
  it('connects to the test DB and creates a product', async () => {
    const { variant } = await makeProduct({ stock: 7 })
    const count = await prisma.productVariant.count()
    expect(count).toBe(1)
    expect(variant.stock).toBe(7)
  })
  it('order-token round-trips and rejects tampering', () => {
    const t = orderToken('FM-00001')
    expect(verifyOrderToken('FM-00001', t)).toBe(true)
    expect(verifyOrderToken('FM-00002', t)).toBe(false)
    expect(verifyOrderToken('FM-00001', 'bogus')).toBe(false)
  })
})
