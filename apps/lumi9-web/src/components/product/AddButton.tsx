"use client";

import { useCart } from "@/lib/cart";
import { useAddToCart } from "@/lib/use-add-to-cart";
import { AddedCheck } from "@/components/product/AddToCartButton";
import type { SizeCode } from "@/lib/catalog";

/**
 * The round add-to-cart control on the product cards.
 *
 * It used to render `{added ? "✓" : "+"}` and flip between them with no
 * transition — an instant character swap, between two glyphs of different width
 * and weight, inside a 44px circle where that jump is very visible. It also set
 * `added` in the click handler, so the tick appeared before the request had
 * been made and stayed there even when the write failed.
 *
 * Now: the plus rotates out as the tick draws itself in, the write is awaited,
 * and a failure returns the button to a plus rather than congratulating the
 * shopper on nothing. The circle never changes size — both layers occupy the
 * same grid cell, which matters here because these sit in a card row beside a
 * price.
 */
export function AddButton({
  size,
  count,
  label,
}: {
  size: SizeCode;
  count: number;
  label: string;
}) {
  const { add } = useCart();
  const { state, busy, run } = useAddToCart(() => add(size, count));

  return (
    <button
      type="button"
      // The label is the STABLE one. Retitling the control to "Added" mid-press
      // means a screen-reader user who tabs back to it is told the button is
      // called something it will not be called a second later; the live region
      // below is where the outcome belongs.
      aria-label={label}
      data-a2c={state}
      onClick={() => void run()}
      disabled={busy}
      aria-busy={busy}
      className="a2c size-11 shrink-0 cursor-pointer rounded-full bg-midnight text-xl font-semibold text-butter transition-colors hover:bg-[#171a03] disabled:cursor-default disabled:opacity-100"
    >
      {/* Pending deliberately has no separate layer here: at 44px a ring inside
          a circle reads as a second, smaller button. The plus recedes instead
          (see `[data-a2c="pending"] .a2c-plus`), which says "working" without
          adding a shape — and the control is unclickable while it does. */}
      <span className="a2c-plus leading-none" data-on={state !== "added"} aria-hidden>
        +
      </span>
      <span className="a2c-done leading-none" data-on={state === "added"}>
        <AddedCheck size={18} />
      </span>
      <span className="sr-only" aria-live="polite">
        {state === "added" ? `${label} — added to your bag` : ""}
      </span>
    </button>
  );
}
