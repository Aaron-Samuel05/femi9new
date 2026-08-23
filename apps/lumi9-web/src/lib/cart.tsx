"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { inr, packImage, standardShipping, EXPRESS_SHIPPING_FEE, type SizeCode } from "@/lib/catalog";
import { useCatalogData, type CatalogData } from "@/lib/catalog-context";

/**
 * Cart + last-order state for the storefront, held in a module-level store so any
 * component can read it without a provider and both nav badges stay in sync.
 * Persistence is localStorage — swap the mutators for API calls when the commerce
 * backend lands.
 */

export type CartLine = {
  /** `${size}-${count}`, e.g. "M-54" */
  key: string;
  size: SizeCode;
  count: number;
  qty: number;
};

export type ResolvedLine = CartLine & {
  name: string;
  fits: string;
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

type Snapshot = {
  /** false until localStorage has been read, so SSR and first paint agree */
  ready: boolean;
  lines: CartLine[];
  lastOrder: PlacedOrder | null;
};

const CART_KEY = "lumi9.cart.v1";
const ORDER_KEY = "lumi9.lastOrder.v1";

/**
 * Real shoppers start with an empty basket. Flip to `true` only to review the
 * populated cart/checkout designs without clicking through the shop first.
 */
const SEED_DEMO_CART = false;

const DEMO_LINES: CartLine[] = [
  { key: "M-54", size: "M", count: 54, qty: 1 },
  { key: "S-24", size: "S", count: 24, qty: 2 },
  { key: "NB-24", size: "NB", count: 24, qty: 1 },
];

const SERVER_SNAPSHOT: Snapshot = { ready: false, lines: [], lastOrder: null };

function lineKey(size: SizeCode, count: number) {
  return `${size}-${count}`;
}

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<CartLine>;
  return (
    typeof line.count === "number" &&
    typeof line.qty === "number" &&
    typeof line.size === "string"
  );
}

function readLines(): CartLine[] | null {
  try {
    const raw = window.localStorage.getItem(CART_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isCartLine).map((line) => ({
      ...line,
      key: lineKey(line.size, line.count),
      qty: Math.max(1, Math.round(line.qty)),
    }));
  } catch {
    return null;
  }
}

function readOrder(): PlacedOrder | null {
  try {
    const raw = window.localStorage.getItem(ORDER_KEY);
    return raw ? (JSON.parse(raw) as PlacedOrder) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — state stays in memory for this session */
  }
}

/* --------------------------------------------------------------------------- */

let snapshot: Snapshot = SERVER_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function set(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  emit();
}

function setLines(update: (current: CartLine[]) => CartLine[]) {
  const lines = update(snapshot.lines);
  set({ lines });
  write(CART_KEY, lines);
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const stored = readLines();
  snapshot = {
    ready: true,
    lines: stored ?? (SEED_DEMO_CART ? DEMO_LINES : []),
    lastOrder: readOrder(),
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!hydrated) {
    hydrate();
    emit();
  }
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/**
 * Turn a stored line into something displayable.
 *
 * Takes the catalogue rather than reaching for it, because this module is a
 * store and not a component: prices, names and images now come from the
 * database, and only a component can read the provider that holds it.
 */
export function resolveLine(catalog: CatalogData, line: CartLine): ResolvedLine {
  const size = catalog.getSizeOrDefault(line.size);
  const pack = size.packs.find((p) => p.count === line.count) ?? size.packs[size.packs.length - 1];
  return {
    ...line,
    name: size.name,
    fits: size.fits,
    price: pack.price,
    lineTotal: pack.price * line.qty,
    image: packImage(size.size, pack.count),
  };
}

export function useCart() {
  const catalog = useCatalogData();
  const { ready, lines, lastOrder } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const resolved = useMemo(() => lines.map((line) => resolveLine(catalog, line)), [catalog, lines]);
  const subtotal = useMemo(() => resolved.reduce((sum, line) => sum + line.lineTotal, 0), [resolved]);
  const count = useMemo(() => lines.reduce((sum, line) => sum + line.qty, 0), [lines]);
  const shipping = standardShipping(subtotal);

  const add = useCallback((size: SizeCode, packCount: number, qty = 1) => {
    const key = lineKey(size, packCount);
    setLines((current) =>
      current.some((line) => line.key === key)
        ? current.map((line) => (line.key === key ? { ...line, qty: line.qty + qty } : line))
        : [...current, { key, size, count: packCount, qty }],
    );
  }, []);

  const increment = useCallback((key: string) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, qty: line.qty + 1 } : line)));
  }, []);

  const decrement = useCallback((key: string) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, qty: Math.max(1, line.qty - 1) } : line)),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setLines((current) => current.filter((line) => line.key !== key));
  }, []);

  const clear = useCallback(() => setLines(() => []), []);

  const placeOrder = useCallback(
    (details: Omit<PlacedOrder, "lines" | "subtotal" | "shipping" | "total">) => {
      const orderLines = snapshot.lines;
      const orderSubtotal = orderLines.reduce((sum, line) => sum + resolveLine(catalog, line).lineTotal, 0);
      const orderShipping =
        details.delivery === "express" ? EXPRESS_SHIPPING_FEE : standardShipping(orderSubtotal);
      const order: PlacedOrder = {
        ...details,
        lines: orderLines,
        subtotal: orderSubtotal,
        shipping: orderShipping,
        total: orderSubtotal + orderShipping,
      };
      write(ORDER_KEY, order);
      write(CART_KEY, []);
      set({ lines: [], lastOrder: order });
      return order;
    },
    // `catalog` matters: the order total is computed with resolveLine(catalog, …).
    // Omitted, this callback keeps whatever prices it first closed over — which
    // was harmless while the catalogue was a hardcoded module and is a real
    // staleness bug now that a console edit can change them mid-session.
    [catalog],
  );

  return {
    ready,
    lines: resolved,
    count,
    subtotal,
    shipping,
    total: subtotal + shipping,
    lastOrder,
    add,
    increment,
    decrement,
    remove,
    clear,
    placeOrder,
  };
}

export { inr };
