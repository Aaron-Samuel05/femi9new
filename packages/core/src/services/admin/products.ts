import 'server-only'
import { z } from 'zod'
import { dbFor, type Brand } from '@femi9/db'
import { isManagedImageUrl, MANAGED_IMAGE_URL_MESSAGE } from '../../image-url'

/**
 * Admin product service — the write-side counterpart to src/lib/services/products.ts
 * (which is read-only + storefront-shaped and only ever sees `active` rows).
 *
 * This module powers the reusable add/edit-product template: it must work for
 * ANY future product, so nothing here is hardcoded to the current catalogue.
 * A product is a set of scalar fields + an ordered image list + a dynamic list
 * of variants (packs for pads, sizes for panties). On update we DIFF variants by
 * id so the editor can freely add/remove/reorder rows in one round-trip.
 */

// ─────────────────────────── Validation (zod) ───────────────────────────
// z.coerce on numbers so a JSON payload carrying "225" (from an <input>) is
// accepted as well as 225 — the form sends strings for numeric fields.

const VariantInput = z.object({
  // Present => update an existing variant; absent => create a new one.
  id: z.string().optional(),
  kind: z.enum(['pack', 'size']),
  label: z.string().trim().min(1, 'Label is required'),
  // packCount belongs to packs, size to sizes; the other is null (enforced below).
  packCount: z.coerce.number().int().min(0).nullable().optional(),
  size: z.string().trim().min(1).nullable().optional(),
  price: z.coerce.number().int().min(0, 'Price must be ≥ 0'),
  // Empty SKU is normalised to null so many variants can share "no SKU" without
  // tripping the unique index (Postgres allows multiple NULLs, not multiple '').
  sku: z.string().trim().optional().nullable(),
  stock: z.coerce.number().int().min(0).default(0),
  active: z.boolean().default(true),
})

/** A Key Benefits entry. The PDP reads the first six and mirrors them three per
 *  side, so order is meaningful — position follows array index. */
const FeatureInput = z.object({
  title: z.string().trim().min(1, 'Feature title is required'),
  body: z.string().trim().default(''),
})

/** One row of the PDP specs table. */
const SpecInput = z.object({
  key: z.string().trim().min(1, 'Spec name is required'),
  value: z.string().trim().default(''),
})

export const ProductInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  // Blank slug => auto-derived from the name and made unique in the service.
  slug: z.string().trim().optional().default(''),
  // The union of what ANY brand sells. Which of them a given brand may use is
  // not a validation concern — see allowsProductType in @femi9/core/brands,
  // called by the routes that accept this input.
  type: z.enum(['pad', 'panty', 'diaper']),
  basePrice: z.coerce.number().int().min(0, 'Base price must be ≥ 0'),
  // meta/flow/description are NOT NULL in the schema; default '' keeps the form
  // forgiving while still writing a valid row.
  meta: z.string().trim().default(''),
  flow: z.string().trim().default(''),
  description: z.string().trim().default(''),
  longDescription: z.string().trim().optional().nullable(),
  tag: z.string().trim().optional().nullable(),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  /**
   * Only images this platform hosts — see @femi9/core/image-url. The form is an
   * upload button now, but the form is UI; this is what a crafted POST meets.
   * Without it the column would still accept `https://someone-else.example/x.png`
   * (hotlinked, and leaking our shoppers' referrers to a third party) or a
   * `data:`/`javascript:` URL that becomes stored XSS the moment a template puts
   * it somewhere that executes.
   */
  images: z
    .array(z.string().trim().min(1).refine(isManagedImageUrl, MANAGED_IMAGE_URL_MESSAGE))
    .default([]),
  variants: z.array(VariantInput).default([]),
  /**
   * Key Benefits and the specs table. Both were previously READ into the editor
   * (see getAdminProduct) with no way to write them back, so the PDP's benefit
   * panel and spec table could only ever be populated by a seed fixture — a
   * product created through the console got neither.
   *
   * `.optional()` with NO default, unlike images/variants above, and the
   * distinction carries meaning in updateProduct:
   *   absent  → leave the existing rows alone
   *   []      → clear them
   * A default of [] here would make every PATCH from a client that doesn't send
   * these fields silently wipe whatever was already published.
   */
  features: z.array(FeatureInput).optional(),
  specs: z.array(SpecInput).optional(),
})

