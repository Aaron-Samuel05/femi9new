"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { inr, packImage, type SizeCode } from "@/lib/catalog";
import { useCatalogData, type CatalogData } from "@/lib/catalog-context";

/**
 * The cart — now a real one, on the server.
 *
 * It used to be a module-level store over localStorage, keyed by
 * `${size}-${count}` because there was nothing else to key it by. Lines now live
 * in the `lumi9` schema against a guest token in an httpOnly cookie, through the
 * same cart service Femi9 uses: the same stock checks, the same zone pricing.
 *
 * Two consequences worth knowing:
 *  - **The server prices the cart.** `unitPrice` comes back from the API, which
 *    resolved it against the visitor's price zone. Nothing here multiplies a
 *    price out of the catalogue any more, because the catalogue price is the
 *    standard one and need not be what this shopper is charged.
 *  - **A line's key is its variant id.** Callers treat it as opaque and pass it
 *    straight back to increment/decrement/remove, so nothing outside this file
 *    changed.
 */

export type CartLine = {
  /** The variant id. Opaque to callers. */
  key: string;
  size: SizeCode;
  count: number;
  qty: number;
};

export type ResolvedLine = CartLine & {
  name: string;
  fits: string;
  /** What THIS shopper is charged — zone-resolved by the server. */
  price: number;
  lineTotal: number;
  image: string;
};

/** The server's cart shape, as `@femi9/core/services/cart` returns it. */
interface CartItemDTO {
  variantId: string;
  productSlug: string;
  name: string;
  variantLabel: string;
  unitPrice: number;
  baseUnitPrice: number;
  qty: number;
  lineTotal: number;
  img: string;
}

interface CartDTO {
  items: CartItemDTO[];
  subtotal: number;
  baseSubtotal: number;
  count: number;
  zone: { name: string; discountPct: number; custom: boolean } | null;
}

const EMPTY: CartDTO = { items: [], subtotal: 0, baseSubtotal: 0, count: 0, zone: null };

/*
 * The localStorage "last order" store that lived here is gone.
 *
 * It cached a PlacedOrder — lines, subtotal, shipping, and a `delivery:
 * "standard" | "express"` — so the confirmation screen could render without a
 * round trip, back when checkout was local. Checkout is real now: the
 * confirmation page reads the order from the database, authorised by the
 * capability token in `?t=`, and nothing has read `lastOrder` since. Leaving it
 * meant the app still carried a client-side notion of an express delivery tier
 * that the server has never had, waiting to be wired to something.
 */

// ───────────────────────────────── context ─────────────────────────────────

interface CartState {
  cart: CartDTO;
  /** False until the first fetch resolves, so SSR and first paint agree. */
  ready: boolean;
  setCart: (next: CartDTO) => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartDTO>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // One fetch for the whole tree — the nav badge and the cart page read the
    // same state rather than each asking the server.
    fetch("/api/cart", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<CartDTO>) : EMPTY))
      .catch(() => EMPTY)
      .then((data) => {
        if (cancelled) return;
        setCart(data ?? EMPTY);
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ cart, ready, setCart }), [cart, ready]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function useCartState(): CartState {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  return value;
}

// ───────────────────────────── line resolution ─────────────────────────────

/**
 * Join a server line to the catalogue for the things the server does not carry:
 * the size code and its fit copy, and the pack photo.
 *
 * Falls back to the server's own name and image when a variant is not in the
 * catalogue — a line for a product retired mid-session must still render, and
 * showing it wrongly is better than crashing the basket.
 */
function toResolved(catalog: CatalogData, item: CartItemDTO): ResolvedLine {
  const size = catalog.sizes.find((s) => s.packs.some((p) => p.variantId === item.variantId));
  const pack = size?.packs.find((p) => p.variantId === item.variantId);
  return {
    key: item.variantId,
    size: (size?.size ?? "M") as SizeCode,
    count: pack?.count ?? 0,
    qty: item.qty,
    name: size?.name ?? item.name,
    fits: size?.fits ?? item.variantLabel,
    price: item.unitPrice,
    lineTotal: item.lineTotal,
    image: size && pack ? packImage(size.size, pack.count) : item.img,
  };
}

