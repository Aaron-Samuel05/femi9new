import 'server-only'
import { prisma } from '@/lib/db'
import {
  applyZonePrice,
  resolveAmbientZone,
  zoneCustomPrice,
  type ResolvedZone,
} from '@/lib/services/pricing'

/**
 * Cart service — the single seam between the database and the cart UI.
 *
 * Guest carts only for now (keyed by cookie token); auth-linked carts land in a
 * later phase. Line prices are ALWAYS recomputed here from `ProductVariant.price`
 * so a tampered client payload can never dictate what a shopper is charged.
 *
 * Prices are then run through the visitor's regional PriceZone, because
 * `placeOrder` does the same on the way to Razorpay. When the cart skipped this
 * step it showed the standard price while the order charged the zone price, and
 * the shopper's Total changed under her at the payment sheet.
 */

export interface CartItemDTO {
  variantId: string
  productSlug: string
  name: string
  variantLabel: string
  /** Zone price — what this line is actually charged at. */
  unitPrice: number
  /** Standard (pre-zone) price, for showing what the discount struck through.
   *  A zone custom price is not guaranteed to be lower, so never render this as
   *  a strike-through without checking it is above `unitPrice`. */
  baseUnitPrice: number
  qty: number
  lineTotal: number
  img: string
}

export interface CartDTO {
  items: CartItemDTO[]
  subtotal: number
  /** Subtotal at standard prices; equals `subtotal` when no zone discount applies. */
  baseSubtotal: number
  count: number
  /** The zone these prices were computed at, for an honest line in the summary.
   *  Present only when the zone actually moved a price. `custom` is true when at
   *  least one line took an exact price the admin typed rather than the zone's
   *  percentage — in which case `discountPct` does not describe this cart and
   *  must not be printed as the reason. */
  zone: { name: string; discountPct: number; custom: boolean } | null
}

/** A guest with no cart row yet still gets a well-formed (empty) response. */
export const EMPTY_CART: CartDTO = {
  items: [],
  subtotal: 0,
  baseSubtotal: 0,
  count: 0,
  zone: null,
}

/** Thrown when a mutation references a variant that isn't sellable; the route
 *  layer maps this to a 400 rather than letting it become a generic 500. */
export class UnknownVariantError extends Error {
  constructor(variantId: string) {
    super(`Unknown or inactive variant: ${variantId}`)
    this.name = 'UnknownVariantError'
  }
}

/** Find the guest's cart, creating it on first write. Upsert keeps this safe
 *  against two concurrent add-to-cart requests racing to create the same row. */
export async function getOrCreateCart(token: string) {
  return prisma.cart.upsert({
    where: { guestToken: token },
    update: {},
    create: { guestToken: token },
  })
}

/**
 * Read the guest's cart as a UI-ready DTO. Missing cart → EMPTY_CART.
 *
 * `zone` is normally left out and resolved ambiently (saved address → edge geo
 * → default). Checkout passes it explicitly, because there the delivery address
 * being typed into the form is a stronger signal than anything we can infer.
 */
export async function getCart(token: string, zone?: ResolvedZone | null): Promise<CartDTO> {
  const appliedZone = zone === undefined ? await resolveAmbientZone() : zone
  const cart = await prisma.cart.findUnique({
    where: { guestToken: token },
    include: {
      items: {
        orderBy: { id: 'asc' }, // stable order for the line list
        include: {
          variant: {
            include: { product: { include: { images: { orderBy: { position: 'asc' }, take: 1 } } } },
          },
        },
      },
    },
  })
  if (!cart) return EMPTY_CART

  let anyCustom = false
  const items: CartItemDTO[] = cart.items.map((item) => {
    const { variant } = item
    const { product } = variant
    // Server is the source of truth on price: the catalogue row, then the zone —
    // the zone's custom price for THIS variant if the admin set one, else its
    // percentage. `placeOrder` prices the same line the same way.
    const baseUnitPrice = variant.price
    if (zoneCustomPrice(appliedZone, { variantId: variant.id }) !== null) anyCustom = true
    const unitPrice = applyZonePrice(baseUnitPrice, appliedZone, { variantId: variant.id })
    return {
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      variantLabel: variant.label,
      unitPrice,
      baseUnitPrice,
      qty: item.qty,
      lineTotal: unitPrice * item.qty,
      img: product.images[0]?.url ?? '',
    }
  })

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0)
  const baseSubtotal = items.reduce((sum, i) => sum + i.baseUnitPrice * i.qty, 0)
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  return {
    items,
    subtotal,
    baseSubtotal,
    count,
    // Only worth surfacing when it actually moved the price. Tested against the
    // totals, not against `discountPct`: a zone can move a price with a custom
    // price alone while its percentage is 0.
    zone: appliedZone && subtotal !== baseSubtotal
      ? { name: appliedZone.name, discountPct: appliedZone.discountPct, custom: anyCustom }
      : null,
  }
}

/** Add (or top up) a line. Adding a variant already in the cart increments it. */
export async function addItem(token: string, variantId: string, qty: number): Promise<CartDTO> {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } })
  if (!variant || !variant.active) throw new UnknownVariantError(variantId)

  const quantity = Math.max(1, Math.floor(qty))
  const cart = await getOrCreateCart(token)
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId } },
    update: { qty: { increment: quantity } },
    create: { cartId: cart.id, variantId, qty: quantity },
  })
  return getCart(token)
}

/** Set an exact quantity for a line; qty <= 0 removes it. Never creates a new
 *  line — a PATCH only touches something already in the cart. */
export async function setQty(token: string, variantId: string, qty: number): Promise<CartDTO> {
  const cart = await getOrCreateCart(token)
  if (qty <= 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } })
  } else {
    await prisma.cartItem.updateMany({
      where: { cartId: cart.id, variantId },
      data: { qty: Math.floor(qty) },
    })
  }
  return getCart(token)
}

/** Remove a line outright. */
export async function removeItem(token: string, variantId: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(token)
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id, variantId } })
  return getCart(token)
}

/**
 * Attach the browser's guest cart to the customer who just signed in. If that
 * customer already has another cart, merge every line into the browser cart and
 * delete the old row. Keeping the current guest token means the already-mounted
 * cart UI continues to work immediately after login while `userId` makes the
 * cart durable across future authenticated sessions.
 */
export async function mergeGuestCartIntoUser(token: string | null, userId: string): Promise<void> {
  if (!token) return

  await prisma.$transaction(async (tx) => {
    const guest = await tx.cart.findUnique({ where: { guestToken: token } })
    const owned = await tx.cart.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' } })

    if (!guest) return
    if (!owned || owned.id === guest.id) {
      await tx.cart.update({ where: { id: guest.id }, data: { userId } })
      return
    }

    const oldItems = await tx.cartItem.findMany({ where: { cartId: owned.id } })
    for (const item of oldItems) {
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: guest.id, variantId: item.variantId } },
        update: { qty: { increment: item.qty } },
        create: { cartId: guest.id, variantId: item.variantId, qty: item.qty },
      })
    }
    await tx.cart.delete({ where: { id: owned.id } })
    await tx.cart.update({ where: { id: guest.id }, data: { userId } })
  })
}