export type ProductInput = z.infer<typeof ProductInputSchema>
type VariantInputT = z.infer<typeof VariantInput>

// ───────────────────────────── Slug helpers ─────────────────────────────

function slugify(source: string): string {
  return source
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve a unique slug. Derives from `source`, then appends -2, -3, … until it
 * finds a free one. `excludeId` lets an edit keep its own slug. Racy under heavy
 * concurrency, but the DB unique index is the real backstop (P2002 → 400).
 */
async function resolveSlug(brand: Brand, source: string, excludeId?: string): Promise<string> {
  const prisma = dbFor(brand)
  const base = slugify(source) || 'product'
  let candidate = base
  let n = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const clash = await prisma.product.findFirst({
      where: { slug: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    })
    if (!clash) return candidate
    candidate = `${base}-${n++}`
  }
}

/** Strip a variant to the DB columns, coercing kind-specific fields + SKU. */
function cleanVariant(v: VariantInputT) {
  return {
    kind: v.kind,
    label: v.label,
    // Keep only the field that belongs to this kind; null out the other so a
    // row switched pack↔size can't leave a stale value behind.
    packCount: v.kind === 'pack' ? v.packCount ?? null : null,
    size: v.kind === 'size' ? v.size ?? null : null,
    price: v.price,
    sku: v.sku && v.sku.length > 0 ? v.sku : null,
    stock: v.stock,
    active: v.active,
  }
}

// ─────────────────────────────── Reads ──────────────────────────────────

/** All products (every status) with image thumb, variant count + total stock. */
export async function listAdminProducts(brand: Brand) {
  const prisma = dbFor(brand)
  try {
    const rows = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
        // Pull just stock to sum in-app; the catalogue is small so this is cheap
        // and avoids a second aggregate round-trip per product.
        variants: { select: { stock: true } },
        _count: { select: { variants: true, images: true } },
      },
    })

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      type: r.type,
      basePrice: r.basePrice,
      status: r.status,
      thumb: r.images[0]?.url ?? null,
      variantCount: r._count.variants,
      imageCount: r._count.images,
      totalStock: r.variants.reduce((sum, v) => sum + v.stock, 0),
    }))
  } catch {
    return []
  }
}

/** One product, fully loaded for the editor (variants/images/features/specs). */
export async function getAdminProduct(brand: Brand, id: string) {
  const prisma = dbFor(brand)
  return prisma.product.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { price: 'asc' } },
      images: { orderBy: { position: 'asc' } },
      features: { orderBy: { position: 'asc' } },
      specs: { orderBy: { position: 'asc' } },
    },
  })
}

// ─────────────────────────────── Writes ─────────────────────────────────

export async function createProduct(brand: Brand, input: ProductInput) {
  const prisma = dbFor(brand)
  const slug = await resolveSlug(brand, input.slug || input.name)

  return prisma.product.create({
    data: {
      name: input.name,
      slug,
      type: input.type,
      basePrice: input.basePrice,
      meta: input.meta,
      flow: input.flow,
      description: input.description,
      longDescription: input.longDescription || null,
      tag: input.tag || null,
      status: input.status,
      images: { create: input.images.map((url, i) => ({ url, position: i })) },
      variants: { create: input.variants.map(cleanVariant) },
      features: {
        create: (input.features ?? []).map((f, i) => ({ title: f.title, body: f.body, position: i })),
      },
      specs: {
        create: (input.specs ?? []).map((s, i) => ({ key: s.key, value: s.value, position: i })),
      },
    },
    select: { id: true },
  })
}

