/**
 * The claim strip that sits directly under the hero.
 *
 * lumi9.in runs five claims across a butter-coloured band immediately below the
 * fold-line, separated by hairline rules. It does real work beyond decoration:
 * it answers "what is this product actually for" before the visitor has scrolled
 * once, which is the job a hero subhead usually fails at.
 *
 * Two details are load-bearing:
 *
 *   · SEPARATORS, not cards. The obvious build is five rounded boxes in a grid,
 *     and that is exactly what makes a claim row read as generated — five
 *     identical containers with an icon centred in each. Hairline dividers
 *     between free-standing items read as a printed strapline instead.
 *   · The rule is drawn with a `before` pseudo-element that is suppressed on the
 *     first item of each visual row. At three columns that is items 1 and 4, at
 *     two it is 1, 3 and 5 — hence the `nth-child` pairs rather than a single
 *     `first:` rule, which would leave an orphan rule floating at the start of
 *     row two.
 *
 * Icons are inline strokes, sharing the Doodle vocabulary (round caps, no fill)
 * so the strip and the marginalia look like one hand.
 */

import { FEATURE_STRIP } from "@/lib/content";

const ICONS: Record<string, string> = {
  cloud: "M4 17c0-3.6 2.7-5.4 5.4-4.5C10.3 8.2 15.8 6.4 19 9.6c2.7-.9 5 1.4 5 4.4 2.3 0 3 1.5 3 3H4Z",
  drop: "M14 3s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12Z",
  shield: "M14 3l9 3.4v6.2c0 5.6-3.8 10-9 11.4-5.2-1.4-9-5.8-9-11.4V6.4L14 3Z",
  air: "M3 10h12a3 3 0 1 0-3-3M3 15h16a3 3 0 1 1-3 3M3 20h9",
  leaf: "M23 5C10 5 5 11 5 18c0 2 1 4 1 4s2-11 17-13c0 0-3 9-11 11",
};

export function FeatureStrip() {
  return (
    <section aria-label="What Cloud Soft does" className="relative z-2 bg-butter/55">
      <div className="page-wrap grid grid-cols-2 gap-y-6 py-7 sm:grid-cols-3 lg:grid-cols-5">
        {FEATURE_STRIP.map((f) => (
          <div
            key={f.label}
            className={[
              "relative flex min-w-0 items-center gap-3 px-3 sm:px-5",
              // Hairline between items — suppressed at the start of every row.
              "before:absolute before:left-0 before:top-1/2 before:h-7 before:w-px",
              "before:-translate-y-1/2 before:bg-midnight/15 before:content-['']",
              "nth-[2n+1]:before:hidden",
              "sm:nth-[2n+1]:before:block sm:nth-[3n+1]:before:hidden",
              "lg:nth-[3n+1]:before:block lg:nth-[5n+1]:before:hidden",
            ].join(" ")}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 28 28"
              className="size-6 shrink-0 text-moss-deep"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={ICONS[f.icon]} vectorEffect="non-scaling-stroke" />
            </svg>
            {/* `text-balance` keeps two-word claims from orphaning a word onto
                its own line at the awkward 2-column phone width. */}
            <span className="min-w-0 text-pretty text-[13px] font-600 leading-[1.25] text-midnight/85">
              {f.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
