"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  inr,
  packImage,
  standardShipping,
  EXPRESS_SHIPPING_FEE,
  type SizeCode,
} from "@/lib/catalog";
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
 *
 * `lastOrder` is still localStorage. Checkout has not moved yet — that is the
 * next slice — and a confirmation screen that forgets on refresh is worse than
 * one backed by a value we are about to replace.
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

export type PlacedOrder = {
  id: string;
  lines: CartLine[];
  subtotal: number;
  shipping: number;
  total: number;
  delivery: "standard" | "express";
  eta: string;
  shipTo: string;
  firstName: string;
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

const ORDER_KEY = "lumi9.lastOrder.v1";

// ─────────────────────────── last order (local) ────────────────────────────

function readOrder(): PlacedOrder | null {
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    return raw ? (JSON.parse(raw) as PlacedOrder) : null;
  } catch {
    return null;
  }
}

function writeOrder(order: PlacedOrder | null) {
  try {
    if (order) window.localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    else window.localStorage.removeItem(ORDER_KEY);
  } catch {
    /* private mode, or storage disabled */
  }
}

/**
 * The last order is read through an external store rather than pulled into
 * state by an effect.
 *
 * localStorage is not available while rendering on the server, so it cannot be
 * a lazy `useState` initialiser without a hydration mismatch — and setting it
 * synchronously inside an effect causes a cascading render. `useSyncExternalStore`
 * is the shape React provides for exactly this: a server snapshot of null, a
 * client snapshot read once and cached, and subscribers notified on write.
 */
let orderCache: PlacedOrder | null | undefined;
const orderListeners = new Set<() => void>();

function subscribeOrder(onChange: () => void) {
  orderListeners.add(onChange);
  return () => orderListeners.delete(onChange);
}

function getOrderSnapshot(): PlacedOrder | null {
  if (orderCache === undefined) orderCache = readOrder();
  return orderCache;
}

/** Null on the server, so SSR and first paint agree. */
function getOrderServerSnapshot(): PlacedOrder | null {
  return null;
}

function publishOrder(order: PlacedOrder | null) {
  writeOrder(order);
  orderCache = order;
  for (const listener of orderListeners) listener();
}

// ───────────────────────────────── context ─────────────────────────────────

interface CartState {
  cart: CartDTO;
  /** False until the first fetch resolves, so SSR and first paint agree. */
  ready: boolean;
  setCart: (next: CartDTO) => void;
  lastOrder: PlacedOrder | null;
  setLastOrder: (order: PlacedOrder | null) => void;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartDTO>(EMPTY);
  const [ready, setReady] = useState(false);
  const lastOrder = useSyncExternalStore(subscribeOrder, getOrderSnapshot, getOrderServerSnapshot);

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

  const setLastOrder = useCallback((order: PlacedOrder | null) => publishOrder(order), []);

  const value = useMemo(
    () => ({ cart, ready, setCart, lastOrder, setLastOrder }),
    [cart, ready, lastOrder, setLastOrder],
  );

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
  const { cart, ready, setCart, lastOrder, setLastOrder } = useCartState();

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
  const shipping = standardShipping(subtotal);

  const placeOrder = useCallback(
    (details: Omit<PlacedOrder, "lines" | "subtotal" | "shipping" | "total">) => {
      const orderShipping =
        details.delivery === "express" ? EXPRESS_SHIPPING_FEE : standardShipping(subtotal);
      const order: PlacedOrder = {
        ...details,
        lines: lines.map(({ key, size, count, qty }) => ({ key, size, count, qty })),
        subtotal,
        shipping: orderShipping,
        total: subtotal + orderShipping,
      };
      setLastOrder(order);
      void clear();
      return order;
    },
    [lines, subtotal, setLastOrder, clear],
  );

  return {
    ready,
    lines,
    count: cart.count,
    subtotal,
    shipping,
    total: subtotal + shipping,
    /** The zone that priced this cart, when it moved a price. Null otherwise. */
    zone: cart.zone,
    lastOrder,
    add,
    increment,
    decrement,
    remove,
    clear,
    placeOrder,
  };
}

/** Re-exported so the summary can format without importing the catalogue. */
export { inr };
