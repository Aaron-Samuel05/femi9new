/**
 * Scalloped section edges.
 *
 * lumi9.in ends its green bands in a row of half-circles rather than a straight
 * rule. It is the single most recognisable thing about that page's structure —
 * a hard horizontal edge between two colour fields is what makes a layout read
 * as a stack of generated blocks, and the scallop is what stops it.
 *
 * Built from a repeating radial-gradient MASK rather than an SVG path, for two
 * reasons that both bite in practice:
 *
 *   1. An `<svg preserveAspectRatio="none">` divider stretches its bumps as the
 *      viewport widens — at 1920px the semicircles become flat ellipses, and on
 *      a phone they turn into spikes. A mask tiles at a FIXED pixel size, so a
 *      bump is the same bump at every width. That is why the scallop survives
 *      the responsive gates instead of needing a breakpoint per size.
 *   2. The band is a real background, so it inherits whatever colour token the
 *      caller passes and needs no second copy of the palette in an SVG fill.
 *
 * Geometry: the tile is `2r` wide and `r` tall, and the circle has radius `r`
 * anchored on the edge — so consecutive bumps touch exactly, with no sliver of
 * background between them and no overlap darkening the seam.
 */

type ScallopProps = {
  /** Any CSS colour — pass a token, e.g. `var(--color-moss)`. */
  color: string;
  /** `down` hangs bumps below a band; `up` sits them on top of the next one. */
  direction?: "down" | "up";
  /** Bump radius in px. Also the strip's height. */
  radius?: number;
  className?: string;
};

export function Scallop({ color, direction = "down", radius = 14, className = "" }: ScallopProps) {
  // Anchor the circle on the edge the bumps grow away from.
  const anchor = direction === "down" ? "50% 0" : "50% 100%";
  // 99%/100% rather than a hard stop: a 1% feather is what keeps the curve from
  // aliasing into a staircase on non-retina displays.
  const mask = `radial-gradient(circle ${radius}px at ${anchor}, #000 99%, #0000 100%)`;

  return (
    <div
      aria-hidden="true"
      className={`w-full shrink-0 ${className}`}
      style={{
        height: radius,
        background: color,
        maskImage: mask,
        WebkitMaskImage: mask,
        maskSize: `${radius * 2}px ${radius}px`,
        WebkitMaskSize: `${radius * 2}px ${radius}px`,
        maskRepeat: "repeat-x",
        WebkitMaskRepeat: "repeat-x",
      }}
    />
  );
}

/**
 * The softer sibling: one long asymmetric curve instead of a row of bumps.
 *
 * Used where a scallop would be too busy — between two large photographic
 * sections, where the eye wants a horizon rather than a trim. Asymmetric on
 * purpose: a perfectly symmetrical arc reads as a default shape, and the whole
 * point of the divider is that a human chose where the curve peaks.
 *
 * This one DOES stretch with `preserveAspectRatio="none"`, and that is correct
 * here — a single curve reads as intentional at any aspect, unlike a bump row.
 */
export function WaveEdge({
  color,
  flip = false,
  className = "",
}: {
  color: string;
  flip?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 48"
      preserveAspectRatio="none"
      className={`block w-full ${className}`}
      style={{ height: "clamp(24px, 3.2vw, 48px)", transform: flip ? "scaleY(-1)" : undefined }}
    >
      <path d="M0 24 C 240 2, 520 46, 780 26 S 1220 0, 1440 18 L1440 48 L0 48 Z" fill={color} />
    </svg>
  );
}
