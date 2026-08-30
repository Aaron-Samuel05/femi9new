/**
 * Lumi9 product data — now the SEED's input, not the storefront's source.
 *
 * `prisma/seed.ts` reads `SIZES` and writes it into the `lumi9` schema; the
 * storefront reads the database through `catalog.server.ts` and hands it to
 * client components via `catalog-context.tsx`. Editing this file changes what a
 * fresh seed writes, and nothing that is already live — the console is where a
 * live catalogue is edited.
 *
 * The pure helpers below (pricing, shipping, formatting, image paths) are used
 * by BOTH, which is why they stay here.
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

/**
 * Marketing copy only — "free delivery on orders over ₹999" appears in a
 * handful of sentences and needs a number to interpolate.
 *
 * It is NOT what anybody is charged. `Settings.freeShipThreshold` is, the
 * console can edit it, and `/api/checkout/quote` is where every rendered total
 * comes from. Keep this in step with the seeded default when it changes; do not
 * reintroduce a second calculation from it.
 */
export const FREE_SHIPPING_THRESHOLD = 999;

/*
 * STANDARD_SHIPPING_FEE / EXPRESS_SHIPPING_FEE / standardShipping() used to
 * live here and price the cart and checkout summaries.
 *
 * They were a duplicate of a rule the server owns — so a console change to the
 * threshold moved what a shopper was CHARGED without moving what she was SHOWN
 * — and the express tier was worse than duplicated: it existed nowhere but this
 * file. Picking it added ₹79 to the on-screen total, was never sent to
 * /api/checkout, never reached an Order row, and never changed how the parcel
 * shipped. `shippingFor()` in @femi9/core/services/checkout is the one rule.
 */

/**
 * Subscription cadences — reference data, not marketing copy.
 *
 * ONE list, read by the seed (which writes a `Cadence` row per entry) and by
 * the box builder (which posts `code` to /api/subscriptions, where the service
 * resolves it back against those rows). Femi9 does the same, for the same
 * reason: a picker whose options are typed out separately from the rows they
 * resolve against drifts, and every subscribe attempt becomes a 400 nobody can
 * explain.
 *
 * Lumi9's codes are its own. Femi9's are period-cycle shaped ('cycle', '4w',
 * '6w') because that is the product; a diaper refill is not, and the two
 * brands' rows live in different schemas so the codes need not agree.
 */
export interface SubscriptionCadence {
  /** `Cadence.code` — what the API is posted and what the row is keyed on. */
  code: string;
  label: string;
  sub: string;
  /** Days until the first delivery, and the interval between renewals. */
  days: number;
}

export const CADENCES: SubscriptionCadence[] = [
  { code: "2w", label: "Every 2 weeks", sub: "For newborns and heavy days", days: 14 },
  { code: "4w", label: "Every 4 weeks", sub: "The steady four-week refill", days: 28 },
  { code: "6w", label: "Every 6 weeks", sub: "For lighter use or bigger packs", days: 42 },
];

/*
 * SUBSCRIPTION_DISCOUNT lived here as `0.2`, and the box builder priced its
 * summary from it — "You save 20% every delivery".
 *
 * The renewal orders `generateDueOrders()` actually creates are discounted by
 * `Settings.subscribeSavePct`, which the console owns and which defaults to 15.
 * So the page promised 20% and the second delivery would have charged a 15%
 * discount, with no code path connecting the two. The builder reads the real
 * value from the server now; see `subscriptionPrice` below.
 */

export function getSize(code: string | undefined | null): ProductSize | undefined {
  if (!code) return undefined;
  const wanted = code.toUpperCase();
  return SIZES.find((s) => s.size === wanted);
}

/** getSize with a sane fallback so views never render empty. */
export function getSizeOrDefault(code: string | undefined | null, fallback: SizeCode = "M"): ProductSize {
  return getSize(code) ?? getSize(fallback)!;
}

export function defaultPack<P extends { count: number }>(size: { packs: P[] }): P {
  return size.packs.find((p) => p.count === DEFAULT_PACK_COUNT) ?? size.packs[size.packs.length - 1]!;
}

export function getPack<P extends { count: number }>(
  size: { packs: P[] },
  count: number | undefined | null,
): P {
  return size.packs.find((p) => p.count === count) ?? defaultPack(size);
}

export function packImage(size: SizeCode, count: number) {
  return `/assets/products/${size}-${count}.jpeg`;
}

export function productName(size: { name: string }) {
  return `Cloud Soft — ${size.name}`;
}

const inrFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** ₹949 · ₹2,940 */
export function inr(amount: number) {
  return `₹${inrFormat.format(Math.round(amount))}`;
}

/**
 * A subscription price at `savePct` off. The percentage is NOT a constant here:
 * it comes from Settings, through /api/checkout/quote's sibling on the
 * subscription page, so what is shown is what a renewal is charged.
 */
export function subscriptionPrice(price: number, savePct: number) {
  return Math.round((price * (100 - savePct)) / 100);
}

/** Render a server-computed delivery fee. Does not decide one. */
export function shippingLabel(fee: number) {
  return fee === 0 ? "Free" : inr(fee);
}
