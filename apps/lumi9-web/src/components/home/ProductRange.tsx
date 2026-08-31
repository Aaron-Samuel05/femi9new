"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Em, SectionHeading } from "@/components/ui/bits";
import { AddButton } from "@/components/product/AddButton";
import { defaultPack, getPack, inr } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import { LAUNCH_OFFER } from "@/lib/content";
import type { DbProductSize } from "@/lib/catalog.server";

const offer = LAUNCH_OFFER;

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
          src={pack.image}
          alt={pack.imageAlt}
          fill
          sizes="(max-width: 560px) 46vw, (max-width: 1024px) 30vw, 260px"
          className="object-cover"
        />
        <span className="absolute top-3 left-3 rounded-pill bg-butter px-2.5 py-[5px] text-[clamp(11px,1vw,12px)] font-bold text-midnight">
          {size.size}
        </span>
      </Link>

      <Link href={href} className="inline-flex items-center text-[clamp(15px,1.5vw,18px)] font-bold text-midnight coarse:min-h-11 hover:text-moss-deep">
        Cloud Soft - {size.name}
      </Link>
      <div className="mt-1 mb-3.5 text-[clamp(12px,1.1vw,13px)] text-muted">Fits {size.fits}</div>

      {/* Two cards share a 390px phone, which leaves ~155px of card interior -
          three "24 pcs" chips need 208 and used to be cut mid-word by the
          scroller with nothing to say they continued. Below `sm` the unit moves
          out to a single caption and the chips carry the number alone, so the
          whole set fits and nothing scrolls. */}
      <div className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase sm:hidden">Pack (pcs)</div>
      <div className="mb-4 flex flex-wrap gap-1.5 sm:gap-2" role="group" aria-label={`Pack size for Cloud Soft ${size.name}`}>
        {size.packs.map((option) => (
          <button
            key={option.count}
            type="button"
            aria-pressed={option.count === packCount}
            aria-label={`${option.count} pieces`}
            onClick={() => setPackCount(option.count)}
            className="chip min-w-11 px-2.5 text-[clamp(12px,1.1vw,13px)] sm:px-3"
          >
            {option.count}
            <span className="max-sm:sr-only"> pcs</span>
          </button>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <div>
          {/*
            The offer price leads and the list price is struck through beside it,
            the way lumi9.in shows it. Both are DERIVED from `pack.price` and the
            single `LAUNCH_OFFER.percent` - the card never carries a second
            hard-coded number, so it cannot drift out of step with what the
            server actually charges at checkout.

            `pack.price` is treated as the list price and the offer comes off it.
            When `LAUNCH_OFFER` is null the whole treatment disappears and the
            price renders exactly as it did before.
          */}
          {offer ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-display text-[clamp(19px,2vw,24px)] font-extrabold leading-[1.1] text-midnight tabular-nums">
                {inr(pack.price * (1 - offer.percent / 100))}
              </span>
              <s className="text-[13px] text-muted/80 tabular-nums decoration-muted/50">{inr(pack.price)}</s>
              <span className="rounded-full bg-butter px-2 py-[3px] text-[11px] font-extrabold leading-none text-[#7a6500]">
                {offer.percent}% off
              </span>
            </div>
          ) : (
            <div className="font-display text-[clamp(19px,2vw,24px)] leading-[1.1] text-midnight tabular-nums">
              {inr(pack.price)}
            </div>
          )}
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

/** "One diaper. Every stage." - the Cloud Soft range with per-card pack selection. */
export function ProductRange() {
  const { sizes } = useCatalogData();
  return (
    <section id="shop" className="px-safe bg-paper py-section">
      <div className="mx-auto max-w-[var(--page-max)]">
        <Reveal className="mb-[clamp(28px,4vw,52px)] flex flex-wrap items-end justify-between gap-5">
          <SectionHeading eyebrow="The Cloud Soft range">
            One baby diaper range for <Em>every</Em> growing stage.
          </SectionHeading>
          <Link href="/size-guide" className="inline-flex items-center coarse:min-h-11 text-[15px] font-semibold text-moss-deep hover:text-midnight">
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
