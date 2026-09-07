"use client";

import Link from "next/link";
import { useState } from "react";
import { ageInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import { useCatalogData } from "@/lib/catalog-context";
import { defaultPerDay } from "@/lib/diaper-planning";
import { formatRupees, planFirstYear } from "@/lib/first-year-cost";

/**
 * A year of diapers, priced from the catalogue.
 *
 * Deliberately NOT a "first year baby costs" calculator. Every brand ships one
 * and every one of them is built on invented averages for prams and formula —
 * numbers nobody can stand behind. Lumi9 knows exactly one cost exactly, so
 * this answers that one honestly and does not pad it out with guesses.
 *
 * The two things that make the figure real are the price and the size. Prices
 * come from `useCatalogData()`, so a change in the console moves this number;
 * and the size grows month by month along the baby's own centile, because a
 * year quoted in one size is wrong by more than any other error here.
 */
export function FirstYearCost() {
  const profile = useBabyProfile();
  const { sizes, sizeBounds, subscribeSavePct } = useCatalogData();
  const today = new Date().toISOString().slice(0, 10);
  const ageMonths = profile ? ageInMonths(profile.dob, today) : null;

  const [rate, setRate] = useState<string>("");
  const [fromBirth, setFromBirth] = useState(true);

  const typedRate = rate === "" ? null : Number(rate);
  const perDayOverride =
    typedRate !== null && Number.isFinite(typedRate) && typedRate > 0 && typedRate <= 30
      ? typedRate
      : undefined;

  const plan = planFirstYear({
    sex: profile?.sex ?? "female",
    sizes,
    sizeBounds,
    currentWeightKg: profile?.weightKg,
    currentAgeMonths: ageMonths ?? undefined,
    perDayOverride,
    // A parent of a six-month-old usually wants what is LEFT, not what a year
    // would have cost from a birthday that has already gone.
    fromMonth: fromBirth || ageMonths === null ? 0 : Math.min(11, ageMonths),
  });

  const saving = Math.round((plan.totalCost * subscribeSavePct) / 100);
  const partial = !fromBirth && ageMonths !== null && ageMonths > 0;

  return (
    <section id="first-year-cost" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        A year in diapers
      </h2>
      <p className="m-0 mb-6 max-w-[58ch] text-sm leading-[1.6] text-muted">
        Priced from the Lumi9 catalogue at today&apos;s prices - not an industry average - with the
        size growing as your baby does and the best-value pack in each one.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <div className="rounded-card bg-butter p-card">
            <div className="eyebrow mb-3">
              {partial ? "The rest of year one" : "Year one, diapers only"}
            </div>
            <div className="font-display text-[clamp(38px,7vw,62px)] leading-none text-midnight">
              {formatRupees(plan.totalCost)}
            </div>
            <div className="mt-3 text-sm text-midnight/70">
              {plan.totalDiapers.toLocaleString("en-IN")} diapers across{" "}
              {plan.bySize.length === 1 ? "1 size" : `${plan.bySize.length} sizes`}
            </div>

            {subscribeSavePct > 0 && plan.totalCost > 0 ? (
              <div className="mt-5 border-t border-midnight/10 pt-4">
                <p className="m-0 text-sm leading-[1.6] text-midnight">
                  On a subscription that is{" "}
                  <b>{formatRupees(plan.totalCost - saving)}</b> — you keep{" "}
                  <b>{formatRupees(saving)}</b>, at {subscribeSavePct}% off every delivery.
                </p>
                <Link
                  href="/subscription"
                  className="mt-2 inline-flex items-center text-sm font-semibold text-moss-deep coarse:min-h-11"
                >
                  Set up auto-restock →
                </Link>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-4">
            <label className="block max-w-[240px]">
              <span className="mb-1.5 block text-sm font-semibold text-midnight">
                Diapers a day
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                max="30"
                step="1"
                className="field"
                placeholder={`${defaultPerDay(ageMonths ?? 0)} (typical)`}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                aria-describedby="rate-help"
              />
              <span id="rate-help" className="mt-1.5 block text-[13px] leading-[1.5] text-muted">
                Leave it blank and we use the usual rate for each age - it drops as your baby grows.
                Your own number is the accurate one.
              </span>
            </label>

            {ageMonths !== null && ageMonths > 0 && ageMonths < 12 ? (
              <div className="flex gap-2" role="group" aria-label="Period to cost">
                <button
                  type="button"
                  className="chip btn-sm border-midnight"
                  aria-pressed={fromBirth}
                  onClick={() => setFromBirth(true)}
                >
                  Whole year
                </button>
                <button
                  type="button"
                  className="chip btn-sm border-midnight"
                  aria-pressed={!fromBirth}
                  onClick={() => setFromBirth(false)}
                >
                  From now
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* The working, shown. A single big number a parent cannot check is a
            number they have no reason to believe. */}
        <div>
          <h3 className="m-0 mb-3 text-base font-semibold text-midnight">Month by month</h3>
          {plan.totalCost === 0 ? (
            <p className="m-0 text-sm text-muted">
              The catalogue isn&apos;t available right now, so we can&apos;t price this.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Projected diaper size, count and cost for each month of the first year
                </caption>
                <thead>
                  <tr className="border-b border-moss-tint text-left">
                    <Th>Month</Th>
                    <Th>Size</Th>
                    <Th align="right">A day</Th>
                    <Th align="right">Diapers</Th>
                    <Th align="right">Cost</Th>
                  </tr>
                </thead>
                <tbody>
                  {plan.months.map((m) => (
                    <tr key={m.month} className="border-b border-moss-tint/60">
                      <Td>{m.month === 0 ? "Birth–1m" : `${m.month}–${m.month + 1}m`}</Td>
                      <Td>
                        <span className="font-semibold text-midnight">{m.size}</span>{" "}
                        <span className="text-muted">· {m.weightKg.toFixed(1)} kg</span>
                      </Td>
                      <Td align="right">{m.perDay}</Td>
                      <Td align="right">{m.diapers}</Td>
                      <Td align="right">{formatRupees(m.cost)}</Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <Td>Total</Td>
                    <Td />
                    <Td />
                    <Td align="right">
                      <b>{plan.totalDiapers.toLocaleString("en-IN")}</b>
                    </Td>
                    <Td align="right">
                      <b>{formatRupees(plan.totalCost)}</b>
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="m-0 mt-3 text-[13px] leading-[1.55] text-muted">
            Weights are the WHO projection along{" "}
            {profile?.weightKg ? "your baby's own centile" : "the median growth curve"}, so the
            month a size changes is an estimate. Shipping is not included.
          </p>
        </div>
      </div>
    </section>
  );
}

function Th({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return (
    <th
      scope="col"
      className={`pb-2 text-[12px] font-semibold tracking-wide text-muted uppercase ${
        align === "right" ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children?: React.ReactNode; align?: "right" }) {
  return (
    <td className={`py-2.5 text-midnight ${align === "right" ? "text-right" : ""}`}>{children}</td>
  );
}
