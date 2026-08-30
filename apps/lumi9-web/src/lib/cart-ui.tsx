"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

/**
 * Cart *chrome* state: is the drawer open, and what did the last write say.
 *
 * Deliberately a SEPARATE context from `lib/cart.tsx`.
 *
 * Femi9 keeps both in one reducer, which is fine there because almost nothing
 * subscribes to its cart. Here `useCart()` is read by the quote provider, the
 * checkout form and the nav badge, and every one of them would re-render on a
 * drawer toggle or a toast timer if the two lived together. Splitting them also
 * makes the dependency direction honest: the cart calls the chrome (open me,
 * say this), the chrome never calls the cart.
 *
 * Mounted ABOVE <CartProvider> in the root layout for exactly that reason.
 */

export interface CartToast {
  msg: string;
  tone: "ok" | "error";
  /** Bumped on every notify so a repeated message still re-fires the timer. */
  id: number;
}

interface CartUiState {
  open: boolean;
  openCart: () => void;
  closeCart: () => void;
  toast: CartToast | null;
  notify: (msg: string, tone?: CartToast["tone"]) => void;
}

const CartUiContext = createContext<CartUiState | null>(null);

export function CartUIProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<CartToast | null>(null);
  // A ref rather than derived from `toast`, so `notify` never has to depend on
  // the value it sets — a changing identity would re-run every consumer's
  // memo on each message.
  const seq = useRef(0);

  const openCart = useCallback(() => setOpen(true), []);
  const closeCart = useCallback(() => setOpen(false), []);
  const notify = useCallback((msg: string, tone: CartToast["tone"] = "ok") => {
    seq.current += 1;
    setToast({ msg, tone, id: seq.current });
  }, []);

  const value = useMemo(
    () => ({ open, openCart, closeCart, toast, notify }),
    [open, openCart, closeCart, toast, notify],
  );

  return <CartUiContext.Provider value={value}>{children}</CartUiContext.Provider>;
}

export function useCartUI(): CartUiState {
  const value = useContext(CartUiContext);
  if (!value) throw new Error("useCartUI must be used inside <CartUIProvider>");
  return value;
}
