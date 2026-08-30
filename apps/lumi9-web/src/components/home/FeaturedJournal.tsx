import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { ArticleCard } from "@/components/journal/JournalCards";
import { Icon } from "@/components/ui/Icon";
import { listPosts } from "@/lib/journal";

/**
 * Three journal posts on the home page, where the values bento used to be.
 *
 * ── Why this replaced it ────────────────────────────────────────────────────
 * The values grid said "chemical-free", "12-hour dryness", "thoughtful
 * innovation" — the same five claims the hero, the feature strip and the PDP
 * accordion already make. It was the fourth time a visitor read them before
 * reaching the testimonials, and none of it went anywhere: five cards, no
 * links. The journal is the one thing on this site a new parent might actually
 * want to click at that point in the page, and until now nothing above the
 * footer pointed at it except a nav link.
 *
 * ── Which three ─────────────────────────────────────────────────────────────
 * `listPosts()` already sorts featured-first, then newest, which is exactly the
 * order the /journal listing uses — so the home page shows the same lead
 * articles that page does rather than inventing a second idea of "featured".
 * Mark a post `featured: true` in `src/lib/journal.ts` and it surfaces in both.
 *
 * It renders whatever exists up to three: with two posts it lays out two, and
 * with none it renders nothing at all rather than an empty heading over a gap.
 * That matters more than it looks — the posts move to the database eventually
 * (`listPosts('lumi9')` from `@femi9/core/services/blog`, see CLAUDE.md), and
 * the first thing a fresh `lumi9` schema returns is an empty array.
 *
 * A server component: `listPosts()` is a module read today and a database query
 * later, and neither belongs in the client bundle.
 */
export function FeaturedJournal() {
  const posts = listPosts().slice(0, 3);
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="journal-heading" className="px-safe bg-canvas py-section">
      <div className="mx-auto max-w-[var(--page-max)]">
        <Reveal>
          <div className="mb-[clamp(28px,4vw,48px)] flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div>
              <div className="eyebrow mb-3">From the journal</div>
              <h2
                id="journal-heading"
                className="m-0 max-w-[20ch] text-balance font-display text-[clamp(28px,3.6vw,46px)] leading-[1.1] font-normal"
              >
                Real answers for the 3am questions
              </h2>
            </div>

            {/* Beside the heading on a wide screen, under the cards on a phone —
                the same link either way, so it is rendered once and re-ordered
                rather than duplicated into two hidden copies. */}
            <Link
              href="/journal"
              className="inline-flex items-center gap-2 text-[15px] font-semibold text-moss-deep hover:text-midnight max-sm:hidden coarse:min-h-11"
            >
              Read the journal
              <Icon name="arrowRight" size={17} strokeWidth={1.9} />
            </Link>
          </div>
        </Reveal>

        {/*
          `items-stretch` plus `h-full` on both the wrapper and the card: the
          Reveal is the grid item and the card is its child, so without the pair
          the cards size to their own excerpt and the row ends in a staircase.
          Same reason the values bento needed `auto-rows-fr`.
        */}
        <div className="grid grid-cols-1 items-stretch gap-[clamp(14px,2vw,22px)] sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.slug} className="h-full" delay={i * 70}>
              <ArticleCard
                post={post}
                sizes="(max-width: 640px) 94vw, (max-width: 1024px) 46vw, 380px"
              />
            </Reveal>
          ))}
        </div>

        <Link
          href="/journal"
          className="btn btn-cream mt-7 w-full border-[1.5px] border-moss-deep sm:hidden"
        >
          Read the journal
        </Link>
      </div>
    </section>
  );
}
