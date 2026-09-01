"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AddButton } from "@/components/product/AddButton";
import { inr, leadPack, packDiscountPct } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";

const SIZE_FILTERS = ["All", "NB", "S", "M", "L", "XL"] as const;
const SORTS = ["Featured", "Price: low to high", "Price: high to low"] as const;

type SizeFilter = (typeof SIZE_FILTERS)[number];
type Sort = (typeof SORTS)[number];

/** Collection grid: size filter chips + sort, cards link through to the PDP. */
export function ShopBrowser() {
  const { sizes } = useCatalogData();
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("All");
  const [sort, setSort] = useState<Sort>("Featured");

  const products = useMemo(() => {
    const rows = sizes.filter((size) => sizeFilter === "All" || size.size === sizeFilter).map((size) => ({
      size,
      // Leads with the tier priced at `basePrice` - the same pick the PDP
      // opens on, so the grid and the product page cannot quote different
      // prices. Femi9 chooses its default variant by the same rule
      // (`packVariants.find(v => v.price === price)`).
      pack: leadPack(size),
    }));

    if (sort === "Price: low to high") rows.sort((a, b) => a.pack.price - b.pack.price);
    if (sort === "Price: high to low") rows.sort((a, b) => b.pack.price - a.pack.price);
    return rows;
  }, [sizes, sizeFilter, sort]);

  return (
    <section className="page-wrap grid grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] pt-6 pb-section md:grid-cols-[minmax(180px,220px)_1fr]">
      <aside className="flex flex-col gap-[clamp(16px,2.4vw,26px)] md:sticky md:top-24">
        <div>
          <h2 className="mb-3 text-[13px] font-bold tracking-[0.1em] text-midnight">SIZE</h2>
          {/* filters scroll sideways on phones, stack in the rail from md up */}
          <div className="scroll-row gap-2 max-md:-mx-[var(--spacing-gutter)] max-md:px-[var(--spacing-gutter)] md:flex-col">
            {SIZE_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                aria-pressed={sizeFilter === filter}
                onClick={() => setSizeFilter(filter)}
                className={`min-h-11 min-w-11 cursor-pointer rounded-chip border-[1.5px] px-3.5 py-2.5 text-center text-sm font-semibold whitespace-nowrap transition-colors ${
                  sizeFilter === filter
                    ? "border-midnight bg-midnight text-butter"
                    : "border-moss-tint text-midnight hover:border-moss-soft"
                }`}
              >
                {filter === "All" ? "All sizes" : filter}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[13px] font-bold tracking-[0.1em] text-midnight" id="sort-label">
            SORT BY
          </h2>
          {/* The three labels need ~440px side by side. In the phone scroller they
              overflowed with the last option cut at the edge, and - being flat
              text until selected - they did not read as controls at all. A native
              select always fits, and hands sorting to the OS picker. */}
          <select
            aria-labelledby="sort-label"
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="field cursor-pointer py-3 md:hidden"
          >
            {SORTS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <div className="max-md:hidden md:flex md:flex-col md:gap-2">
            {SORTS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={sort === option}
                onClick={() => setSort(option)}
                className={`min-h-11 cursor-pointer rounded-chip px-3.5 py-2.25 text-left text-sm font-medium whitespace-nowrap transition-colors ${
                  sort === option ? "bg-moss-tint text-midnight" : "text-muted hover:text-midnight"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <div>
        <div className="mb-5.5 text-sm text-muted" aria-live="polite">
          {products.length} {products.length === 1 ? "product" : "products"}
        </div>

        <div className="grid grid-cols-2 gap-[clamp(10px,1.8vw,24px)] min-[560px]:grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
          {products.map(({ size, pack }) => {
            const href = `/product/${size.size.toLowerCase()}`;
            return (
              <div
                key={size.size}
                className="flex flex-col rounded-card border border-moss-tint bg-canvas p-[clamp(12px,1.4vw,18px)]"
              >
                <Link href={href} className="relative mb-4 block aspect-4/5 overflow-hidden rounded-chip bg-shell">
                  <Image
                    src={pack.image}
                    alt={pack.imageAlt}
                    fill
                    sizes="(max-width: 560px) 46vw, (max-width: 1024px) 30vw, 280px"
                    className="object-cover"
                  />
                  <span className="absolute top-3 left-3 rounded-pill bg-butter px-2.5 py-[5px] text-[clamp(11px,1vw,12px)] font-bold text-midnight">
                    {size.size}
                  </span>
                </Link>

                <Link
                  href={href}
                  className="inline-flex items-center text-[clamp(15px,1.5vw,17px)] font-bold text-midnight coarse:min-h-11 hover:text-moss-deep"
                >
                  Cloud Soft - {size.name}
                </Link>
                <div className="mt-1 mb-3.5 text-[clamp(12px,1.1vw,13px)] text-muted">
                  Fits {size.fits} · {pack.count} pants
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <div className="font-display text-[clamp(19px,2vw,23px)] text-midnight">{inr(pack.price)}</div>
                    {packDiscountPct(pack) > 0 && (
                      <>
                        <s className="text-sm text-muted/70">{inr(pack.mrp)}</s>
                        <span className="rounded-full bg-midnight px-2 py-0.5 text-[11px] font-semibold text-white">
                          {packDiscountPct(pack)}% off
                        </span>
                      </>
                    )}
                  </div>
                  <AddButton
                    size={size.size}
                    count={pack.count}
                    label={`Add Cloud Soft ${size.name} ${pack.count} pack to cart`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