/** Kept for the confirmation screen, which resolves lines from a stored order. */
export function resolveLine(catalog: CatalogData, line: CartLine): ResolvedLine {
  const size = catalog.getSizeOrDefault(line.size);
  const pack = size.packs.find((p) => p.count === line.count) ?? size.packs[size.packs.length - 1]!;
  return {
    ...line,
    name: size.name,
    fits: size.fits,
    price: pack.price,
    lineTotal: pack.price * line.qty,
    image: packImage(size.size, pack.count),
  };
}

// ─────────────────────────────────── hook ──────────────────────────────────

export function useCart() {
  const catalog = useCatalogData();
  const { cart, ready, setCart } = useCartState();

  /** Every mutation returns the WHOLE cart, so the server stays authoritative
   *  and nothing here has to guess what a write did to the totals. */
  const send = useCallback(
    async (path: string, init: RequestInit) => {
      try {
        const res = await fetch(path, { ...init, cache: "no-store" });
        if (!res.ok) return;
        setCart((await res.json()) as CartDTO);
      } catch {
        // Offline or a dropped request: leave the cart as it was rather than
        // showing a basket that disagrees with the server.
      }
    },
    [setCart],
  );

  const add = useCallback(
    async (size: SizeCode, packCount: number, qty = 1) => {
      const entry = catalog.getSize(size);
      const pack = entry?.packs.find((p) => p.count === packCount);
      // No variant means the catalogue moved under us; adding nothing is the
      // honest outcome.
      if (!pack) return;
      await send("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: pack.variantId, qty }),
      });
    },
    [catalog, send],
  );

  /** Add an exact variant. "Buy again" knows the id the order was placed with,
   *  so it should not have to find it back through size and pack count. */
  const addVariant = useCallback(
    async (variantId: string, qty = 1) => {
      await send("/api/cart", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId, qty }),
      });
    },
    [send],
  );

  const setQty = useCallback(
    async (key: string, qty: number) => {
      await send(`/api/cart/items/${key}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qty }),
      });
    },
    [send],
  );

  const qtyOf = useCallback(
    (key: string) => cart.items.find((i) => i.variantId === key)?.qty ?? 0,
    [cart],
  );

  const increment = useCallback((key: string) => setQty(key, qtyOf(key) + 1), [setQty, qtyOf]);
  // Floors at 1: removing is a separate, deliberate action.
  const decrement = useCallback(
    (key: string) => setQty(key, Math.max(1, qtyOf(key) - 1)),
    [setQty, qtyOf],
  );

  const remove = useCallback(
    async (key: string) => {
      await send(`/api/cart/items/${key}`, { method: "DELETE" });
    },
    [send],
  );

  const clear = useCallback(async () => {
    await Promise.all(
      cart.items.map((item) =>
        fetch(`/api/cart/items/${item.variantId}`, { method: "DELETE", cache: "no-store" }),
      ),
    );
    setCart(EMPTY);
  }, [cart, setCart]);

  const lines = useMemo(
    () => cart.items.map((item) => toResolved(catalog, item)),
    [catalog, cart],
  );

  const subtotal = cart.subtotal;

  return {
    ready,
    lines,
    count: cart.count,
    subtotal,
    /* No `shipping` or `total` here on purpose. Both used to be computed from
       a threshold hardcoded in this bundle, while the server priced the order
       from editable Settings — two calculations for one number. `useQuote()`
       in lib/quote.tsx asks the server, and is the only source of either. */
    /** The zone that priced this cart, when it moved a price. Null otherwise. */
    zone: cart.zone,
    add,
    addVariant,
    increment,
    decrement,
    remove,
    clear,
  };
}

/** Re-exported so the summary can format without importing the catalogue. */
export { inr };
