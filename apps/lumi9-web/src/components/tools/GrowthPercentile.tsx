"use client";

import { useState } from "react";
import { ageInMonths, correctedAgeInMonths } from "@/lib/baby-age";
import { useBabyProfile, type BabySex } from "@/lib/baby-profile";
import { percentileFor, type GrowthIndicator } from "@/lib/growth-standards";
import { WHO_SOURCE, WHO_TRANSCRIBED_ON } from "@/lib/growth-standards.data";
import { useParenting } from "@/lib/parenting-context";
import { GrowthChart, type GrowthPoint } from "./GrowthChart";
import { ToolDisclaimer } from "./ToolDisclaimer";

export function GrowthPercentile() {
  const profile = useBabyProfile();
  const { measurementsByBaby, signedIn } = useParenting();
  const [indicator, setIndicator] = useState<GrowthIndicator>("weight-for-age");
  const today = new Date().toISOString().slice(0, 10);

  if (!profile) {
    return (
      <section id="growth" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
        <Heading />
        <p className="m-0 text-sm text-muted">
          Add your baby&apos;s date of birth, sex and measurements above to see percentiles.
        </p>
      </section>
    );
  }

  const chronological = ageInMonths(profile.dob, today);
  const ageMonths = correctedAgeInMonths(profile.dob, today, profile.gestationalWeeks);
  const corrected = ageMonths !== chronological;

  const isWeight = indicator === "weight-for-age";
  const current = isWeight ? profile.weightKg : profile.heightCm;
  const series: GrowthPoint[] = (measurementsByBaby[profile.id] ?? [])
    .map((m) => ({ takenOn: m.takenOn, value: (isWeight ? m.weightKg : m.heightCm) ?? 0 }))
    .filter((p) => p.value > 0);
  const points: GrowthPoint[] =
    series.length > 0 ? series : current ? [{ takenOn: today, value: current }] : [];

  return (
    <section id="growth" className="panel p-card scroll-mt-[calc(var(--nav-h,68px)+16px)]">
      <Heading />
      {corrected ? (
        <p className="m-0 mb-4 text-[13px] text-muted">
          Using a corrected age of {ageMonths} months (born at {profile.gestationalWeeks} weeks),
          which is how growth is read for a baby born early.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Reading
          label="Weight for age"
          indicator="weight-for-age"
          value={profile.weightKg}
          unit="kg"
          sex={profile.sex}
          ageMonths={ageMonths}
        />
        <Reading
          label="Height for age"
          indicator="height-for-age"
          value={profile.heightCm}
          unit="cm"
          sex={profile.sex}
          ageMonths={ageMonths}
        />
      </div>

      {/* ── The series ──
          `measurements` is what every profile save has been writing; it is
          empty for a guest, whose device store keeps one profile rather than a
          history. Falling back to the single current reading means the chart
          appears for everybody, and the line below says plainly which of the
          two a parent is looking at. */}
      {points.length > 0 ? (
        <div className="mt-7 border-t border-moss-tint pt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="m-0 text-base font-semibold text-midnight">Over time</h3>
            <div className="flex gap-2" role="group" aria-label="Chart measurement">
              {(
                [
                  ["weight-for-age", "Weight"],
                  ["height-for-age", "Height"],
                ] as const
              ).map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  className="chip btn-sm border-midnight"
                  aria-pressed={indicator === value}
                  onClick={() => setIndicator(value)}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>

          <GrowthChart
            indicator={indicator}
            sex={profile.sex}
            dob={profile.dob}
            gestationalWeeks={profile.gestationalWeeks}
            points={points}
            unit={isWeight ? "kg" : "cm"}
            label={isWeight ? "Weight for age" : "Height for age"}
          />

          {points.length === 1 ? (
            <p className="m-0 mt-3 text-[13px] leading-[1.55] text-muted">
              {signedIn ? (
                <>
                  One reading so far. Update the weight above after each check-up and the line
                  builds itself - a single point is a position, a line is a trend.
                </>
              ) : (
                <>
                  One reading so far, because this device only stores your baby&apos;s latest
                  measurement.{" "}
                  <a href="/login?next=%2Fparenting-tools%2Fgrowth" className="underline">
                    Sign in
                  </a>{" "}
                  and every update is kept, so this becomes a curve you can take to the next visit.
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      <ToolDisclaimer source={WHO_SOURCE} revisedOn={WHO_TRANSCRIBED_ON} />
    </section>
  );
}

function Heading() {
  return (
    <>
      <h2 className="m-0 mb-1 font-display text-[clamp(22px,2.8vw,32px)] font-normal leading-tight">
        Growth percentiles
      </h2>
      <p className="m-0 mb-5 max-w-[52ch] text-sm text-muted">
        Where your baby sits against the WHO growth standards. A percentile is a position, not a
        grade - healthy babies live at every one of them.
      </p>
    </>
  );
}

function Reading({
  label,
  indicator,
  value,
  unit,
  sex,
  ageMonths,
}: {
  label: string;
  indicator: GrowthIndicator;
  value: number | undefined;
  unit: string;
  sex: BabySex;
  ageMonths: number;
}) {
  if (value === undefined) {
    return (
      <div>
        <div className="text-sm font-semibold text-midnight">{label}</div>
        <p className="m-0 mt-1 text-sm text-muted">Add a measurement above.</p>
      </div>
    );
  }

  const result = percentileFor({ indicator, sex, ageMonths, value });
  const rounded = "percentile" in result ? Math.round(result.percentile) : 0;

  return (
    <div>
      <div className="text-sm font-semibold text-midnight">{label}</div>
      {"percentile" in result ? (
        <>
          <div className="mt-1 font-display text-[clamp(24px,3.4vw,36px)] leading-none">
            {rounded}
            <span className="align-super text-[0.5em]">{ordinal(rounded)}</span>
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {value} {unit} at {ageMonths} months
          </div>
        </>
      ) : (
        <p className="m-0 mt-1 text-sm text-muted">
          {result.outOfRange === "age"
            ? "These standards cover birth to 5 years."
            : "That measurement is outside the standard range - worth asking your paediatrician."}
        </p>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
