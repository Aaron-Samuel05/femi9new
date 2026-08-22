/**
 * Canonical Lumi9 product data.
 * Prices are the placeholders supplied in the design handoff (client to confirm).
 */

export type SizeCode = "NB" | "S" | "M" | "L" | "XL";

export type Pack = {
  /** diapers per pack */
  count: number;
  /** price in INR */
  price: number;
  /** shipping weight in kg */
  shipWeight: number;
};

export type ProductSize = {
  size: SizeCode;
  name: string;
  /** long form, e.g. "up to 5 kg" */
  fits: string;
  /** compact form used in tables/cards, e.g. "≤ 5 kg" */
  range: string;
  /** ultra-compact form used inside size chips, e.g. "≤5kg" */
  short: string;
  packs: Pack[];
};

export const SIZES: ProductSize[] = [
  {
    size: "NB",
    name: "Newborn",
    fits: "up to 5 kg",
    range: "≤ 5 kg",
    short: "≤5kg",
    packs: [
      { count: 3, price: 49, shipWeight: 0.04 },
      { count: 24, price: 349, shipWeight: 0.4 },
      { count: 54, price: 749, shipWeight: 0.9 },
    ],
  },
  {
    size: "S",
    name: "Small",
    fits: "4–8 kg",
    range: "4–8 kg",
    short: "4–8kg",
    packs: [
      { count: 3, price: 59, shipWeight: 0.06 },
      { count: 24, price: 399, shipWeight: 0.53 },
      { count: 54, price: 849, shipWeight: 1.22 },
    ],
  },
  {
    size: "M",
    name: "Medium",
    fits: "7–12 kg",
    range: "7–12 kg",
    short: "7–12kg",
    packs: [
      { count: 24, price: 449, shipWeight: 0.65 },
      { count: 54, price: 949, shipWeight: 1.5 },
    ],
  },
  {
    size: "L",
    name: "Large",
    fits: "9–14 kg",
    range: "9–14 kg",
    short: "9–14kg",
    packs: [
      { count: 24, price: 499, shipWeight: 0.7 },
      { count: 54, price: 1049, shipWeight: 1.58 },
    ],
  },
  {
    size: "XL",
    name: "Extra Large",
    fits: "12–17 kg",
    range: "12–17 kg",
    short: "12–17kg",
    packs: [
      { count: 24, price: 549, shipWeight: 0.85 },
      { count: 54, price: 1149, shipWeight: 1.85 },
    ],
  },
];

export const SIZE_CODES = SIZES.map((s) => s.size);

/** Weight chips used by the size finder + size guide. */
export const WEIGHT_OPTIONS: { label: string; size: SizeCode }[] = [
  { label: "0–5 kg", size: "NB" },
  { label: "4–8 kg", size: "S" },
  { label: "7–12 kg", size: "M" },
  { label: "9–14 kg", size: "L" },
  { label: "12–17 kg", size: "XL" },
];

/** Preferred default pack tier when one exists for the size. */
export const DEFAULT_PACK_COUNT = 24;

export const FREE_SHIPPING_THRESHOLD = 999;
export const STANDARD_SHIPPING_FEE = 49;
export const EXPRESS_SHIPPING_FEE = 79;
export const SUBSCRIPTION_DISCOUNT = 0.2;

export function getSize(code: string | undefined | null): ProductSize | undefined {
  if (!code) return undefined;
  const wanted = code.toUpperCase();
  return SIZES.find((s) => s.size === wanted);
}

/** getSize with a sane fallback so views never render empty. */
export function getSizeOrDefault(code: string | undefined | null, fallback: SizeCode = "M"): ProductSize {
  return getSize(code) ?? getSize(fallback)!;
}

export function defaultPack(size: ProductSize): Pack {
  return size.packs.find((p) => p.count === DEFAULT_PACK_COUNT) ?? size.packs[size.packs.length - 1];
}

export function getPack(size: ProductSize, count: number | undefined | null): Pack {
  return size.packs.find((p) => p.count === count) ?? defaultPack(size);
}

export function packImage(size: SizeCode, count: number) {
  return `/assets/products/${size}-${count}.jpeg`;
}

export function productName(size: ProductSize) {
  return `Cloud Soft — ${size.name}`;
}

const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹949 · ₹2,940 */
export function inr(amount: number) {
  return `₹${inrFormat.format(Math.round(amount))}`;
}

export function subscriptionPrice(price: number) {
  return Math.round(price * (1 - SUBSCRIPTION_DISCOUNT));
}

/** Free over ₹999 (and for an empty basket), otherwise the flat standard fee. */
export function standardShipping(subtotal: number) {
  return subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_FEE;
}

export function shippingLabel(fee: number) {
  return fee === 0 ? "Free" : inr(fee);
}
