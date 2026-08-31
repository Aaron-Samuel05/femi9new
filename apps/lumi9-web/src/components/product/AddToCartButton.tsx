"use client";

import { useAddToCart } from "@/lib/use-add-to-cart";

/**
 * The self-drawing tick.
 *
 * `pathLength="22"` normalises the geometry so the dash values in `globals.css`
 * are the same number whatever the icon is scaled to - without it the dash
 * would have to be re-measured for every size this appears at.
 */
export function AddedCheck({ size = 20 }: { size?: number }) {
  return (
    <svg
      className="a2c-check"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 13l4 4L19 7" pathLength={22} />
    </svg>
  );
}

/** The ring shown while a slow write is in flight. */
function Spinner({ size = 18 }: { size?: number }) {
  return (
    <span
      className="animate-ring inline-block rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

/**
 * The primary add-to-cart CTA - the PDP buy button and the size finder's.
 *
 * Both used to be plain `<button onClick={() => add(...)}>` with no state
 * whatsoever: pressed, and the button sat inert while the request ran. The only
 * thing that moved was the drawer, which on a slow connection arrives well
 * after the shopper has decided the click missed.
 *
 * `children` is the idle label - usually a price, which is why the layers are
 * stacked rather than swapped in place: "Add to cart - ₹1,299" and "Added" are
 * very different widths, and a CTA that resizes mid-press drags the layout
 * under it.
 */
export function AddToCartButton({
  onAdd,
  children,
  addedLabel = "Added to your bag",
  className = "",
}: {
  /** Resolves true when the line actually reached the server. */
  onAdd: () => Promise<boolean>;
  children: React.ReactNode;
  addedLabel?: string;
  className?: string;
}) {
  const { state, busy, run } = useAddToCart(onAdd);

  return (
    <button
      type="button"
      data-a2c={state}
      onClick={() => void run()}
      // Disabled from the FIRST frame, before the pending visual is armed -
      // that is what stops a double-tap adding two, and it is also why the
      // spinner can afford to wait.
      disabled={busy}
      aria-busy={busy}
      /* `.btn:disabled` dims to 0.5 and shows `not-allowed`, which is the right
         treatment for a control you may not use and the wrong one for a control
         that is working. Tailwind's utilities layer beats the components layer,
         so these two win over it without touching the shared rule. */
      className={`a2c disabled:cursor-wait disabled:opacity-100 ${className}`}
    >
      <span className="a2c-label flex items-center gap-2" data-on={state === "idle"}>
        {children}
      </span>

      <span className="flex items-center" data-on={state === "pending"}>
        <Spinner />
      </span>

      <span className="a2c-done flex items-center gap-2" data-on={state === "added"}>
        <AddedCheck />
        {addedLabel}
      </span>

      {/* The animation is visual only. This is what a screen reader is told,
          and it is announced once the write has actually succeeded - never on
          the press. */}
      <span className="sr-only" aria-live="polite">
        {state === "added" ? addedLabel : ""}
      </span>
    </button>
  );
}