/**
 * Update a product and reconcile its children. Variants are diffed by id:
 *  - row with an id we still have  → update in place
 *  - row without an id (or unknown) → create
 *  - existing id not in the payload → delete
 * Images are simply replaced (they're a plain ordered URL list). All in one
 * transaction so a partial failure never leaves half-applied edits.
 */
/**
 * Keep `basePrice` and the leading pack's price as ONE number.
 *
 * ── Why there are two prices at all ─────────────────────────────────────────
 * The schema serves both brands. Femi9 sells period panties, whose variants are
 * SIZES that all cost the same (the seed writes `price: source.price` for every
 * one), so there `basePrice` is the real price and the variants only pick a fit.
 * Lumi9 sells one product in pack tiers, each with its own price, and its seed
 * simply copies the default tier's price into `basePrice`.
 *
 * So on a pack-tiered product `basePrice` is a DUPLICATE of one tier's price —
 * and a duplicate that nothing charges. Editing "Base price (₹)" in the console
 * saved a column no storefront surface renders and no cart line is priced from:
 * the admin changed a price, the console's own products list agreed with them,
 * and the shop did not move. Nothing errored, which is the worst version of it.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Whichever of the two the admin actually edited wins, and the other follows:
 *
 *   - base price edited  → every pack that was priced at the OLD base price
 *     moves to the new one. That is the tier the storefront leads with, so the
 *     edit shows up AND is what the shopper is charged.
 *   - a pack price edited → `basePrice` follows the leading pack, so the
 *     console's products list stops disagreeing with the shop.
 *   - both edited        → the pack wins. It is the more specific field and the
 *     only one a cart line is priced from; `basePrice` follows it.
 *
 * Products with no pack variants (Femi9's panties) are untouched: there
 * `basePrice` is the genuine price and has nothing to be reconciled against.
 */
function syncBasePriceWithPacks(args: {
  storedBasePrice: number
  storedVariants: { id: string; kind: string; price: number }[]
  input: ProductInput
}): { basePrice: number; repriceVariantIds: string[] } {
  const { storedBasePrice, storedVariants, input } = args

  const storedById = new Map(storedVariants.map((v) => [v.id, v]))
  const incomingPacks = input.variants.filter((v) => v.kind === 'pack')
  if (incomingPacks.length === 0) return { basePrice: input.basePrice, repriceVariantIds: [] }

  // The tiers that carried the old base price — what the storefront leads with.
  let leaders = incomingPacks.filter(
    (v) => v.id && storedById.get(v.id)?.price === storedBasePrice,
  )

  // RECOVERY for rows that have already drifted. A product whose base price
  // matches no tier got that way under the old behaviour — the field saved a
  // number nothing rendered — and it cannot heal itself, because the rule above
  // looks for a tier carrying the OLD base price and there is none. Left like
  // that, the very products an admin noticed were wrong would be the ones that
  // stayed wrong however many times they re-saved them.
  //
  // The storefront falls back to `defaultPack` for these, which is the SMALLEST
  // tier a diaper is sold in beyond the trial pack; here that is the smallest
  // pack that is not the smallest overall when there are three, i.e. the one a
  // shopper is shown by default. Picking the lowest packCount outright would
  // reprice a ₹49 trial pack, which is not the number anybody was editing.
  const drifted = leaders.length === 0
  if (drifted) {
    const byCount = [...incomingPacks].sort((a, b) => (a.packCount ?? 0) - (b.packCount ?? 0))
    const fallback = byCount.length > 2 ? byCount[1] : byCount[0]
    if (fallback?.id) leaders = [fallback]
  }

  const baseChanged = input.basePrice !== storedBasePrice
  const leaderPriceChanged = leaders.some(
    (v) => v.price !== storedById.get(v.id as string)?.price,
  )

  // A pack edit is the more specific statement, so it wins and base follows.
  if (leaderPriceChanged) {
    const winner = leaders.find((v) => v.price !== storedById.get(v.id as string)?.price)
    return { basePrice: winner?.price ?? input.basePrice, repriceVariantIds: [] }
  }

  // Base price edited: carry it onto the tier that mirrored it — including a
  // drifted product, where that is the whole point. This is the admin saying
  // "this is the price", so it becomes the charged one.
  if (baseChanged && leaders.length > 0) {
    return {
      basePrice: input.basePrice,
      repriceVariantIds: leaders.map((v) => v.id as string),
    }
  }

  // A drifted product saved WITHOUT touching the price heals the other way:
  // base follows the tier, so the console stops reporting a number nobody is
  // charged. Deliberately not a reprice — somebody editing stock or a
  // description must not move what a shopper pays as a side effect, and the
  // charged price is the one with real orders behind it.
  if (drifted && leaders.length > 0) {
    const leader = leaders[0]
    const price = leader.price ?? storedById.get(leader.id as string)?.price
    if (typeof price === 'number') return { basePrice: price, repriceVariantIds: [] }
  }

  return { basePrice: input.basePrice, repriceVariantIds: [] }
}

