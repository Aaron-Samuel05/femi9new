/**
 * Seed the database from the existing static content in `src/data/*`.
 * Idempotent: upserts on natural keys (slug, code, name, email) so it can be
 * re-run safely. Implements PRD §22 (data migration) — notably: product `slug`
 * keeps the original id (so /product/p330dw URLs still resolve) and order items
 * reference variants by id, not product name.
 *
 * Run: `npm run db:seed` (after DATABASE_URL points at a live Postgres).
 */
import { PrismaClient, type CouponType } from '@prisma/client'
import { PRODUCTS, CADENCES, FREE_SHIP, SUBSCRIBE_PCT, WA_NUMBER } from '../src/data/products'
import { EXTRAS, sampleReviews } from '../src/data/productDetail'
import { POSTS, CATEGORY_META } from '../src/data/blog'
import { user as demoUser, addresses as demoAddresses } from '../src/data/account'

const prisma = new PrismaClient()

async function seedSettings() {
  const settings: Record<string, unknown> = {
    freeShipThreshold: FREE_SHIP,
    subscribeSavePct: SUBSCRIBE_PCT,
    whatsappNumber: WA_NUMBER,
    pointsPerRupee: 1,
    firstOrderBonusPoints: 100,
  }
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as object },
      update: { value: value as object },
    })
  }
  console.log(`✓ settings (${Object.keys(settings).length})`)
}

async function seedCadences() {
  for (const [i, c] of CADENCES.entries()) {
    await prisma.cadence.upsert({
      where: { code: c.id },
      create: { code: c.id, label: c.label, sub: c.sub, days: c.days, position: i },
      update: { label: c.label, sub: c.sub, days: c.days, position: i },
    })
  }
  console.log(`✓ cadences (${CADENCES.length})`)
}

async function seedBlogCategories() {
  const entries = Object.entries(CATEGORY_META)
  for (const [name, meta] of entries) {
    await prisma.blogCategory.upsert({
      where: { name },
      create: { name, color: meta.color, tint: meta.tint },
      update: { color: meta.color, tint: meta.tint },
    })
  }
  console.log(`✓ blog categories (${entries.length})`)
}

async function seedProducts() {
  for (const p of PRODUCTS) {
    const extra = EXTRAS[p.id]
    // slug keeps the original id so existing /product/:id URLs still resolve.
    const product = await prisma.product.upsert({
      where: { slug: p.id },
      create: {
        slug: p.id,
        name: p.name,
        type: p.type ?? 'pad',
        basePrice: p.price,
        meta: p.meta,
        flow: p.flow,
        description: p.desc,
        longDescription: extra?.long,
        tag: p.tag,
        tagClass: p.tagClass,
        rating: extra?.rating ?? 0,
        reviewCount: extra?.reviews ?? 0,
      },
      update: {
        name: p.name,
        type: p.type ?? 'pad',
        basePrice: p.price,
        meta: p.meta,
        flow: p.flow,
        description: p.desc,
        longDescription: extra?.long,
        tag: p.tag,
        tagClass: p.tagClass,
        rating: extra?.rating ?? 0,
        reviewCount: extra?.reviews ?? 0,
      },
    })

    // Variants — replace to stay in sync with source packs/sizes.
    await prisma.productVariant.deleteMany({ where: { productId: product.id } })
    if (p.type === 'panty' && p.sizes?.length) {
      await prisma.productVariant.createMany({
        data: p.sizes.map((size) => ({
          productId: product.id,
          kind: 'size' as const,
          label: size,
          size,
          price: p.price,
          sku: `${p.id}-${size}`,
          stock: 100,
          active: true,
        })),
      })
    } else if (p.packs?.length) {
      await prisma.productVariant.createMany({
        data: p.packs.map((pack) => ({
          productId: product.id,
          kind: 'pack' as const,
          label: `${pack.count} pcs`,
          packCount: pack.count,
          price: pack.price,
          sku: `${p.id}-${pack.count}`,
          stock: 200,
          active: true,
        })),
      })
    } else {
      // Single default pack (e.g. the 3-pad starter with no explicit packs).
      const count = Number(p.meta.match(/(\d+)\s*pads?/)?.[1] ?? 1)
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          kind: 'pack',
          label: `${count} pcs`,
          packCount: count,
          price: p.price,
          sku: `${p.id}-${count}`,
          stock: 200,
        },
      })
    }

    // Images / features / specs — replace from source.
    await prisma.productImage.deleteMany({ where: { productId: product.id } })
    const gallery = extra?.gallery?.filter(Boolean) ?? []
    if (gallery.length) {
      await prisma.productImage.createMany({
        data: gallery.map((url, i) => ({ productId: product.id, url, position: i })),
      })
    } else if (p.img) {
      await prisma.productImage.create({ data: { productId: product.id, url: p.img, position: 0 } })
    }

    await prisma.productFeature.deleteMany({ where: { productId: product.id } })
    if (extra?.features?.length) {
      await prisma.productFeature.createMany({
        data: extra.features.map((f, i) => ({ productId: product.id, title: f.title, body: f.body, position: i })),
      })
    }

    await prisma.productSpec.deleteMany({ where: { productId: product.id } })
    if (extra?.specs?.length) {
      await prisma.productSpec.createMany({
        data: extra.specs.map((s, i) => ({ productId: product.id, key: s.k, value: s.v, position: i })),
      })
    }
  }
  console.log(`✓ products (${PRODUCTS.length}) with variants / images / features / specs`)
}

