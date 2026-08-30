"use client";

import Link from "next/link";
import { useState } from "react";
import { ageInMonths } from "@/lib/baby-age";
import { useBabyProfile } from "@/lib/baby-profile";
import { getSize, inr, SIZE_CODES, type SizeCode } from "@/lib/catalog";
import { defaultPerDay, planDiapers } from "@/lib/diaper-planning";
import { sizeForWeight } from "@/lib/size-projection";

export function DiaperPlanner() {
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);

  const ageMonths = profile ? ageInMonths(profile.dob, today) : 0;
  const suggestedSize = profile?.weightKg ? sizeForWeight(profile.weightKg) : null;

  const [size, setSize] = useState<SizeCode | null>(null);
  const [perDay, setPerDay] = useState<number | null>(null);

  const activeSize = size ?? suggestedSize ?? "M";
  const activePerDay = perDay ?? defaultPerDay(ageMonths);
  const plan = planDiapers({ size: activeSize, perDay: activePerDay });

  return (
    <section id="planner" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        How many will you need?
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        We start from a typical rate for your baby&apos;s age. Change it to what you actually use —
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
            {SIZE_CODES.map((code) => (
              <option key={code} value={code}>
                {code} — {getSize(code)?.range}
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
            className="w-full"
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
