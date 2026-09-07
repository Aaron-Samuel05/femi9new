import type { SizeCode } from "@/lib/catalog";
import { defaultPerDay } from "@/lib/diaper-planning";
import { Z_DISPLAY_LIMIT, lookupLms, valueForZ, zScore } from "@/lib/growth-standards";
import type { BabySex } from "@/lib/baby-profile";
import { sizeForWeight, type SizeBound } from "@/lib/size-projection";

/** Mean days per month, matching `diaper-planning`'s own figure. */
const DAYS_PER_MONTH = 30.44;

export type CostSize = {
  size: SizeCode;
  packs: { count: number; price: number }[];
};

export type MonthCost = {
  month: number;
  size: SizeCode;
  /** The projected weight the size was chosen from, in kg. */
  weightKg: number;
  perDay: number;
  diapers: number;
  cost: number;
};

/**
 * What a year of diapers costs, month by month.
 *
 * Two things make this different from the cost calculators every other baby
 * brand ships. The prices are the CATALOGUE'S — a console price change moves
 * this number, and no average is invented anywhere. And the size changes as the
 * baby grows, because a year quoted entirely in one size is wrong by more than
 * any other error in the calculation: newborns burn ten a day at the cheapest
 * per-diaper price and toddlers five a day at the dearest.
 *
 * The growth projection follows the baby's OWN percentile when there is a
 * weight to read one from, and the WHO median when there is not. Holding the
 * z-score constant is the same assumption `projectSizeUp` makes: babies broadly
 * track their own centile, and assuming a heavy baby will become average would
 * quietly under-buy for them.
 */
export function planFirstYear(input: {
  sex: BabySex;
  sizes: CostSize[];
  sizeBounds: SizeBound[];
  /** A known weight and the age it was taken at, to anchor the centile. */
  currentWeightKg?: number;
  currentAgeMonths?: number;
  /** Overrides the age-banded default when a parent knows their real rate. */
  perDayOverride?: number;
  fromMonth?: number;
}): {
  months: MonthCost[];
  totalDiapers: number;
  totalCost: number;
  bySize: { size: SizeCode; months: number; diapers: number; cost: number }[];
} {
  const z = anchorZ(input.sex, input.currentWeightKg, input.currentAgeMonths);
  const months: MonthCost[] = [];
  const start = Math.max(0, Math.floor(input.fromMonth ?? 0));

  for (let month = start; month < 12; month++) {
    // Mid-month, not the boundary: a size is worn through a month, and reading
    // the weight at month 0 would price the whole first month at birth weight.
    const row = lookupLms("weight-for-age", input.sex, month + 0.5);
    if (!row) continue;
    const weightKg = valueForZ(z, row);
    /* `sizeForWeight` answers null above the largest band as well as below the
       smallest, and a projected first-year weight can land just past the top of
       XL. Falling back to the nearest end keeps the year costed rather than
       dropping a month silently out of the total. */
    const size = sizeForWeight(weightKg, input.sizeBounds) ?? nearestSize(weightKg, input.sizeBounds);
    if (size === null) continue;
    const perDay = input.perDayOverride ?? defaultPerDay(month);
    const diapers = Math.round(perDay * DAYS_PER_MONTH);
    const unit = bestUnitPrice(input.sizes, size);
    months.push({
      month,
      size,
      weightKg,
      perDay,
      diapers,
      // Rounded per month rather than once at the end, so the column of figures
      // a parent can add up themselves matches the total printed beside it.
      cost: unit === null ? 0 : Math.round(diapers * unit),
    });
  }

  const bySize = new Map<SizeCode, { size: SizeCode; months: number; diapers: number; cost: number }>();
  for (const m of months) {
    const row = bySize.get(m.size) ?? { size: m.size, months: 0, diapers: 0, cost: 0 };
    row.months += 1;
    row.diapers += m.diapers;
    row.cost += m.cost;
    bySize.set(m.size, row);
  }

  return {
    months,
    totalDiapers: months.reduce((n, m) => n + m.diapers, 0),
    totalCost: months.reduce((n, m) => n + m.cost, 0),
    bySize: [...bySize.values()],
  };
}

/**
 * The cheapest price per diaper available in a size.
 *
 * A parent buying a year of diapers buys the best-value pack, so quoting the
 * default pack's unit price would overstate the year by whatever the bulk
 * saving is. Returns null when the size is not in the catalogue at all, which
 * the caller shows as a gap rather than as ₹0.
 */
export function bestUnitPrice(sizes: CostSize[], size: SizeCode): number | null {
  const found = sizes.find((s) => s.size === size);
  if (!found || found.packs.length === 0) return null;
  const unit = found.packs
    .filter((p) => p.count > 0 && p.price > 0)
    .map((p) => p.price / p.count);
  return unit.length === 0 ? null : Math.min(...unit);
}

/** The smallest or largest band, for a weight that falls outside every one. */
function nearestSize(weightKg: number, bounds: SizeBound[]): SizeCode | null {
  if (bounds.length === 0) return null;
  return weightKg <= bounds[0].minKg ? bounds[0].size : bounds[bounds.length - 1].size;
}

/** The centile to project along: the baby's own, or the median. */
function anchorZ(sex: BabySex, weightKg?: number, ageMonths?: number): number {
  if (!weightKg || weightKg <= 0 || ageMonths === undefined || ageMonths < 0) return 0;
  const row = lookupLms("weight-for-age", sex, ageMonths);
  if (!row) return 0;
  const z = zScore(weightKg, row);
  /* `Z_DISPLAY_LIMIT`, not a second cutoff of its own: the percentile readout
     already draws the line at "beyond this the number stops meaning anything",
     and a projection that disagreed with it would reject a baby the growth tool
     was happily charting. A tighter guard here rejected a real 97th-centile
     baby as a typo and silently priced their year at the median. What it must
     still catch is a mistyped 70 kg buying XL for twelve months. */
  return Number.isFinite(z) && Math.abs(z) <= Z_DISPLAY_LIMIT ? z : 0;
}

/** "₹12,480" — Indian digit grouping, no decimals. */
export function formatRupees(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
