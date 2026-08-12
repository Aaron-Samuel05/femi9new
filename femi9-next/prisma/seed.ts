/**
 * Seed only public catalog and editorial content.
 *
 * Included:
 * - products, variants, images, features and specifications
 * - blog categories and blog posts
 *
 * Deliberately excluded: users, reviews, rewards, orders, subscriptions,
 * settings, cadences, community posts and analytics/demo activity.
 */
import { PrismaClient } from '@prisma/client'
import { PRODUCTS } from '../src/data/products'
import { EXTRAS } from '../src/data/productDetail'
import { POSTS, CATEGORY_META } from '../src/data/blog'

const prisma = new PrismaClient()

async function seedBlogCategories() {
  const entries = Object.entries(CATEGORY_META)
  for (const [name, meta] of entries) {
    await prisma.blogCategory.upsert({
      where: { name },
      create: { name, color: meta.color, tint: meta.tint },
      update: { color: meta.color, tint: meta.tint },
    })
  }
  console.log(`Seeded blog categories (${entries.length})`)
}

async function seedProducts() {
  for (const source of PRODUCTS) {
    const extra = EXTRAS[source.id]
    const product = await prisma.product.upsert({
      where: { slug: source.id },
      create: {
        slug: source.id,
        name: source.name,
        type: source.type ?? 'pad',
        basePrice: source.price,
        meta: source.meta,
        flow: source.flow,
        description: source.desc,
        longDescription: extra?.long,
        tag: source.tag,
        tagClass: source.tagClass,
        rating: 0,
        reviewCount: 0,
      },
      update: {
        name: source.name,
        type: source.type ?? 'pad',
        basePrice: source.price,
        meta: source.meta,
        flow: source.flow,
        description: source.desc,
        longDescription: extra?.long,
        tag: source.tag,
        tagClass: source.tagClass,
        rating: 0,
        reviewCount: 0,
        status: 'active',
      },
    })

    const variants = source.type === 'panty' && source.sizes?.length
      ? source.sizes.map((size) => ({
          sku: `${source.id}-${size}`,
          kind: 'size' as const,
          label: size,
          size,
          packCount: null,
          price: source.price,
          stock: 100,
        }))
      : source.packs?.length
        ? source.packs.map((pack) => ({
            sku: `${source.id}-${pack.count}`,
            kind: 'pack' as const,
            label: `${pack.count} pcs`,
            size: null,
            packCount: pack.count,
            price: pack.price,
            stock: 200,
          }))
        : (() => {
            const count = Number(source.meta.match(/(\d+)\s*(?:pads?|liners?)/)?.[1] ?? 1)
            return [{
              sku: `${source.id}-${count}`,
              kind: 'pack' as const,
              label: `${count} pcs`,
              size: null,
              packCount: count,
              price: source.price,
              stock: 200,
            }]
          })()

    for (const variant of variants) {
      await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        create: { productId: product.id, ...variant, active: true },
        update: { productId: product.id, ...variant, active: true },
      })
    }

    await prisma.productImage.deleteMany({ where: { productId: product.id } })
    const gallery = extra?.gallery?.filter(Boolean) ?? []
    if (gallery.length) {
      await prisma.productImage.createMany({
        data: gallery.map((url, position) => ({ productId: product.id, url, position })),
      })
    } else if (source.img) {
      await prisma.productImage.create({ data: { productId: product.id, url: source.img, position: 0 } })
    }

    await prisma.productFeature.deleteMany({ where: { productId: product.id } })
    if (extra?.features?.length) {
      await prisma.productFeature.createMany({
        data: extra.features.map((feature, position) => ({
          productId: product.id,
          title: feature.title,
          body: feature.body,
          position,
        })),
      })
    }

    await prisma.productSpec.deleteMany({ where: { productId: product.id } })
    if (extra?.specs?.length) {
      await prisma.productSpec.createMany({
        data: extra.specs.map((spec, position) => ({
          productId: product.id,
          key: spec.k,
          value: spec.v,
          position,
        })),
      })
    }
  }
  console.log(`Seeded products (${PRODUCTS.length}) with catalog details`)
}

async function seedBlogPosts() {
  for (const post of POSTS) {
    const category = await prisma.blogCategory.findUnique({ where: { name: post.category } })
    if (!category) throw new Error(`Missing blog category: ${post.category}`)
    const data = {
      title: post.title,
      categoryId: category.id,
      excerpt: post.excerpt,
      author: post.author,
      readTime: post.readTime,
      tone: post.tone,
      image: post.image,
      featured: post.featured ?? false,
      body: post.body,
      publishedAt: new Date(post.date),
    }
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      create: { slug: post.slug, ...data },
      update: data,
    })
  }
  console.log(`Seeded blog posts (${POSTS.length})`)
}

async function main() {
  console.log('Seeding Femi9 catalog and blog content...')
  await seedBlogCategories()
  await seedProducts()
  await seedBlogPosts()
  console.log('Done.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
