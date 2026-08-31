/**
 * Hand-drawn marginalia - leaves, clouds, stars, sparkles.
 *
 * These are the cheapest, highest-leverage anti-generated signal on the whole
 * page. A section that is a rectangle of text on a flat field reads as output;
 * the same section with two or three drawn marks in its margins reads as a page
 * somebody laid out. lumi9.in scatters exactly this vocabulary - leaf, cloud,
 * star, heart - through its cream bands.
 *
 * Three rules hold them together, and all three are what stop this from
 * becoming decoration for its own sake:
 *
 *   1. STROKE, never fill. A filled icon reads as an icon - UI furniture. An
 *      open stroke with a round cap reads as a pen mark. `vector-effect` keeps
 *      that stroke the same visual weight no matter what size it is scaled to,
 *      so a 16px sparkle and a 96px leaf look drawn by the same hand.
 *   2. Off-axis by default. Every mark carries a rotation that is not a
 *      multiple of 45°. Axis-aligned scatter is the tell that a machine placed
 *      them.
 *   3. `aria-hidden`, always. They carry no meaning; a screen reader announcing
 *      "image" four times per section is a real cost for zero information.
 *
 * They are also `pointer-events-none` - a decorative mark that eats a click
 * near a CTA is a bug that only shows up on touch.
 */

import type { CSSProperties } from "react";

type Mark = "leaf" | "cloud" | "star" | "sparkle" | "heart";

const PATHS: Record<Mark, string> = {
  // A single leaf with its midrib - two strokes, the way you'd actually draw it.
  leaf: "M20 4C11 8 4 15 4 24c9 0 16-7 16-20ZM12 16c3-4 6-8 8-12",
  // Three arcs, deliberately unequal - an even cloud looks stamped.
  cloud: "M4 18c0-4 3-6 6-5 1-4 6-6 9-3 3-1 6 1 6 4 3 0 4 2 4 4H4Z",
  // Five-point star, open.
  star: "M14 3l3.2 7.2 7.8.8-5.8 5.2 1.6 7.6L14 20l-6.8 3.8 1.6-7.6L3 11l7.8-.8Z",
  // A four-point twinkle - the concave-sided kind, not a plus sign.
  sparkle: "M12 2c.6 5.4 3.9 8.7 9.3 9.3-5.4.6-8.7 3.9-9.3 9.3-.6-5.4-3.9-8.7-9.3-9.3C8.1 10.7 11.4 7.4 12 2Z",
  heart: "M14 24S4 17.6 4 11.3A5.3 5.3 0 0 1 14 8.6a5.3 5.3 0 0 1 10 2.7C24 17.6 14 24 14 24Z",
};

const VIEWBOX: Record<Mark, string> = {
  leaf: "0 0 28 28",
  cloud: "0 0 28 24",
  star: "0 0 28 28",
  sparkle: "0 0 24 24",
  heart: "0 0 28 28",
};

export function Doodle({
  mark,
  size = 28,
  rotate = 0,
  className = "",
  style,
}: {
  mark: Mark;
  size?: number;
  /** Degrees. Keep it off the 45° grid - see rule 2 above. */
  rotate?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={VIEWBOX[mark]}
      width={size}
      height={size}
      className={`pointer-events-none select-none ${className}`}
      style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, ...style }}
    >
      <path
        d={PATHS[mark]}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A pre-scattered field of marks for a section's margins.
 *
 * The positions are hand-picked and asymmetric - deliberately NOT generated
 * from a loop with even spacing, which is what produces the "confetti border"
 * look. Each entry hides below a breakpoint where it would crowd the text;
 * on a phone only two survive.
 */
const SCATTER: Array<{
  mark: Mark;
  className: string;
  size: number;
  rotate: number;
}> = [
  { mark: "leaf", className: "left-[3%] top-[14%] text-moss-soft/55", size: 34, rotate: -22 },
  { mark: "star", className: "right-[6%] top-[9%] text-gold/45 hidden sm:block", size: 22, rotate: 13 },
  { mark: "cloud", className: "right-[3%] bottom-[22%] text-moss-soft/40 hidden md:block", size: 44, rotate: -6 },
  { mark: "sparkle", className: "left-[8%] bottom-[12%] text-gold/40 hidden lg:block", size: 20, rotate: 17 },
  { mark: "leaf", className: "right-[14%] top-[46%] text-moss-soft/35 hidden lg:block", size: 26, rotate: 128 },
];

export function DoodleField({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {SCATTER.map((d, i) => (
        <Doodle
          key={i}
          mark={d.mark}
          size={d.size}
          rotate={d.rotate}
          className={`absolute ${d.className}`}
        />
      ))}
    </div>
  );
}
