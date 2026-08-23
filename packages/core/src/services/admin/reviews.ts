import 'server-only'
import { Prisma } from '@prisma/client'
import type { ModerationStatus } from '@prisma/client'
import { dbFor, type Brand } from '@femi9/db'

/**
 * Admin reviews service — the moderation-side counterpart to the storefront read
 * path (which only ever surfaces `approved` reviews). Moderators see EVERY row
 * regardless of status so pending submissions can be triaged and abusive ones
 * hidden or removed.
 *
 * Rows are shaped for the client here (product name flattened in, `createdAt`
 * serialised to an ISO string) so the moderation queue — a client component —
 * can consume them straight from JSON without touching this `server-only` module.
 */

export type ReviewRow = {
  id: string
  productId: string
  productName: string
  name: string
  place: string | null
  rating: number
  /** Optional headline. Shown here because a moderator approves everything that
   *  will publish, and the title publishes above the body. */
  title: string | null
  body: string
  status: ModerationStatus
  createdAt: string // ISO 8601 — Dates aren't JSON-serialisable to the client.
}

// The exact query payload, so `toRow` stays type-checked against the include.
type ReviewWithProduct = Prisma.ReviewGetPayload<{
  include: { product: { select: { name: true } } }
}>

function toRow(r: ReviewWithProduct): ReviewRow {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    name: r.name,
    place: r.place,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }
}

// ─────────────────────────────── Reads ──────────────────────────────────

/** All reviews (optionally filtered by status), newest first, with product name. */
export async function listReviews(brand: Brand, {
  status,
}: { status?: ModerationStatus } = {}): Promise<ReviewRow[]> {
  const prisma = dbFor(brand)
  try {
    const rows = await prisma.review.findMany({
      // Omit the filter entirely when no status is given so the query planner sees
      // a plain "all rows" read rather than `status IN (…)`.
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true } } },
    })

    return rows.map(toRow)
  } catch {
    return []
  }
}

// ─────────────────────────────── Writes ─────────────────────────────────

/**
 * Set a review's moderation status. Returns the reconciled row so the queue can
 * update in place, or null when the id no longer exists (P2025 → 404 upstream).
 */
export async function setReviewStatus(brand: Brand, 
  id: string,
  status: ModerationStatus,
): Promise<ReviewRow | null> {
  const prisma = dbFor(brand)
  try {
    const r = await prisma.review.update({
      where: { id },
      data: { status },
      include: { product: { select: { name: true } } },
    })
    return toRow(r)
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null
    throw err
  }
}

/** Hard-delete a review. Returns null when the row is already gone (P2025). */
export async function deleteReview(brand: Brand, id: string): Promise<{ id: string } | null> {
  const prisma = dbFor(brand)
  try {
    await prisma.review.delete({ where: { id } })
    return { id }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') return null
    throw err
  }
}
