import { prisma } from '@/lib/db'

/**
 * Test DB helpers. `resetDb()` truncates every table (FK-safe via CASCADE) so
 * each test starts clean; the fixture builders create the minimal graph a test
 * needs. Import these in integration tests and call resetDb() in beforeEach.
 */

export { prisma }

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

/** Create a product with one pack variant. Returns { product, variant }. */
export async function makeProduct(opts?: { slug?: string; price?: number; stock?: number }) {
  const slug = opts?.slug ?? `p-${Math.random().toString(36).slice(2, 8)}`
  const price = opts?.price ?? 199
  const stock = opts?.stock ?? 50
  const product = await prisma.product.create({
    data: {
      slug,
      name: `Test ${slug}`,
      type: 'pad',
      basePrice: price,
      meta: 'test',
      flow: 'test',
      description: 'test product',
      status: 'active',
      variants: {
        create: { kind: 'pack', label: '6 pcs', packCount: 6, price, sku: `${slug}-6`, stock, active: true },
      },
    },
    include: { variants: true },
  })
  return { product, variant: product.variants[0]! }
}

/** Seed the editable settings the money path reads (free-ship, points, etc.). */
export async function seedSettings() {
  const rows: Record<string, unknown> = {
    freeShipThreshold: 999,
    subscribeSavePct: 15,
    whatsappNumber: '919042916499',
    pointsPerRupee: 1,
    firstOrderBonusPoints: 100,
  }
  for (const [key, value] of Object.entries(rows)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } })
  }
}

/** Put a variant in a fresh guest cart and return the guest token. */
export async function cartWith(token: string, variantId: string, qty = 1) {
  const cart = await prisma.cart.upsert({ where: { guestToken: token }, create: { guestToken: token }, update: {} })
  await prisma.cartItem.create({ data: { cartId: cart.id, variantId, qty } })
  return token
}
