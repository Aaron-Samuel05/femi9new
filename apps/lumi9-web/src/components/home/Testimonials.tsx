/**
 * "Loved by Parents" — two opposing marquee rows.
 *
 * The reviews used to sit in a static 4×2 grid. As a carousel the same eight
 * cards do more work: counter-scrolling rows read as an endless supply of
 * opinion rather than a curated set of eight, which is the whole argument a
 * review section is making. Two directions rather than one because two rows
 * travelling together just look like one wide thing sliding; opposed, each row
 * gives the other a reference frame and the motion becomes legible.
 *
 * Everything below exists because a moving wall of text is hostile by default:
 *
 *   · SEAMLESS LOOP. Each track holds the row's cards TWICE and travels exactly
 *     -50%. At that point copy 2 sits precisely where copy 1 started, so the
 *     reset is invisible. Any other distance shows a jump. The duplicate is
 *     `aria-hidden` — it is the same eight reviews, and a screen reader
 *     announcing all sixteen would imply twice the social proof.
 *   · PAUSE ON HOVER AND FOCUS. `group-hover` and `focus-within` both stop the
 *     track, so a mouse user can finish a sentence and a keyboard user tabbing
 *     into a card is not dragged away from it mid-read.
 *   · REDUCED MOTION. The animation is applied through `motion-safe:`, so at
 *     `prefers-reduced-motion: reduce` the tracks simply do not move. The row
 *     stays a horizontally scrollable strip — the content is all still
 *     reachable, it just waits to be asked for.
 *   · NO PAGE OVERFLOW. Tracks are `w-max` inside an `overflow-hidden` rail,
 *     so the wide content never widens the document. This is what keeps the
 *     320px viewport at zero horizontal scroll.
 *
 * The edge fade is a mask on the rail, not a pair of gradient overlays: an
 * overlay has to hard-code the section's background colour to fake a fade, and
 * would show as two grey smears the moment that background changed.
 */

import { listReviews } from "@femi9/core/services/products";
import { Doodle } from "@/components/ui/Doodles";
import { Reveal } from "@/components/motion/Reveal";

/**
 * The rail reads the console's moderation queue.
 *
 * `PARENT_REVIEWS` in `content.ts` was eight invented quotes under a "Verified
 * buyer" badge — a claim about people who did not exist, on a surface the
 * console has a moderation queue for. Approved rows only, so approving or
 * hiding a review in the console is what changes this rail.
 */
const TONES = [
  "bg-moss-tint text-moss-deep",
  "bg-butter text-[#7a6500]",
  "bg-[#f3e0d4] text-[#8a4f2c]",
  "bg-[#dfe8ee] text-[#3d5c72]",
  "bg-[#ece0ee] text-[#6d4276]",
];

/** What a card needs, resolved on the server so the rail stays presentational. */
interface Review {
  id: string;
  name: string;
  initial: string;
  tone: string;
  quote: string;
  rating: number;
  verified: boolean;
}

function Stars({ rating }: { rating: number }) {
  // Clamped, because a card that renders `rating` stars unclamped turns a bad
  // row into a broken layout rather than a visible data problem.
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex gap-[2px]" role="img" aria-label={`Rated ${filled} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`size-[13px] ${i < filled ? "text-gold" : "text-midnight/15"}`}
        >
          <path
            fill="currentColor"
            d="M10 1.6l2.4 5.1 5.6.6-4.2 3.8 1.2 5.5L10 13.9 4.99 16.6l1.2-5.5L2 7.3l5.6-.6Z"
          />
        </svg>
      ))}
    </div>
  );
}

