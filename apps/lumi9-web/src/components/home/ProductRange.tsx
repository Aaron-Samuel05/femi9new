"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Em, SectionHeading } from "@/components/ui/bits";
import { AddButton } from "@/components/product/AddButton";
import { defaultPack, getPack, inr, packImage } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import type { DbProductSize } from "@/lib/catalog.server";

function RangeCard({ size }: { size: DbProductSize }) {
  const [packCount, setPackCount] = useState(defaultPack(size).count);
  const pack = getPack(size, packCount);
  const href = `/product/${size.size.toLowerCase()}`;

  return (
    <Reveal className="flex flex-col rounded-card border border-moss-tint bg-canvas p-[clamp(12px,1.5vw,20px)]">
      <Link
        href={href}
        className="relative mb-[clamp(12px,1.8vw,18px)] block aspect-4/5 overflow-hidden rounded-chip bg-shell"
      >
        <Image
          src={packImage(size.size, pack.count)}
          alt={`Cloud Soft ${size.name} — ${pack.count} pack`}
          fill
          sizes="(max-width: 560px) 46vw, (max-width: 1024px) 30vw, 260px"
          className="object-cover"
        />
        <span className="absolute top-3 left-3 rounded-pill bg-butter px-2.5 py-[5px] text-[clamp(11px,1vw,12px)] font-bold text-midnight">
          {size.size}
        </span>
      </Link>

      <Link href={href} className="text-[clamp(15px,1.5vw,18px)] font-bold text-midnight hover:text-moss-deep">
        Cloud Soft — {size.name}
      </Link>
      <div className="mt-1 mb-3.5 text-[clamp(12px,1.1vw,13px)] text-muted">Fits {size.fits}</div>

      {/* pack chips scroll rather than wrap into a tall stack on narrow cards */}
      <div
        className="scroll-row mb-4 gap-2"
        role="group"
        aria-label={`Pack size for Cloud Soft ${size.name}`}
      >
        {size.packs.map((option) => (
          <button
            key={option.count}
            type="button"
            aria-pressed={option.count === packCount}
            onClick={() => setPackCount(option.count)}
            className="chip min-h-9 px-3 py-1.5 text-[clamp(12px,1.1vw,13px)]"
          >
            {option.count} pcs
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-display text-[clamp(19px,2vw,24px)] leading-[1.1] text-midnight">{inr(pack.price)}</div>
          <div className="text-xs text-muted">{pack.count} diapers</div>
        </div>
        <AddButton
          size={size.size}
          count={pack.count}
          label={`Add Cloud Soft ${size.name} ${pack.count} pack to cart`}
        />
      </div>
    </Reveal>
  );
}

/** "One diaper. Every stage." — the Cloud Soft range with per-card pack selection. */
export function ProductRange() {
  const { sizes } = useCatalogData();
  return (
    <section id="shop" className="px-safe bg-paper py-section">
      <div className="mx-auto max-w-[1180px]">
        <Reveal className="mb-[clamp(28px,4vw,52px)] flex flex-wrap items-end justify-between gap-5">
          <SectionHeading eyebrow="The Cloud Soft range">
            One diaper. <Em>Every</Em> stage.
          </SectionHeading>
          <Link href="/size-guide" className="inline-flex items-center coarse:min-h-10 text-[15px] font-semibold text-moss-deep hover:text-midnight">
            Not sure of the size? →
          </Link>
        </Reveal>

        {/* two-up on the narrowest phones, then auto-fit as space allows */}
        <div className="grid grid-cols-2 gap-[clamp(10px,1.6vw,22px)] min-[560px]:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          {sizes.map((size) => (
            <RangeCard key={size.size} size={size} />
          ))}
        </div>
      </div>
    </section>
  );
}
