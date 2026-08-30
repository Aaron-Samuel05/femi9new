"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useCart } from "@/lib/cart";

/**
 * The server's price for the current basket, shared by the cart and the
 * checkout summary.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * Both screens used to do their own arithmetic out of `lib/catalog.ts`: a
 * hardcoded ₹999 free-shipping threshold and a ₹49 fee, duplicating a rule the
 * console can edit and the server actually applies. Checkout went further and
 * offered an "Express delivery ₹79" that was never sent to `/api/checkout`, so
 * the summary added ₹79 to a total Razorpay was then opened for without it.
 *
 * A number a shopper is shown and a number she is charged must come from one
 * calculation. `/api/checkout/quote` runs the same `shippingFor()` and the same
 * coupon predicate that `placeOrder` does; this hook is the only thing on the
 * client that knows what a basket costs.
 *
 * ── The coupon ──────────────────────────────────────────────────────────────
 * Held here rather than in either screen because the shopper enters it in the
 * cart and pays for it at checkout. It is NOT persisted: a code is worth what
 * the server says it is worth at the moment of placement, and a stale one
 * restored from storage on a later visit would put a discount on screen that
 * placement then refuses.
 */

export interface Quote {
  subtotal: number;
  discount: number;
  shipping: number;
  freeShipThreshold: number;
  total: number;
  couponCode: string | null;
  couponError: string | null;
}

interface QuoteState {
  /** Null until the first response lands — render a pending state, not a guess. */
  quote: Quote | null;
  /** True while a request is in flight, for the promo button. */
  loading: boolean;
  coupon: string;
  /** Submit a code (or "" to clear it) and re-quote. */
  applyCoupon: (code: string) => void;
  /** Re-quote after a cart mutation. */
  refresh: () => void;
}

const QuoteContext = createContext<QuoteState | null>(null);

export function QuoteProvider({
  children,
  /** Changes whenever the basket does, so a quote is never left stale. */
  cartVersion,
}: {
  children: React.ReactNode;
  cartVersion: string;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [coupon, setCoupon] = useState("");
  const [nonce, setNonce] = useState(0);
  // The request this provider is currently answering, and the one it last
  // answered. `loading` is DERIVED from the pair rather than being its own
  // state set at the top of the effect — a synchronous setState in an effect
  // body cascades a second render before the first has painted, and
  // react-hooks/set-state-in-effect (which CI runs) rejects it outright.
  const key = `${cartVersion}|${coupon}|${nonce}`;
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const loading = key !== resolvedKey;

  useEffect(() => {
    let cancelled = false;
    const url = coupon
      ? `/api/checkout/quote?coupon=${encodeURIComponent(coupon)}`
      : "/api/checkout/quote";
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<Quote>) : null))
      .then((body) => {
        if (cancelled) return;
        // On a failed request keep whatever we last knew: a summary that blanks
        // out on one dropped fetch is worse than a slightly stale one, and the
        // amount charged is recomputed server-side regardless.
        if (body) setQuote(body);
      })
      .catch(() => {})
      .finally(() => {
        // Marked resolved either way, so a failed request does not leave the
        // Apply button spinning forever.
        if (!cancelled) setResolvedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [key, coupon]);

  const applyCoupon = useCallback((code: string) => setCoupon(code.trim().toUpperCase()), []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo(
    () => ({ quote, loading, coupon, applyCoupon, refresh }),
    [quote, loading, coupon, applyCoupon, refresh],
  );
  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
}

export function useQuote(): QuoteState {
  const value = useContext(QuoteContext);
  if (!value) throw new Error("useQuote must be used inside <QuoteProvider>");
  return value;
}

/**
 * What the root layout mounts. The layout is a server component and cannot read
 * `useCart()`, so this thin client wrapper derives the basket signature and
 * hands it down — one place that knows a quote goes stale when a line changes.
 */
export function CartQuoteProvider({ children }: { children: React.ReactNode }) {
  const { lines } = useCart();
  // Quantities as well as ids: changing a quantity changes the subtotal, which
  // can cross the free-shipping threshold in either direction.
  const cartVersion = lines.map((l) => `${l.key}:${l.qty}`).join(",");
  return <QuoteProvider cartVersion={cartVersion}>{children}</QuoteProvider>;
}
