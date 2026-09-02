"use client";

import Link from "next/link";
import { useState } from "react";
import { ageInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import { inr, type SizeCode } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import { defaultPerDay, planDiapers } from "@/lib/diaper-planning";
import { sizeForWeight } from "@/lib/size-projection";

export function DiaperPlanner() {
  // The catalogue from the DATABASE, not the SIZES array in lib/catalog.ts -
  // that module is the seed's input, so the monthly cost quoted here was
  // computed from constants a console price change never moved.
  const { sizes, getSize, sizeBounds } = useCatalogData();
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);

  const ageMonths = profile ? ageInMonths(profile.dob, today) : 0;
  // Bands from the CATALOGUE, not the module: a weight range renamed in the
  // console now moves the size this planner suggests, which it never did.
  const suggestedSize = profile?.weightKg ? sizeForWeight(profile.weightKg, sizeBounds) : null;

  const [size, setSize] = useState<SizeCode | null>(null);
  const [perDay, setPerDay] = useState<number | null>(null);

  const activeSize = size ?? suggestedSize ?? "M";
  const activePerDay = perDay ?? defaultPerDay(ageMonths);
  const plan = planDiapers({ product: getSize(activeSize), perDay: activePerDay });

  return (
    <section id="planner" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        How many will you need?
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        We start from a typical rate for your baby&apos;s age. Change it to what you actually use -
        your number is the accurate one.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">Size</span>
          <select
            className="field"
            value={activeSize}
            onChange={(e) => setSize(e.target.value as SizeCode)}
          >
            {sizes.map(({ size: code, range }) => (
              <option key={code} value={code}>
                {code} - {range}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-midnight">
            Diapers per day: {activePerDay}
          </span>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={activePerDay}
            onChange={(e) => setPerDay(Number(e.target.value))}
            /* 16px tall by default - the smallest target on the site. The
               coarse box gives a thumb 44px to land in without changing how
               the control looks with a mouse. */
            className="w-full touch-manipulation accent-moss-deep coarse:h-11"
            aria-label="Diapers per day"
          />
        </label>
      </div>

      {plan ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat value={String(plan.perMonth)} label="a month" />
          <Stat value={`${plan.pack.count}-pack`} label="best value pack" />
          <Stat value={`${plan.packLastsDays} days`} label="one pack lasts" />
          <Stat value={inr(plan.monthlyCost)} label="a month" />
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">Pick a size and a daily rate to see a plan.</p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={`/product/${activeSize.toLowerCase()}`} className="btn btn-dark">
          Shop size {activeSize}
        </Link>
        <Link href="/subscription" className="btn btn-ghost">
          Set up a repeat delivery
        </Link>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-[clamp(22px,3vw,32px)] leading-none">{value}</div>
      <div className="mt-1 text-[13px] text-muted">{label}</div>
    </div>
  );
}
