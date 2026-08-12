import 'server-only'
import type { OrderStatus } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * Account read model — everything the storefront /account page renders for the
 * signed-in customer, resolved from real DB records keyed by userId.
 *
 * This service is presentation-shaped on purpose: it hands Account.tsx the exact
 * strings it draws (formatted dates, a composed city line, a display phone, the
 * points balance as a plain number) so the client component stays a dumb view and
 * no Date/enum ever has to cross the server→client boundary. That also keeps the
 * props serializable, which a Server Component → Client Component handoff requires.
 */

// ── View models (mirror what Account.tsx draws) ──────────────────────────────

export interface AccountUser {
  name: string
  initials: string
  email: string
  phone: string
  tier: string
  since: string
}

export interface AccountOrderItem {
  name: string
  qty: number
}

export interface AccountOrder {
  id: string // public orderNo, e.g. "FM-00042"
  date: string // "18 Jun 2026"
  items: AccountOrderItem[]
  total: number
  status: string // "Delivered" | "Paid" | … (lowercased in the badge class)
}

export interface AccountAddress {
  id: string
  label: string
  name: string
  line: string
  city: string // composed "City, State 600001" line
  phone: string
  primary: boolean
}

export interface AccountSubscription {
  id: string // subscription id — the account page's Pause/Skip/Cancel controls PATCH by it
  product: string
  qty: number
  frequency: string
  nextDelivery: string
  saved: number
}

export interface SpendTrend {
  labels: string[]
  values: number[]
}

export interface ActivityItem {
  label: string
  date: string
  pts: string
}

export interface AccountData {
  user: AccountUser
  pointsBalance: number
  addresses: AccountAddress[]
  orders: AccountOrder[]
  subscription: AccountSubscription | null
  spendTrend: SpendTrend
  activity: ActivityItem[]
}

// ── Formatting helpers ───────────────────────────────────────────────────────

// Built from parts (not a single format() call) so the output is a guaranteed
// "18 Jun 2026" regardless of the locale's default separators/ordering.
const DMY = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
function fmtDate(d: Date): string {
  const parts = DMY.formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}

const MY = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
function fmtMonthYear(d: Date): string {
  return MY.format(d)
}

/** Two-letter avatar initials from the name, falling back to the email, then F9. */
function initialsOf(name: string | null, email: string | null): string {
  const src = (name ?? '').trim()
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean)
    const first = parts[0]?.[0] ?? ''
    const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? ''
    return (first + second).toUpperCase() || 'F9'
  }
  if (email) return email[0].toUpperCase()
  return 'F9'
}

/** National number → "+91 98842 30571"; a dash when we have no phone at all. */
function fmtPhone(phone: string | null): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  const n = digits.length > 10 ? digits.slice(-10) : digits
  return n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : `+91 ${n}`
}

/** enum 'delivered' → 'Delivered'. The badge class is derived from this lowercased,
 *  so delivered/shipped/processing pick up their existing colours and any other
 *  status falls back to the neutral base .badge (still legible). */
function statusLabel(s: OrderStatus): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Address → the single "City, State pincode" line Account renders under `line`. */
function composeCity(a: { city: string; state: string | null; pincode: string | null }): string {
  const cityState = [a.city, a.state].filter(Boolean).join(', ')
  return a.pincode ? `${cityState} ${a.pincode}` : cityState
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Bucket order totals into the trailing 6 calendar months for the spend chart.
 *  Computed server-side (fixed month labels, no locale/timezone drift) so the
 *  client component never re-derives dates and can't hydrate-mismatch. */
function buildSpendTrend(rows: { placedAt: Date; total: number }[]): SpendTrend {
  const now = new Date()
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], total: 0 }
  })
  const byKey = new Map(buckets.map((b) => [b.key, b]))
  for (const r of rows) {
    const b = byKey.get(`${r.placedAt.getFullYear()}-${r.placedAt.getMonth()}`)
    if (b) b.total += r.total
  }
  return { labels: buckets.map((b) => b.label), values: buckets.map((b) => b.total) }
}

// ── The read ─────────────────────────────────────────────────────────────────

/**
 * Load the account dashboard for `userId`. Returns null when the id doesn't
 * resolve to a user — the token can be valid yet the record gone — so the caller
 * can bounce to /login rather than render a half-empty page.
 */
