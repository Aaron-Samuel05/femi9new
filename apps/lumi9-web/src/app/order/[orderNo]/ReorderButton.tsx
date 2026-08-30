"use client";

import { useCart } from "@/lib/cart";
import { Icon } from "@/components/ui/Icon";

/**
 * "Order these again", from the order page.
 *
 * The variant ids come off the ORDER, so this puts back exactly what was
 * bought rather than parsing "54 pcs" out of a title and hoping the catalogue
 * still has that pack. A size retired since is simply not re-added — silently
 * substituting a neighbouring one is how a shopper ends up with the wrong
 * nappies for her baby.
 *
 * `addMany` is sequential and opens the drawer, so the basket that appears is
 * the one the server holds and the shopper can see it happen.
 */
export function ReorderButton({ items }: { items: { variantId: string; qty: number }[] }) {
  const { addMany } = useCart();

  return (
    <button
      type="button"
      onClick={() => void addMany(items)}
      className="btn btn-dark btn-sm py-3.25 font-bold"
    >
      <Icon name="cart" size={16} strokeWidth={1.8} />
      Order these again
    </button>
  );
}
