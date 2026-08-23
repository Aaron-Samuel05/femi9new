import 'server-only'
import type { Prisma, SubscriptionStatus } from '@prisma/client'
import { dbFor, type Brand } from '@femi9/db'

/**
 * Admin subscriptions service — the read side for the Ops console's subscription
 * table. One list read, shaped for the table (customer + product + cadence +
 * next-delivery), with an optional status filter for the chips.
 *
 * Read-only on purpose: subscription state is owned by the customer (pause / skip
 * / cancel via services/subscriptions.ts). Ops only observes the plans here.
 */

// Source of truth for the filter chips + the filter guard. Matches the
// SubscriptionStatus enum in schema.prisma exactly.
export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const

/** True when `s` is a real SubscriptionStatus — guards the URL-supplied filter. */
function isStatus(s: string): s is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(s)
}

/** One row in the admin subscriptions table. */
export interface AdminSubscriptionRow {
  id: string
  customerName: string
  customerContact: string | null // phone, falling back to email
  product: string
  variantLabel: string
  qty: number
  frequency: string // cadence.label
  nextDelivery: Date // formatted by the (server-component) page
  status: SubscriptionStatus
  savedTotal: number
}

/**
 * All subscriptions (optionally filtered by status), ordered by the soonest next
 * delivery so the ops team sees what's shipping next at the top.
 */
export async function listSubscriptions(brand: Brand, {
  status,
}: { status?: string } = {}): Promise<AdminSubscriptionRow[]> {
  const prisma = dbFor(brand)
  try {
    const where: Prisma.SubscriptionWhereInput = {}
    // Silently ignore an unknown status so a stale/hand-edited URL never 500s.
    if (status && isStatus(status)) where.status = status

    const rows = await prisma.subscription.findMany({
      where,
      orderBy: { nextDeliveryAt: 'asc' },
      include: {
        user: { select: { name: true, phone: true, email: true } },
        variant: { include: { product: { select: { name: true } } } },
        cadence: { select: { label: true } },
      },
    })

    return rows.map((r) => ({
      id: r.id,
      customerName: r.user?.name ?? 'Member',
      customerContact: r.user?.phone ?? r.user?.email ?? null,
      product: r.variant.product.name,
      variantLabel: r.variant.label,
      qty: r.qty,
      frequency: r.cadence.label,
      nextDelivery: r.nextDeliveryAt,
      status: r.status,
      savedTotal: r.savedTotal,
    }))
  } catch {
    return []
  }
}