export async function getAccountData(userId: string): Promise<AccountData | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  // One round-trip's worth of independent reads, run together.
  const [ordersRaw, addressesRaw, pointsAgg, recentPoints, sub] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: 'desc' },
      include: { items: { orderBy: { id: 'asc' } } },
    }),
    prisma.address.findMany({
      where: { userId },
      // Primary first, then stable by id, matching the "Home"/"Work" ordering.
      orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
    }),
    // Running balance == sum of every ledger delta (same source of truth the
    // checkout award path and the redeem path use).
    prisma.pointsLedger.aggregate({ where: { userId }, _sum: { delta: true } }),
    prisma.pointsLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 4 }),
    prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      include: { variant: { include: { product: { select: { name: true } } } }, cadence: true },
    }),
  ])

  const orders: AccountOrder[] = ordersRaw.map((o) => ({
    id: o.orderNo,
    date: fmtDate(o.placedAt),
    items: o.items.map((it) => ({ name: it.productName, qty: it.qty })),
    total: o.total,
    status: statusLabel(o.status),
  }))

  const addresses: AccountAddress[] = addressesRaw.map((a) => ({
    id: a.id,
    label: a.label,
    name: a.name,
    line: a.line,
    city: composeCity(a),
    phone: fmtPhone(a.phone),
    primary: a.isPrimary,
  }))

  const activity: ActivityItem[] = recentPoints.map((p) => ({
    label: p.reason,
    date: fmtDate(p.createdAt),
    pts: `${p.delta >= 0 ? '+' : '-'}${Math.abs(p.delta).toLocaleString('en-IN')}`,
  }))

  const subscription: AccountSubscription | null = sub
    ? {
        id: sub.id,
        product: sub.variant.product.name,
        qty: sub.qty,
        frequency: sub.cadence.label,
        nextDelivery: fmtDate(sub.nextDeliveryAt),
        saved: sub.savedTotal,
      }
    : null

  return {
    user: {
      name: user.name ?? 'Femi9 member',
      initials: initialsOf(user.name, user.email),
      email: user.email ?? '—',
      phone: fmtPhone(user.phone),
      tier: user.tier ?? 'Bloom member',
      since: fmtMonthYear(user.createdAt),
    },
    pointsBalance: pointsAgg._sum.delta ?? 0,
    addresses,
    orders,
    subscription,
    spendTrend: buildSpendTrend(ordersRaw.map((o) => ({ placedAt: o.placedAt, total: o.total }))),
    activity,
  }
}

export interface AddressInput {
  label: string
  name: string
  line: string
  city: string
  state?: string
  pincode?: string
  phone?: string
  isPrimary?: boolean
}

export async function updateProfile(userId: string, input: { name: string }) {
  const result = await prisma.user.updateMany({
    where: { id: userId },
    data: { name: input.name.trim() },
  })
  return result.count > 0
}

export async function createAddress(userId: string, input: AddressInput) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { userId } })
    const makePrimary = input.isPrimary === true || count === 0
    if (makePrimary) await tx.address.updateMany({ where: { userId }, data: { isPrimary: false } })
    return tx.address.create({
      data: {
        userId,
        label: input.label.trim(),
        name: input.name.trim(),
        line: input.line.trim(),
        city: input.city.trim(),
        state: input.state?.trim() || null,
        pincode: input.pincode?.trim() || null,
        phone: input.phone?.trim() || null,
        isPrimary: makePrimary,
      },
    })
  })
}

export async function updateAddress(userId: string, id: string, input: Partial<AddressInput>) {
  return prisma.$transaction(async (tx) => {
    const exists = await tx.address.findFirst({ where: { id, userId }, select: { id: true } })
    if (!exists) return null
    if (input.isPrimary) await tx.address.updateMany({ where: { userId }, data: { isPrimary: false } })
    return tx.address.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label.trim() } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.line !== undefined ? { line: input.line.trim() } : {}),
        ...(input.city !== undefined ? { city: input.city.trim() } : {}),
        ...(input.state !== undefined ? { state: input.state.trim() || null } : {}),
        ...(input.pincode !== undefined ? { pincode: input.pincode.trim() || null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() || null } : {}),
        ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
      },
    })
  })
}

export async function deleteAddress(userId: string, id: string): Promise<'deleted' | 'missing' | 'in-use'> {
  return prisma.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id, userId },
      select: { id: true, isPrimary: true, _count: { select: { orders: true } } },
    })
    if (!address) return 'missing'
    if (address._count.orders > 0) return 'in-use'
    await tx.address.delete({ where: { id } })
    if (address.isPrimary) {
      const next = await tx.address.findFirst({ where: { userId }, orderBy: { id: 'asc' }, select: { id: true } })
      if (next) await tx.address.update({ where: { id: next.id }, data: { isPrimary: true } })
    }
    return 'deleted'
  })
}
