"use client";

import { useSyncExternalStore } from "react";
import { correctedAgeInMonths } from "@/lib/baby-age";
import type { BabySex } from "@/lib/baby-profile";
import {
  CHART_PERCENTILES,
  percentileCurve,
  type GrowthIndicator,
} from "@/lib/growth-standards";

export type GrowthPoint = { takenOn: string; value: number };

/* The drawing surface, in two sizes.
 *
 * A viewBox scales EVERYTHING, type included. One 720-wide geometry rendered
 * into a 340px phone column is a scale factor of 0.47, which turned 12-unit
 * axis labels into 5px — a chart a parent cannot read is not a chart. The
 * narrow geometry is not a smaller version of the wide one: it is a squarer
 * box with proportionally larger type, so the labels land at roughly the same
 * physical size on both. */
const WIDE = {
  view: { w: 720, h: 380 },
  pad: { top: 14, right: 42, bottom: 34, left: 44 },
  axisFont: 12,
  labelFont: 11,
  dot: 6,
  /* All five reference lines. */
  labelled: [3, 15, 50, 85, 97],
};
const NARROW = {
  view: { w: 380, h: 300 },
  pad: { top: 12, right: 40, bottom: 30, left: 34 },
  /* Sized so the labels land near 11px ON SCREEN once the 380-unit box is
     rendered into a ~300px phone column — not so they look right in the
     viewBox, which is the mistake that produced 5px type in the first place. */
  axisFont: 14,
  labelFont: 12,
  dot: 5,
  /* Five labels stacked in 300 units of height collide. The band edges and the
     median are the three that carry the meaning. */
  labelled: [3, 50, 97],
};

/**
 * Whether the chart is being drawn into a phone-width column.
 *
 * `useSyncExternalStore` over `matchMedia` rather than an effect: the server
 * snapshot is the wide geometry, so SSR and hydration agree, and the switch
 * happens in one commit instead of a render-then-correct flash.
 */
const NARROW_QUERY = "(max-width: 640px)";
function subscribeToWidth(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(NARROW_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeToWidth,
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia(NARROW_QUERY).matches
      : false),
    () => false,
  );
}

/**
 * A baby's readings against the WHO reference curves.
 *
 * The percentile READOUT beside this answers "where is my baby today"; the point
 * of a chart is the other question, the one a paediatrician actually asks at
 * every visit - "is the line following a band, or crossing them". A single
 * number cannot show that, which is why the growth tool shipped for months as a
 * calculator while `BabyMeasurement` quietly filled up with the series that
 * makes it a chart.
 *
 * Ages are CORRECTED for prematurity, the same as the readout: a baby born at 32
 * weeks plotted against their birth date reads as failing to grow, which is both
 * wrong and frightening. Vaccination dates are never corrected - that is a
 * different question and a different tool.
 */
