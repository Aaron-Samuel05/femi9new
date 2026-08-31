"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useCartUI } from "@/lib/cart-ui";

/**
 * One transient line of feedback for cart writes.
 *
 * It exists because failures were invisible. `send()` in `lib/cart.tsx` caught
 * every error and returned, so a 500 on "Add to cart", a dropped request on a
 * quantity change and a successful write were all the same thing from the
 * shopper's side: nothing moved. The drawer covers the success case; this
 * covers the other one, and it is why `notify` carries a tone.
 *
 * `role="status"` with `aria-live="polite"` rather than an alert: this is
 * confirmation, not an interruption, and it must never steal focus from the
 * control that was just pressed.
 */
export function Toast() {
  const { toast } = useCartUI();
  /*
   * Visibility is DERIVED, not its own state set at the top of an effect.
   *
   * The obvious shape - `setVisible(true)` in the effect body - cascades a
   * second render before the first has painted, and `react-hooks/
   * set-state-in-effect` (which CI runs) rejects it outright. Holding the id of
   * the last message to time out inverts it: a toast is visible until its own
   * timer retires it, and the only setState left is inside that callback, which
   * is exactly where an effect is supposed to put one.
   */
  const [dismissedId, setDismissedId] = useState(0);
  const visible = toast !== null && toast.id !== dismissedId;

  useEffect(() => {
    if (!toast) return;
    const { id } = toast;
    const timer = setTimeout(() => setDismissedId(id), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const error = toast?.tone === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`px-safe pointer-events-none fixed inset-x-0 bottom-[max(18px,env(safe-area-inset-bottom))] z-130 flex justify-center transition-[opacity,transform] duration-300 ease-[var(--ease-reveal)] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      <div
        className={`flex max-w-[min(92vw,420px)] items-center gap-2.5 rounded-pill px-4.5 py-3 text-[14px] font-semibold shadow-lift ${
          error ? "bg-[#7a1f26] text-white" : "bg-midnight text-butter"
        }`}
      >
        <Icon name={error ? "alert" : "check"} size={17} strokeWidth={2} />
        {/* The message stays mounted between toasts so the exit transition has
            something to animate; an empty string is rendered while idle. */}
        <span>{toast?.msg ?? ""}</span>
      </div>
    </div>
  );
}
