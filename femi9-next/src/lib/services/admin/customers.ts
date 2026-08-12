import 'server-only'
import { Prisma, type OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Admin customers service — the read seam for the "who are our customers and
 * where are they from" module. Storefront users with role `customer` only;
 * staff/admin/affiliate/partner accounts are never surfaced here.
 *
 * Two money numbers matter and they intentionally differ:
 *  - orderCount is EVERY order the customer has placed (any status), because ops
 *    wants to see intent — a pile of pending/cancelled orders is a signal.
 *  - totalSpent / lifetimeSpend is REALISED revenue only (orders that reached a
 *    paid state), so a wall of unpaid orders never inflates what they've paid.
 * Points balance is the running sum of the PointsLedger deltas (earn − redeem).
 */

/** Order statuses that represent money actually collected. */
const REVENUE_STATUSES: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered']

const PAGE_SIZE = 20

export interface CustomerListItem {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  tier: string | null
  /** Primary address location — "where they're from". */
  city: string | null
  state: string | null
  orderCount: number
  totalSpent: number
  pointsBalance: number
}

export interface CustomerListResult {
  items: CustomerListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CustomerAddress {
  id: string
  label: string
  name: string
  line: string
  city: string
  state: string | null
  pincode: string | null
  phone: string | null
  isPrimary: boolean
}

export interface CustomerOrderRow {
  id: string
  orderNo: string
  status: OrderStatus
  total: number
  itemCount: number
  placedAt: Date
}

export interface CustomerPointsEntry {
  id: string
  delta: number
  reason: string
  balanceAfter: number
  createdAt: Date
}

export interface CustomerDetail {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  tier: string | null
  createdAt: Date
  /** Location surfaced from the primary address (falls back to any address). */
  city: string | null
  state: string | null
  addresses: CustomerAddress[]
  recentOrders: CustomerOrderRow[]
  points: CustomerPointsEntry[]
  orderCount: number
  lifetimeSpend: number
  pointsBalance: number
}

/**
 * Paginated customer list with per-row aggregates. We page the users first,
 * then fetch the order/points aggregates for only that page's ids via groupBy,
 * so the query cost stays flat regardless of how large the customer base grows.
 */
export async function listCustomers(
  opts: { q?: string; page?: number } = {},
): Promise<CustomerListResult> {
  const q = opts.q?.trim()
  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const skip = (page - 1) * PAGE_SIZE

  const where: Prisma.UserWhereInput = {
    role: 'customer',
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {}),
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        tier: true,
        // Primary address first (Postgres orders false < true, so desc = primary
        // on top); take one for the location column.
        addresses: {
          orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          take: 1,
          select: { city: true, state: true },
        },
      },
    }),
  ])

  const ids = users.map((u) => u.id)

  // Empty page → no aggregates to fetch. Skip the extra round-trips entirely.
  if (ids.length === 0) {
    return { items: [], total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
  }

  const [orderCounts, revenue, points] = await Promise.all([
    prisma.order.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: true }),
    prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, status: { in: REVENUE_STATUSES } },
      _sum: { total: true },
    }),
    prisma.pointsLedger.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _sum: { delta: true } }),
  ])

  const countMap = new Map(orderCounts.map((r) => [r.userId, r._count]))
  const spendMap = new Map(revenue.map((r) => [r.userId, r._sum.total ?? 0]))
  const pointsMap = new Map(points.map((r) => [r.userId, r._sum.delta ?? 0]))

  const items: CustomerListItem[] = users.map((u) => {
    const primary = u.addresses[0]
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      tier: u.tier,
      city: primary?.city ?? null,
      state: primary?.state ?? null,
      orderCount: countMap.get(u.id) ?? 0,
      totalSpent: spendMap.get(u.id) ?? 0,
      pointsBalance: pointsMap.get(u.id) ?? 0,
    }
  })

  return { items, total, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }
}

/**
 * Full customer profile: identity, all addresses, recent orders (with item
 * counts), recent points activity, and the same realised-revenue / points
 * totals used in the list. Returns null when the id isn't a customer, so the
 * caller renders a 404 rather than leaking staff/admin records.
 */
export async function getCustomer(id: string): Promise<CustomerDetail | null> {
  const [user, orderCount, revenue, pointsTotal] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        tier: true,
        role: true,
        createdAt: true,
        addresses: {
          orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
          select: {
            id: true,
            label: true,
            name: true,
            line: true,
            city: true,
            state: true,
            pincode: true,
            phone: true,
            isPrimary: true,
          },
        },
        orders: {
          orderBy: { placedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNo: true,
            status: true,
            total: true,
            placedAt: true,
            _count: { select: { items: true } },
          },
        },
        points: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, delta: true, reason: true, balanceAfter: true, createdAt: true },
        },
      },
    }),
    prisma.order.count({ where: { userId: id } }),
    prisma.order.aggregate({ where: { userId: id, status: { in: REVENUE_STATUSES } }, _sum: { total: true } }),
    prisma.pointsLedger.aggregate({ where: { userId: id }, _sum: { delta: true } }),
  ])

  if (!user || user.role !== 'customer') return null

  const primary = user.addresses[0]

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    tier: user.tier,
    createdAt: user.createdAt,
    city: primary?.city ?? null,
    state: primary?.state ?? null,
    addresses: user.addresses,
    recentOrders: user.orders.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      total: o.total,
      itemCount: o._count.items,
      placedAt: o.placedAt,
    })),
    points: user.points,
    orderCount,
    lifetimeSpend: revenue._sum.total ?? 0,
    pointsBalance: pointsTotal._sum.delta ?? 0,
  }
}

export async function adjustCustomerPoints(id: string, delta: number, reason: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: { id: true } })
    if (!user) return false
    const current = await tx.pointsLedger.aggregate({ where: { userId: id }, _sum: { delta: true } })
    await tx.pointsLedger.create({
      data: { userId: id, delta, reason: reason.trim(), balanceAfter: (current._sum.delta ?? 0) + delta },
    })
    return true
  })
}

export async function changeCustomerRole(id: string, role: import('@prisma/client').Role): Promise<boolean> {
  const result = await prisma.user.updateMany({ where: { id }, data: { role } })
  return result.count === 1
}