export function GrowthChart({
  indicator,
  sex,
  dob,
  gestationalWeeks,
  points,
  unit,
  label,
}: {
  indicator: GrowthIndicator;
  sex: BabySex;
  dob: string;
  gestationalWeeks: number | undefined;
  points: GrowthPoint[];
  unit: string;
  label: string;
}) {
  const G = useIsNarrow() ? NARROW : WIDE;
  const VIEW = G.view;
  const PAD = G.pad;
  const PLOT = { w: VIEW.w - PAD.left - PAD.right, h: VIEW.h - PAD.top - PAD.bottom };

  const plotted = points
    .map((p) => ({
      month: correctedAgeInMonths(dob, p.takenOn, gestationalWeeks),
      value: p.value,
      takenOn: p.takenOn,
    }))
    .filter((p) => Number.isFinite(p.month) && p.month >= 0 && p.value > 0)
    .sort((a, b) => a.month - b.month);

  if (plotted.length === 0) return null;

  const latest = plotted[plotted.length - 1];

  /* Headroom, not the whole five-year table: a two-month-old charted to 60
     months is a flat line in the bottom-left corner. The window grows with the
     baby and stops where the standards do. */
  const xMax = Math.min(
    60,
    Math.max(6, Math.ceil(latest.month) + Math.max(2, Math.ceil(latest.month * 0.3))),
  );

  const curves = CHART_PERCENTILES.map((p) => ({
    ...p,
    points: percentileCurve({ indicator, sex, z: p.z, toMonth: xMax }),
  })).filter((c) => c.points.length > 1);

  if (curves.length === 0) return null;

  const lo = curves[0].points;
  const hi = curves[curves.length - 1].points;

  /* The y window holds the reference band AND every reading, so a baby outside
     the P3-P97 range is drawn off the band rather than clipped off the chart -
     which is precisely the case a parent most needs to see. */
  const values = [
    ...lo.map((p) => p.value),
    ...hi.map((p) => p.value),
    ...plotted.map((p) => p.value),
  ];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padY = (rawMax - rawMin) * 0.08 || 1;
  const yMin = Math.max(0, rawMin - padY);
  const yMax = rawMax + padY;

  const x = (month: number) => PAD.left + (month / xMax) * PLOT.w;
  const y = (value: number) => PAD.top + PLOT.h - ((value - yMin) / (yMax - yMin)) * PLOT.h;

  const line = (pts: { month: number; value: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.month).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");

  /** Upper curve forward, lower curve backward — one closed band. */
  const band = (
    upper: { month: number; value: number }[],
    lower: { month: number; value: number }[],
  ) => `${line(upper)} L${x(lower[lower.length - 1].month).toFixed(1)} ${y(lower[lower.length - 1].value).toFixed(1)} ${lower
    .slice()
    .reverse()
    .map((p) => `L${x(p.month).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ")} Z`;

  const tight = VIEW.w < 500;
  const xStep = xMax <= 6 ? (tight ? 2 : 1) : xMax <= 12 ? (tight ? 3 : 2) : xMax <= 24 ? (tight ? 6 : 4) : 12;
  const xTicks: number[] = [];
  for (let m = 0; m <= xMax; m += xStep) xTicks.push(m);

  const yTicks = niceTicks(yMin, yMax, tight ? 3 : 4);

  const p50 = curves.find((c) => c.percentile === 50);
  const p15 = curves.find((c) => c.percentile === 15);
  const p85 = curves.find((c) => c.percentile === 85);

  return (
    <figure className="m-0 max-w-[880px]">
      <svg
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        className="block h-auto w-full"
        role="img"
        aria-label={`${label} chart. ${plotted.length} reading${plotted.length === 1 ? "" : "s"} plotted against the WHO reference curves, most recent ${latest.value} ${unit} at ${latest.month} months.`}
      >
        {/* The expected range: 94% of healthy babies sit inside the outer band. */}
        <path d={band(hi, lo)} fill="var(--color-moss-tint)" opacity="0.7" />
        {p15 && p85 ? (
          <path d={band(p85.points, p15.points)} fill="var(--color-moss-soft)" opacity="0.32" />
        ) : null}

        {yTicks.map((v) => (
          <line
            key={v}
            x1={PAD.left}
            x2={PAD.left + PLOT.w}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--color-moss-tint)"
            strokeWidth="1"
          />
        ))}

        {/* The median, dashed so it reads as a reference and not as data. */}
        {p50 ? (
          <path
            d={line(p50.points)}
            fill="none"
            stroke="var(--color-moss-deep)"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            opacity="0.75"
          />
        ) : null}

        {/* This baby. */}
        <path
          d={line(plotted)}
          fill="none"
          stroke="var(--color-midnight)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {plotted.map((p, i) => {
          const isLatest = i === plotted.length - 1;
          return (
            <circle
              key={`${p.takenOn}-${i}`}
              cx={x(p.month)}
              cy={y(p.value)}
              r={isLatest ? G.dot : G.dot * 0.58}
              fill={isLatest ? "var(--color-butter)" : "var(--color-midnight)"}
              stroke="var(--color-midnight)"
              strokeWidth={isLatest ? G.dot * 0.42 : 0}
            />
          );
        })}

        {/* Axes last, so nothing is drawn over a label. */}
        {xTicks.map((m) => (
          <text
            key={m}
            x={x(m)}
            y={VIEW.h - 10}
            textAnchor="middle"
            fontSize={G.axisFont}
            fill="var(--color-muted)"
          >
            {m}
          </text>
        ))}
        {/* Dropped on the narrow geometry, where it sat on top of the last
            tick. The caption names the unit instead. */}
        {tight ? null : (
          <text
            x={PAD.left + PLOT.w}
            y={VIEW.h - 10}
            textAnchor="end"
            fontSize={G.labelFont}
            fill="var(--color-muted)"
            opacity="0.8"
          >
            months
          </text>
        )}
        {yTicks.map((v) => (
          <text
            key={v}
            x={PAD.left - 6}
            y={y(v) + 4}
            textAnchor="end"
            fontSize={G.axisFont}
            fill="var(--color-muted)"
          >
            {Number.isInteger(v) ? v : v.toFixed(1)}
          </text>
        ))}

        {/* Percentile labels ride the right edge of their own curve. */}
        {curves.map((c) => {
          if (!G.labelled.includes(c.percentile)) return null;
          const end = c.points[c.points.length - 1];
          return (
            <text
              key={c.percentile}
              x={PAD.left + PLOT.w + 5}
              y={y(end.value) + 4}
              textAnchor="start"
              fontSize={G.labelFont}
              fontWeight="600"
              fill="var(--color-moss-deep)"
              opacity="0.9"
            >
              {c.percentile}
              {ordinal(c.percentile)}
            </text>
          );
        })}
      </svg>

      <figcaption className="mt-2 text-[13px] leading-[1.55] text-muted">
        {label} in {unit}, by age in months, against the WHO reference curves. The shaded band is
        where most babies sit; the shape of your baby&apos;s own line matters more than which band
        it is in.
      </figcaption>

      {/* The same data as text. An SVG's aria-label can carry the summary but
          not the series, and this is the only form of the chart a screen reader
          can actually read through. */}
      <ul className="sr-only">
        {plotted.map((p, i) => (
          <li key={`${p.takenOn}-sr-${i}`}>
            {p.takenOn}: {p.value} {unit} at {p.month} months
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * Axis values a person would have chosen: 1 / 2 / 2.5 / 5 x 10^n.
 *
 * Quartering the domain gave "1.9, 4.0, 6.0, 8.1, 10.2" — five numbers that
 * carry no relationship to each other and make the gridlines look like an
 * accident. The domain itself is left alone so nothing clips; only the labelled
 * lines snap.
 */
function niceTicks(min: number, max: number, target = 4): number[] {
  const raw = (max - min) / target;
  if (!Number.isFinite(raw) || raw <= 0) return [min];
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    // Floating-point addition drifts: 0.1 + 0.2 lands a tick at 0.30000000000000004.
    out.push(Number(v.toFixed(6)));
  }
  return out;
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