export async function updateProduct(brand: Brand, id: string, input: ProductInput) {
  const prisma = dbFor(brand)
  const slug = await resolveSlug(brand, input.slug || input.name, id)

  const existing = await prisma.productVariant.findMany({
    where: { productId: id },
    select: { id: true, kind: true, price: true },
  })
  const existingIds = new Set(existing.map((v) => v.id))
  const keptIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id as string))
  const toDelete = [...existingIds].filter((vid) => !keptIds.has(vid))

  const stored = await prisma.product.findUnique({ where: { id }, select: { basePrice: true } })
  const sync = syncBasePriceWithPacks({
    storedBasePrice: stored?.basePrice ?? input.basePrice,
    storedVariants: existing,
    input,
  })

  return prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        name: input.name,
        slug,
        type: input.type,
        // Reconciled with the pack tiers — see syncBasePriceWithPacks.
        basePrice: sync.basePrice,
        meta: input.meta,
        flow: input.flow,
        description: input.description,
        longDescription: input.longDescription || null,
        tag: input.tag || null,
        status: input.status,
      },
    })

    // Images: wipe + rewrite to honour the new order without a per-row diff.
    await tx.productImage.deleteMany({ where: { productId: id } })
    if (input.images.length) {
      await tx.productImage.createMany({
        data: input.images.map((url, i) => ({ productId: id, url, position: i })),
      })
    }

    // Features and specs: same wipe-and-rewrite as images, and for the same
    // reason (an ordered list, no stable client-side ids). Guarded on `!== undefined`
    // so a payload that omits them leaves published content untouched — see the
    // note on the schema fields.
    if (input.features !== undefined) {
      await tx.productFeature.deleteMany({ where: { productId: id } })
      if (input.features.length) {
        await tx.productFeature.createMany({
          data: input.features.map((f, i) => ({
            productId: id,
            title: f.title,
            body: f.body,
            position: i,
          })),
        })
      }
    }

    if (input.specs !== undefined) {
      await tx.productSpec.deleteMany({ where: { productId: id } })
      if (input.specs.length) {
        await tx.productSpec.createMany({
          data: input.specs.map((s, i) => ({
            productId: id,
            key: s.key,
            value: s.value,
            position: i,
          })),
        })
      }
    }

    if (toDelete.length) {
      await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } })
    }

    const reprice = new Set(sync.repriceVariantIds)
    for (const v of input.variants) {
      const data = cleanVariant(v)
      // A base-price edit is carried onto the tier that mirrored it, so the
      // number the admin typed is the number the shopper is charged.
      if (v.id && reprice.has(v.id)) data.price = sync.basePrice
      if (v.id && existingIds.has(v.id)) {
        await tx.productVariant.update({ where: { id: v.id }, data })
      } else {
        await tx.productVariant.create({ data: { ...data, productId: id } })
      }
    }

    return { id }
  })
}

/** Soft-delete: archived products drop out of the storefront (status filter). */
export async function archiveProduct(brand: Brand, id: string) {
  const prisma = dbFor(brand)
  return prisma.product.update({
    where: { id },
    data: { status: 'archived' },
    select: { id: true, status: true },
  })
}
