import { LAUNCH_OFFER } from "@/lib/content";

/** Mean days per month — a diaper month is not 30 days. */
const DAYS_PER_MONTH = 30.44;
const MAX_SANE_PER_DAY = 30;

/**
 * Starting points only. The UI shows these as editable, because a real family's
 * rate is the accurate number and asserting an average fits would make the cost
 * figure ours rather than theirs.
 */
export const USAGE_BANDS: { upToMonths: number; perDay: number }[] = [
  { upToMonths: 1, perDay: 10 },
  { upToMonths: 6, perDay: 8 },
  { upToMonths: 12, perDay: 7 },
  { upToMonths: 24, perDay: 6 },
  { upToMonths: Infinity, perDay: 5 },
];

export function defaultPerDay(ageMonths: number): number {
  const age = Number.isFinite(ageMonths) && ageMonths > 0 ? ageMonths : 0;
  const band = USAGE_BANDS.find((b) => age < b.upToMonths);
  return band ? band.perDay : USAGE_BANDS[USAGE_BANDS.length - 1].perDay;
}

function launchPrice(price: number): number {
  if (!LAUNCH_OFFER) return price;
  return Math.round(price * (1 - LAUNCH_OFFER.percent / 100));
}

/**
 * Plan a month for ONE product, which the caller resolves.
 *
 * It used to take a `SizeCode` and call `getSize()` itself — the hardcoded
 * `SIZES` array in `src/lib/catalog.ts`, which is the SEED's input. So the
 * monthly cost this tool quotes a parent was computed from constants (₹349,
 * ₹749) and a console price change never moved it, on the one page whose entire
 * job is saying what Lumi9 costs. Taking the product as an argument is what
 * lets the page hand it the database's catalogue instead; the generic keeps it
 * usable with both a `Pack` and a `DbPack`.
 */
export function planDiapers<P extends { count: number; price: number }>(input: {
  product: { packs: P[] } | null | undefined;
  perDay: number;
}): {
  perDay: number;
  perMonth: number;
  pack: P;
  packsPerMonth: number;
  packLastsDays: number;
  monthlyCost: number;
} | null {
  const { product, perDay } = input;
  if (!Number.isFinite(perDay) || perDay <= 0 || perDay > MAX_SANE_PER_DAY) return null;

  if (!product || product.packs.length === 0) return null;

  const perMonth = Math.ceil(perDay * DAYS_PER_MONTH);

  // Largest pack that still fits inside a month's use, so a parent is not told
  // to buy a 54 when they get through 40. Falls back to the smallest pack when
  // even that overshoots.
  const affordable = product.packs.filter((p) => p.count <= perMonth);
  const pack = affordable.length
    ? affordable.reduce((best, p) => (p.count > best.count ? p : best))
    : product.packs.reduce((best, p) => (p.count < best.count ? p : best));

  const packsPerMonth = Math.ceil(perMonth / pack.count);
  const packLastsDays = Math.floor(pack.count / perDay);
  const monthlyCost = packsPerMonth * launchPrice(pack.price);

  return { perDay, perMonth, pack, packsPerMonth, packLastsDays, monthlyCost };
}
