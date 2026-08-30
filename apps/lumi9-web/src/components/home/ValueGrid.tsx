"use client";

/**
 * "The values behind every Lumi9 baby diaper."
 *
 * Replaces a row of five equal columns that had three problems, only one of
 * which was cosmetic:
 *
 *   1. RAGGED BOTTOM EDGE. The old grid drew its hairlines with `gap-px` over a
 *      `bg-moss-tint` container — a nice trick, but it only works when every
 *      cell is the same height. Five bodies of different lengths meant the tint
 *      showed through as a staircase along the bottom. Fixed here by giving the
 *      grid explicit rows and letting each card fill its cell (`h-full`), so
 *      the block ends on one straight line no matter how the copy changes.
 *   2. FALSE SEQUENCE. The cards were numbered 01–05. These are values, not
 *      steps: comfort does not happen before protection, and nothing is lost by
 *      reading them in any order. Numbering content that has no order is
 *      decoration wearing the costume of structure, so the numbers are gone.
 *   3. FIVE EQUAL COLUMNS OF PROSE. Equal width told the eye everything mattered
 *      identically, which is the same as saying nothing matters — and it made
 *      the section a wall of text. Comfort is the brand's actual lead claim, so
 *      it now takes a double-height cell and the others sit around it.
 *
 * Interaction is hover/focus lift plus a stroke that draws itself in. It is
 * deliberately NOT a tab set or accordion: `LayerStack` higher up this page is
 * already a `role="tablist"`, and a second one would read as the same component
 * twice. Nothing is hidden behind the interaction either — every word is in the
 * DOM at rest, so the hover is a reward for pointing at something rather than a
 * toll gate in front of the content.
 */

import { VALUES } from "@/lib/content";
import { Reveal } from "@/components/motion/Reveal";

/**
 * One mark per value, in the same stroke vocabulary as the page's marginalia
 * (round caps, no fill) so the section belongs to the same hand.
 * Keyed by index — `VALUES` is a fixed editorial list, not user data.
 */
const MARKS: string[] = [
  // Comfort — a soft cloud.
  "M8 26c-4 0-7-3-7-6.5S4 13 8 13c.6-4.6 4.4-8 9-8s8.4 3.4 9 8c3.4.3 6 2.9 6 6.2 0 3.4-2.9 6.8-6.6 6.8H8Z",
  // Protection — a shield.
  "M17 3l12 4.2v8C29 23 24 29.4 17 31 10 29.4 5 23 5 15.2v-8L17 3Zm-4.4 13.6l3.2 3.2 6.2-6.2",
  // Safety-conscious care — a leaf with its midrib.
  "M29 5C12 5 5 12.5 5 21c0 3 1.4 6 1.4 6S9 13 29 9.5c0 0-4 11.5-14.5 13.5M6.4 27C10 21 16 16 22 13.5",
  // Thoughtful innovation — a lamp with rays.
  "M17 4a8 8 0 0 0-5 14.3V22h10v-3.7A8 8 0 0 0 17 4Zm-4 22h8m-6 3h4M17 1v-1M6 8L4.5 7M28 8l1.5-1",
  // Easy-to-find fit — a ruler. Three long ticks rather than five short ones:
  // at 24px the dense version collapsed into a solid smear.
  "M3 12h28v10H3V12Zm7 0v5m7-5v5m7-5v5",
];

function ValueCard({
  title,
  body,
  mark,
  feature = false,
}: {
  title: string;
  body: string;
  mark: string;
  feature?: boolean;
}) {
  return (
    /*
      `group` drives the hover; `focus-within` mirrors it so the card also
      responds to a keyboard user tabbing to a link inside it later. The lift is
      `translate-y`, never `margin` or `top` — those are layout properties and
      would reflow the whole grid 60 times a second on hover.
    */
    <div
      className={[
        "group relative flex h-full flex-col gap-3 rounded-card p-card",
        "border border-moss-tint/70 transition-[transform,box-shadow,background-color]",
        "duration-300 ease-reveal will-change-transform",
        "hover:-translate-y-1 hover:shadow-lift focus-within:-translate-y-1",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        // The lead card owns a double-height cell but carries one short
        // paragraph, so top-aligning it left a third of the card empty and the
        // asymmetry read as a mistake rather than a choice. Centring the stack
        // puts that space on BOTH sides of the text, where it reads as air.
        feature ? "bg-moss-tint/45 hover:bg-moss-tint/60 lg:justify-center" : "bg-canvas hover:bg-paper",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "grid shrink-0 place-items-center rounded-full transition-colors duration-300",
          feature ? "size-14 bg-canvas text-moss-deep" : "size-11 bg-moss-tint/60 text-moss-deep",
          "group-hover:bg-moss-deep group-hover:text-butter",
        ].join(" ")}
      >
        <svg
          viewBox="0 0 34 34"
          className={feature ? "size-7" : "size-6"}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={mark} vectorEffect="non-scaling-stroke" />
        </svg>
      </span>

      <h3
        className={[
          "font-display font-semibold leading-[1.15] text-midnight",
          feature ? "text-[clamp(20px,2.2vw,27px)]" : "text-[clamp(16px,1.5vw,19px)]",
        ].join(" ")}
      >
        {title}
      </h3>

      <p
        className={[
          "text-pretty text-muted",
          feature ? "text-[clamp(14px,1.2vw,16px)] leading-[1.6]" : "text-[13.5px] leading-[1.55]",
        ].join(" ")}
      >
        {body}
      </p>

      {/* A hairline that draws in from the left on hover — the one flourish, and
          it reads as underlining a point rather than as an animation.

          `mt-auto` only on the small cards. An auto margin absorbs all the free
          space in a flex column, which would silently cancel the lead card's
          `justify-center` and drop its text back to the top. */}
      <span
        aria-hidden="true"
        className={[
          "h-[2px] w-0 rounded-full bg-moss-deep/70 transition-[width]",
          "duration-400 ease-reveal group-hover:w-12 motion-reduce:transition-none",
          feature ? "mt-1" : "mt-auto",
        ].join(" ")}
      />
    </div>
  );
}

export function ValueGrid() {
  const [lead, ...rest] = VALUES;

  return (
    <section aria-labelledby="values-heading" className="px-safe bg-canvas py-section">
      <div className="mx-auto max-w-[1180px]">
        <Reveal>
          <h2
            id="values-heading"
            className="m-0 mb-[clamp(32px,4.6vw,56px)] text-balance text-center font-display text-[clamp(28px,3.6vw,46px)] font-bold leading-[1.1]"
          >
            The values behind every Lumi9 baby diaper
          </h2>
        </Reveal>

        {/*
          One column on a phone, two on a tablet, then the bento: three columns
          where the lead value holds a double-height cell on the left.
          `auto-rows-fr` is what forces every row to an equal share, which is
          what actually removes the ragged edge — without it the row heights
          follow their content again and the block ends unevenly.
        */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:auto-rows-fr lg:grid-cols-3">
          {/* `h-full` on the Reveal wrappers as well as the cards: grid items
              stretch by default, but the wrapper is the grid item and the card
              is its child — without it the card sizes to its own text and the
              staircase comes straight back. */}
          <Reveal className="h-full lg:row-span-2">
            <ValueCard title={lead.title} body={lead.body} mark={MARKS[0]} feature />
          </Reveal>

          {rest.map((value, i) => (
            <Reveal key={value.title} className="h-full" delay={(i + 1) * 60}>
              <ValueCard title={value.title} body={value.body} mark={MARKS[i + 1]} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
