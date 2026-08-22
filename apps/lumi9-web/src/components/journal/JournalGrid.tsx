"use client";

import Image from "next/image";
import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { JOURNAL_CATEGORIES, POSTS, type JournalCategory } from "@/lib/content";

/** Category chips + filterable post grid. */
export function JournalGrid() {
  const [category, setCategory] = useState<JournalCategory>("All");
  const posts = POSTS.filter((post) => category === "All" || post.category === category);

  return (
    <>
      <div className="scroll-row px-safe mx-auto max-w-[1180px] gap-2.5 pb-10 sm:flex-wrap sm:justify-center">
        {JOURNAL_CATEGORIES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={category === option}
            onClick={() => setCategory(option)}
            className="chip whitespace-nowrap"
          >
            {option}
          </button>
        ))}
      </div>

      <section className="px-safe pb-section">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-[clamp(16px,2.4vw,28px)] sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Reveal
              key={post.title}
              as="article"
              className="flex flex-col overflow-hidden rounded-card border border-moss-tint bg-canvas"
            >
              <div className="relative aspect-3/2 overflow-hidden bg-shell">
                <Image
                  src={post.image}
                  alt={post.title}
                  fill
                  sizes="(max-width: 640px) 94vw, (max-width: 1024px) 46vw, 380px"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-1 flex-col p-card">
                <div className="mb-3 text-[12px] font-bold tracking-[0.14em] text-moss-deep uppercase">
                  {post.category}
                </div>
                <h3 className="m-0 mb-3 font-display text-[clamp(18px,2vw,22px)] font-normal leading-[1.2] tracking-[-0.01em] text-midnight">
                  {post.title}
                </h3>
                <p className="m-0 mb-5 text-[clamp(13px,1.2vw,14px)] leading-[1.6] text-muted">{post.excerpt}</p>
                <div className="mt-auto text-[13px] text-muted">{post.meta}</div>
              </div>
            </Reveal>
          ))}
        </div>

        {posts.length === 0 && (
          <p className="mx-auto max-w-[1180px] text-center text-base text-muted">
            No posts in this category yet — check back soon.
          </p>
        )}
      </section>
    </>
  );
}