async function seedReviews() {
  // Attach the sample reviews to the bestseller for realistic product-page data.
  const bestseller = await prisma.product.findUnique({ where: { slug: 'p330dw' } })
  if (!bestseller) return
  await prisma.review.deleteMany({ where: { productId: bestseller.id } })
  await prisma.review.createMany({
    data: sampleReviews.map((r) => ({
      productId: bestseller.id,
      name: r.name,
      place: r.place,
      rating: r.rating,
      body: r.body,
      status: 'approved' as const,
    })),
  })
  console.log(`✓ reviews (${sampleReviews.length})`)
}

async function seedRewardOptions() {
  const options: { title: string; costPoints: number; couponType: CouponType; couponValue: number; position: number }[] = [
    { title: 'Rs.100 off your next order', costPoints: 500, couponType: 'flat', couponValue: 100, position: 0 },
    { title: 'Rs.250 off your next order', costPoints: 1000, couponType: 'flat', couponValue: 250, position: 1 },
    { title: 'Free Period Panties', costPoints: 2000, couponType: 'flat', couponValue: 649, position: 2 },
  ]
  // Reward options have no natural key; reset and recreate.
  await prisma.rewardOption.deleteMany({})
  await prisma.rewardOption.createMany({ data: options })
  console.log(`✓ reward options (${options.length})`)
}

async function seedBlog() {
  for (const post of POSTS) {
    const category = await prisma.blogCategory.findUnique({ where: { name: post.category } })
    if (!category) continue
    const publishedAt = new Date(post.date)
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      create: {
        slug: post.slug,
        title: post.title,
        categoryId: category.id,
        excerpt: post.excerpt,
        author: post.author,
        readTime: post.readTime,
        tone: post.tone,
        image: post.image,
        featured: post.featured ?? false,
        body: post.body,
        publishedAt,
      },
      update: {
        title: post.title,
        categoryId: category.id,
        excerpt: post.excerpt,
        author: post.author,
        readTime: post.readTime,
        tone: post.tone,
        image: post.image,
        featured: post.featured ?? false,
        body: post.body,
        publishedAt,
      },
    })
  }
  console.log(`✓ blog posts (${POSTS.length})`)
}

async function seedDemoUsers() {
  // A demo admin + the demo customer, so dashboards have data in dev.
  await prisma.user.upsert({
    where: { email: 'admin@femi9.in' },
    create: { email: 'admin@femi9.in', name: 'Femi9 Ops', role: 'admin', tier: 'Administrator' },
    update: { role: 'admin' },
  })

  const customer = await prisma.user.upsert({
    where: { email: demoUser.email },
    create: { email: demoUser.email, name: demoUser.name, phone: demoUser.phone, role: 'customer', tier: demoUser.tier },
    update: { name: demoUser.name, tier: demoUser.tier },
  })

  await prisma.address.deleteMany({ where: { userId: customer.id } })
  await prisma.address.createMany({
    data: demoAddresses.map((a) => ({
      userId: customer.id,
      label: a.label,
      name: a.name,
      line: a.line,
      city: a.city,
      phone: a.phone,
      isPrimary: a.primary,
    })),
  })

  // Seed a short period history so the cycle predictions have input.
  await prisma.periodLog.deleteMany({ where: { userId: customer.id } })
  const base = new Date('2026-01-27')
  const history = [0, 28, 56, 84, 112, 140].map((offset) => {
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    return { userId: customer.id, startDate: d, lengthDays: 5 }
  })
  await prisma.periodLog.createMany({ data: history })

  // Opening loyalty balance from the demo profile.
  await prisma.pointsLedger.deleteMany({ where: { userId: customer.id } })
  await prisma.pointsLedger.create({
    data: { userId: customer.id, delta: demoUser.points, reason: 'Opening balance (migrated)', balanceAfter: demoUser.points },
  })

  console.log('✓ demo users (admin + customer) with addresses, period history, points')
}

async function main() {
  console.log('Seeding Femi9 database…')
  await seedSettings()
  await seedCadences()
  await seedBlogCategories()
  await seedProducts()
  await seedReviews()
  await seedRewardOptions()
  await seedBlog()
  await seedDemoUsers()
  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
