import 'server-only'
import { z } from 'zod'
import { prisma } from '@/lib/db'

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

export const ProductInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  // Blank slug => auto-derived from the name and made unique in the service.
  slug: z.string().trim().optional().default(''),
  type: z.enum(['pad', 'panty']),
  basePrice: z.coerce.number().int().min(0, 'Base price must be ≥ 0'),
  // meta/flow/description are NOT NULL in the schema; default '' keeps the form
  // forgiving while still writing a valid row.
  meta: z.string().trim().default(''),
  flow: z.string().trim().default(''),
  description: z.string().trim().default(''),
  longDescription: z.string().trim().optional().nullable(),
  tag: z.string().trim().optional().nullable(),
  status: z.enum(['active', 'draft', 'archived']).default('draft'),
  images: z.array(z.string().trim().min(1)).default([]),
  variants: z.array(VariantInput).default([]),
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
async function resolveSlug(source: string, excludeId?: string): Promise<string> {
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
export async function listAdminProducts() {
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
export async function getAdminProduct(id: string) {
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

export async function createProduct(input: ProductInput) {
  const slug = await resolveSlug(input.slug || input.name)

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
export async function updateProduct(id: string, input: ProductInput) {
  const slug = await resolveSlug(input.slug || input.name, id)

  const existing = await prisma.productVariant.findMany({
    where: { productId: id },
    select: { id: true },
  })
  const existingIds = new Set(existing.map((v) => v.id))
  const keptIds = new Set(input.variants.filter((v) => v.id).map((v) => v.id as string))
  const toDelete = [...existingIds].filter((vid) => !keptIds.has(vid))

  return prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
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
      },
    })

    // Images: wipe + rewrite to honour the new order without a per-row diff.
    await tx.productImage.deleteMany({ where: { productId: id } })
    if (input.images.length) {
      await tx.productImage.createMany({
        data: input.images.map((url, i) => ({ productId: id, url, position: i })),
      })
    }

    if (toDelete.length) {
      await tx.productVariant.deleteMany({ where: { id: { in: toDelete } } })
    }

    for (const v of input.variants) {
      const data = cleanVariant(v)
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
export async function archiveProduct(id: string) {
  return prisma.product.update({
    where: { id },
    data: { status: 'archived' },
    select: { id: true, status: true },
  })
}
