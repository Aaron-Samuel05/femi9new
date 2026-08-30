"use client";

import { useMemo, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { ArticleCard } from "@/components/journal/JournalCards";
import type { JournalArticle, JournalCategoryDTO } from "@/lib/journal.server";

/**
 * "The latest" — category chips over a filterable grid.
 *
 * The chips are a filter, not a tab set: plain buttons carrying `aria-pressed`,
 * inside a labelled group. Declaring `role="tablist"`/`role="tab"` without a
 * matching tabpanel makes a screen reader announce "tab 3 of 5" and then find
 * nothing to move into, which is worse than no ARIA at all.
 */
export function JournalGrid({ posts, categories }: { posts: JournalArticle[]; categories: JournalCategoryDTO[] }) {
  const [filter, setFilter] = useState<string>("All");

  const filtered = useMemo(
    () => (filter === "All" ? posts : posts.filter((post) => post.category === filter)),
    [filter, posts],
  );

  const options = ["All", ...categories.map((category) => category.name)];

  return (
    <section className="px-safe pb-section" id="latest">
      <div className="mx-auto max-w-[var(--page-max)]">
        <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <h2 className="m-0 font-display text-[clamp(26px,6.4vw,44px)] leading-[1.05] font-normal md:text-[clamp(30px,3.6vw,44px)]">
            The latest
          </h2>
          {/* -mx-* + px-* so the row can scroll edge-to-edge on a phone while the
              first chip still lines up with the page gutter. */}
          <div
            role="group"
            aria-label="Filter articles by topic"
            className="scroll-row -mx-[max(var(--spacing-gutter),env(safe-area-inset-left))] gap-2.5 px-[max(var(--spacing-gutter),env(safe-area-inset-left))] py-1 md:mx-0 md:flex-wrap md:px-0"
          >
            {options.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className="chip whitespace-nowrap"
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div
          aria-live="polite"
          className="grid grid-cols-1 gap-[clamp(16px,2.4vw,28px)] sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((post, i) => (
            <Reveal key={post.slug} as="article" delay={i * 60} className="h-full">
              <ArticleCard post={post} />
            </Reveal>
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="m-0 py-10 text-center text-base text-muted">
            No posts in this topic yet — check back soon.
          </p>
        )}
      </div>
    </section>
  );
}
