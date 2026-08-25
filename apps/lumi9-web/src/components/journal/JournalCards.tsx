import Image from "next/image";
import Link from "next/link";
import { categoryMeta, formatPostDate, type JournalPost } from "@/lib/journal";

/** author · date · read time, the byline used on every card and on the article. */
export function PostMeta({ post, className = "" }: { post: JournalPost; className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted ${className}`}>
      <b className="font-semibold text-midnight">{post.author}</b>
      <i aria-hidden className="inline-block size-1 rounded-full bg-moss-soft not-italic" />
      <time dateTime={post.published}>{formatPostDate(post.published)}</time>
      <i aria-hidden className="inline-block size-1 rounded-full bg-moss-soft not-italic" />
      {post.readTime} min read
    </span>
  );
}

/** Small tinted category label. Colour comes from the category, not the card. */
export function CategoryChip({ name, className = "" }: { name: string; className?: string }) {
  const { color, tint } = categoryMeta(name);
  return (
    <span
      className={`inline-flex items-center rounded-pill px-3 py-1 text-[11px] font-bold tracking-[0.14em] uppercase ${className}`}
      style={{ background: tint, color }}
    >
      {name}
    </span>
  );
}

/**
 * Standard editorial card — the listing grid and "Keep reading".
 *
 * The whole card is one link rather than a card with a link inside it, so the
 * hit area on a phone is the card and not just the headline. That is also why
 * everything inside is a `span`: an anchor may not contain block-level flow
 * content, and a stray <p> here produces invalid, unpredictably-parsed markup.
 */
export function ArticleCard({ post, sizes }: { post: JournalPost; sizes?: string }) {
  return (
    <Link
      href={`/journal/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-card border border-moss-tint bg-canvas transition-shadow duration-200 hover:shadow-card"
    >
      <span className="relative block aspect-3/2 overflow-hidden bg-shell">
        <Image
          src={post.image}
          alt={post.imageAlt}
          fill
          sizes={sizes ?? "(max-width: 640px) 94vw, (max-width: 1024px) 46vw, 380px"}
          className="object-cover transition-transform duration-500 ease-[var(--ease-reveal)] group-hover:scale-[1.03]"
        />
      </span>
      <span className="flex flex-1 flex-col p-card">
        <CategoryChip name={post.category} className="mb-3.5 self-start" />
        <h3 className="m-0 mb-3 font-display text-[clamp(18px,2vw,22px)] leading-[1.2] font-normal tracking-[-0.01em] text-midnight">
          {post.title}
        </h3>
        <span className="m-0 mb-5 block text-[clamp(13px,1.2vw,14px)] leading-[1.6] text-muted">{post.excerpt}</span>
        <PostMeta post={post} className="mt-auto" />
      </span>
    </Link>
  );
}

/**
 * Full-bleed overlay tile for the featured mosaic.
 *
 * `priority` is reserved for the lead tile — it is the listing's LCP element at
 * every viewport, and lazy-loading it costs a visible chunk of that metric.
 */
export function MosaicTile({
  post,
  big = false,
  priority = false,
}: {
  post: JournalPost;
  big?: boolean;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/journal/${post.slug}`}
      className={`group relative flex overflow-hidden rounded-media bg-shell ${
        big ? "min-h-[clamp(260px,42vw,420px)] md:col-span-2 md:row-span-2" : "min-h-[clamp(180px,26vw,200px)]"
      }`}
    >
      <Image
        src={post.image}
        alt={post.imageAlt}
        fill
        priority={priority}
        sizes={big ? "(max-width: 768px) 94vw, 620px" : "(max-width: 768px) 94vw, 300px"}
        className="object-cover transition-transform duration-700 ease-[var(--ease-reveal)] group-hover:scale-[1.04]"
      />
      {/* Scrim, not a flat overlay: the headline needs contrast at the bottom
          without dulling the photograph the tile exists to show. */}
      <span className="relative z-1 mt-auto flex w-full flex-col gap-2 bg-gradient-to-t from-midnight/85 via-midnight/45 to-transparent p-[clamp(16px,2vw,26px)] pt-[clamp(40px,6vw,72px)]">
        <span className="text-[11px] font-bold tracking-[0.14em] text-butter uppercase">{post.category}</span>
        <h3
          className={`m-0 font-display leading-[1.14] font-normal text-canvas ${
            big ? "text-[clamp(20px,3.2vw,32px)]" : "text-[clamp(15px,1.7vw,19px)]"
          }`}
        >
          {post.title}
        </h3>
        <span className="text-[13px] text-canvas/80">{post.readTime} min read</span>
      </span>
    </Link>
  );
}
