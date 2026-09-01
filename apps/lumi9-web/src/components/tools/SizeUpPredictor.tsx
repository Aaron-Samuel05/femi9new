"use client";

import Link from "next/link";
import { useState } from "react";
import { useBabyProfile } from "@/lib/baby-profile";
import { useCatalogData } from "@/lib/catalog-context";
import { projectSizeUp, sizeForWeight } from "@/lib/size-projection";

export function SizeUpPredictor() {
  // Size names come from the catalogue in the DATABASE - `@/lib/catalog` is the
  // seed's input, so a size renamed in the console never reached this page.
  const { getSize, sizeBounds } = useCatalogData();
  const profile = useBabyProfile();
  const today = new Date().toISOString().slice(0, 10);

  const [typed, setTyped] = useState<string | null>(null);
  const weight = typed ?? profile?.weightKg?.toString() ?? "";
  const weightKg = Number(weight);
  const hasWeight = weight !== "" && Number.isFinite(weightKg) && weightKg > 0;
  // Bands from the CATALOGUE. `SIZE_BOUNDS` in size-projection.ts was a second
  // copy of these numbers with a comment saying it had to be kept in step by
  // hand; it is the fallback now, for a catalogue seeded before the migration.
  const current = hasWeight ? sizeForWeight(weightKg, sizeBounds) : null;

  const projection =
    profile && hasWeight
      ? projectSizeUp({ dob: profile.dob, sex: profile.sex, weightKg, today }, sizeBounds)
      : null;

  return (
    <section id="size-up" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        When will they size up?
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        We follow your baby&apos;s own growth curve, not an average one - so a bigger baby gets a
        sooner answer and a smaller one a later answer.
      </p>

      <label className="block max-w-[260px]">
        <span className="mb-1.5 block text-sm font-semibold text-midnight">Current weight (kg)</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          className="field"
          value={weight}
          onChange={(e) => setTyped(e.target.value)}
        />
      </label>

      <div className="mt-6">
        {!hasWeight ? (
          <p className="m-0 text-sm text-muted">Enter a weight to see the current size.</p>
        ) : !current ? (
          <p className="m-0 text-sm text-muted">
            That weight is outside our size range - have a look at the{" "}
            <Link href="/size-guide" className="underline">
              size guide
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="font-display text-[clamp(24px,3.4vw,36px)] leading-none">
              Size {current} - {getSize(current)?.name}
            </div>
            {!profile ? (
              <p className="m-0 mt-3 text-sm text-muted">
                Add a date of birth above and we can tell you roughly when the next size starts.
              </p>
            ) : projection && "whenMonth" in projection ? (
              <p className="m-0 mt-3 text-body">
                Likely moving to size <strong className="font-semibold">{projection.next}</strong>{" "}
                around <strong className="font-semibold">{projection.whenMonth}</strong>.
              </p>
            ) : projection ? (
              <p className="m-0 mt-3 text-sm text-muted">
                {projection.unavailable === "largest-size"
                  ? "Already in our largest size."
                  : projection.unavailable === "beyond-horizon"
                    ? "No size change expected in the next six months."
                    : "We can't project from that weight and age."}
              </p>
            ) : null}
          </>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        {current ? (
          <Link href={`/product/${current.toLowerCase()}`} className="btn btn-dark">
            Shop size {current}
          </Link>
        ) : null}
        <Link href="/size-guide" className="btn btn-ghost">
          Full size guide
        </Link>
      </div>
    </section>
  );
}