function ReviewCard({ r }: { r: Review }) {
  return (
    // Fixed width: a marquee cannot use intrinsic widths, or the loop distance
    // stops matching -50% and the seam drifts as fonts load.
    <figure className="flex w-[290px] shrink-0 flex-col gap-3 rounded-card border border-midnight/8 bg-canvas p-5 shadow-soft sm:w-[320px]">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-800 ${r.tone}`}
        >
          {r.initial}
        </span>
        <div className="min-w-0">
          <Stars rating={r.rating} />
          <figcaption className="truncate text-[13px] font-700 text-midnight">{r.name}</figcaption>
        </div>
      </div>

      <blockquote className="text-pretty text-[14px] leading-[1.55] text-midnight/75">{r.quote}</blockquote>

      {/* Printed ONLY for a reviewer whose paid order actually contains the
          product. It used to be unconditional, over invented names. */}
      {r.verified && (
      <p className="mt-auto flex items-center gap-1.5 pt-1 text-[11px] font-700 uppercase tracking-[0.06em] text-moss-deep">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5">
          <path
            fill="currentColor"
            d="M8 0l1.9 1.4 2.3-.3.9 2.2 2 1.2-.7 2.2.7 2.2-2 1.2-.9 2.2-2.3-.3L8 14l-1.9-1.4-2.3.3-.9-2.2-2-1.2.7-2.2L.9 5l2-1.2.9-2.2 2.3.3Z"
          />
          <path fill="var(--color-canvas)" d="M6.9 9.9L4.8 7.8l.9-.9 1.2 1.2 3-3 .9.9Z" />
        </svg>
        Verified buyer
      </p>
      )}
    </figure>
  );
}

/**
 * One rail. `reverse` sends it left-to-right instead of right-to-left.
 *
 * The rail is the scroll container and the track is the moving thing — they
 * cannot be the same element, because animating `transform` on a scroller
 * fights the scroll position.
 */
function MarqueeRow({ items, reverse = false }: { items: readonly Review[]; reverse?: boolean }) {
  return (
    <div
      className="group relative overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      // Fades both ends into whatever is behind, without knowing its colour.
      style={{
        maskImage: "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
      }}
    >
      {/*
        The two copies must be EXACTLY equal in width or -50% lands mid-card and
        the loop visibly jumps once per cycle. That means the outer track carries
        NO gap of its own and each copy owns its internal gaps plus one trailing
        gap (`pr-4`) — so a copy is `4×card + 4×gap`, both times. Putting the gap
        on the track instead adds one extra gap to the first copy only, which is
        the version of this bug that survives review because it is a 16px drift
        that only shows on every second lap.
      */}
      <div
        className={[
          "flex w-max py-2",
          reverse ? "motion-safe:animate-marquee-rev" : "motion-safe:animate-marquee",
          // Let people actually read the thing they hovered.
          "group-hover:[animation-play-state:paused]",
          "group-focus-within:[animation-play-state:paused]",
        ].join(" ")}
      >
        {/* Copy 1 — the real list. Copy 2 — the loop's tail, hidden from AT. */}
        <div className="flex gap-4 pr-4">
          {items.map((r) => (
            <ReviewCard key={`a-${r.id}`} r={r} />
          ))}
        </div>
        <div className="flex gap-4 pr-4" aria-hidden="true">
          {items.map((r) => (
            <ReviewCard key={`b-${r.id}`} r={r} />
          ))}
        </div>
      </div>
    </div>
  );
}

export async function Testimonials() {
  /**
   * Brand-wide, not per product: this rail is the site's social proof, and a
   * parent scrolling the home page has not chosen a size yet.
   *
   * Capped at twelve because the marquee renders each row TWICE (the second copy
   * is the loop's tail) — so twelve rows is twenty-four cards, and an uncapped
   * read would put every review the brand has ever collected into the home
   * page's HTML.
   */
  const rows = await listReviews("lumi9", { limit: 12 });

  // Nothing approved yet: render nothing rather than a heading claiming parents
  // love us over an empty rail.
  if (rows.length === 0) return null;

  const reviews: Review[] = rows.map((row, i) => ({
    id: row.id,
    name: row.name,
    // Never the empty string — a blank avatar circle reads as a failed image.
    initial: row.name.trim().charAt(0).toUpperCase() || "\u2022",
    // The tint cycles by position rather than being stored: it is decoration,
    // and a colour column is one more thing for a moderator to have to set.
    tone: TONES[i % TONES.length],
    quote: row.body,
    rating: row.rating,
    verified: row.verified,
  }));

  // Two rows travelling in opposite directions.
  const half = Math.ceil(reviews.length / 2);
  const rowTop = reviews.slice(0, half);
  const rowBottom = reviews.slice(half);

  return (
    <section aria-labelledby="reviews-heading" className="relative overflow-hidden bg-paper py-section">
      <div className="page-wrap">
        <Reveal>
          <div className="relative mx-auto max-w-[46ch] text-center">
            <Doodle
              mark="sparkle"
              size={22}
              rotate={-14}
              className="absolute -left-2 -top-3 text-gold/60 sm:-left-8"
            />
            <Doodle
              mark="heart"
              size={22}
              rotate={11}
              className="absolute -right-2 -top-2 text-moss-soft/60 sm:-right-8"
            />
            <h2
              id="reviews-heading"
              className="text-balance font-display text-[clamp(26px,3.4vw,40px)] font-700 leading-[1.12] text-moss-deep"
            >
              Loved by parents, trusted by experts
            </h2>
            <p className="mt-3 text-[15px] text-muted">Real stories from real parents.</p>
          </div>
        </Reveal>
      </div>

      {/* Full-bleed on purpose: a marquee that stops at the content gutter reads
          as a boxed widget, where one running edge-to-edge reads as a feed. */}
      <div className="mt-9 flex flex-col gap-4">
        <MarqueeRow items={rowTop} />
        {rowBottom.length > 0 && <MarqueeRow items={rowBottom} reverse />}
      </div>
    </section>
  );
}
