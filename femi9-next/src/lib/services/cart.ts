import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Cart service — the single seam between the database and the cart UI.
 *
 * Guest carts only for now (keyed by cookie token); auth-linked carts land in a
 * later phase. Line prices are ALWAYS recomputed here from `ProductVariant.price`
 * so a tampered client payload can never dictate what a shopper is charged.
 */

export interface CartItemDTO {
  variantId: string
  productSlug: string
  name: string
  variantLabel: string
  unitPrice: number
  qty: number
  lineTotal: number
  img: string
}

export interface CartDTO {
  items: CartItemDTO[]
  subtotal: number
  count: number
}

/** A guest with no cart row yet still gets a well-formed (empty) response. */
export const EMPTY_CART: CartDTO = { items: [], subtotal: 0, count: 0 }

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

/** Read the guest's cart as a UI-ready DTO. Missing cart → EMPTY_CART. */
export async function getCart(token: string): Promise<CartDTO> {
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

  const items: CartItemDTO[] = cart.items.map((item) => {
    const { variant } = item
    const { product } = variant
    const unitPrice = variant.price // server is the source of truth on price
    return {
      variantId: variant.id,
      productSlug: product.slug,
      name: product.name,
      variantLabel: variant.label,
      unitPrice,
      qty: item.qty,
      lineTotal: unitPrice * item.qty,
      img: product.images[0]?.url ?? '',
    }
  })

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0)
  const count = items.reduce((sum, i) => sum + i.qty, 0)
  return { items, subtotal, count }
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
