"use client";

import Link from "next/link";
import { useState } from "react";
import { SUBSCRIPTION_FREQUENCIES } from "@/lib/content";
import { inr, subscriptionPrice, type SizeCode } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import type { DbProductSize } from "@/lib/catalog.server";

/** Subscribable pack tiers — the 3-count trial packs aren't offered on subscription. */
function subscribablePacks(size: DbProductSize) {
  return size.packs.filter((pack) => pack.count >= 24);
}

export function BoxBuilder() {
  const { sizes, getSizeOrDefault } = useCatalogData();
  const [sizeCode, setSizeCode] = useState<SizeCode>("M");
  const [packCount, setPackCount] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<(typeof SUBSCRIPTION_FREQUENCIES)[number]>("4 weeks");

  const size = getSizeOrDefault(sizeCode);
  const packs = subscribablePacks(size);
  const pack = packs.find((option) => option.count === packCount) ?? packs[packs.length - 1];

  return (
    <section id="build" className="px-safe pt-5 pb-section">
      <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-start gap-block rounded-panel border border-moss-tint bg-canvas p-card-lg lg:grid-cols-[1fr_minmax(280px,340px)]">
        <div>
          <h2 className="m-0 mb-7.5 font-display text-[clamp(24px,3vw,32px)] font-normal">Build your box</h2>

          <div className="mb-3 text-sm font-semibold">Size</div>
          <div className="mb-7 grid grid-cols-5 gap-[clamp(6px,0.9vw,10px)]" role="group" aria-label="Size">
            {sizes.map((option) => (
              <button
                key={option.size}
                type="button"
                aria-pressed={option.size === sizeCode}
                onClick={() => {
                  setSizeCode(option.size);
                  setPackCount(null);
                }}
                className={`min-h-11 min-w-0 cursor-pointer rounded-chip border-[1.5px] p-2 text-[clamp(13px,1.4vw,15px)] font-bold transition-colors ${
                  option.size === sizeCode
                    ? "border-midnight bg-midnight text-butter"
                    : "border-moss-tint text-midnight hover:border-moss-soft"
                }`}
              >
                {option.size}
              </button>
            ))}
          </div>

          <div className="mb-3 text-sm font-semibold">Pack per delivery</div>
          <div className="mb-7 flex flex-wrap gap-2.5" role="group" aria-label="Pack per delivery">
            {packs.map((option) => (
              <button
                key={option.count}
                type="button"
                aria-pressed={option.count === pack.count}
                onClick={() => setPackCount(option.count)}
                className="chip"
              >
                {option.count} pcs
              </button>
            ))}
          </div>

          <div className="mb-3 text-sm font-semibold">Delivery frequency</div>
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Delivery frequency">
            {SUBSCRIPTION_FREQUENCIES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === frequency}
                onClick={() => setFrequency(option)}
                className="chip"
              >
                Every {option}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full rounded-card bg-midnight p-card text-butter lg:sticky lg:top-24">
          <div className="mb-4 text-xs font-bold tracking-[0.14em] text-gold">YOUR BOX</div>
          <div className="mb-1.5 font-display text-[clamp(20px,2.2vw,24px)]">Cloud Soft — {size.name}</div>
          <div className="mb-6 text-sm opacity-80">
            {pack.count} pants · every {frequency}
          </div>
          <div className="mb-1.5 flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[clamp(30px,3.6vw,40px)]">{inr(subscriptionPrice(pack.price))}</span>
            <span className="text-[15px] line-through opacity-70">{inr(pack.price)}</span>
          </div>
          <div className="mb-6 text-[13px] text-gold">You save 20% every delivery</div>
          <Link href="/checkout" className="btn btn-cream mb-3.5 w-full">
            Start subscription
          </Link>
          <div className="text-center text-xs leading-[1.5] opacity-70">
            Skip, pause or cancel anytime. Free delivery.
          </div>
        </div>
      </div>
    </section>
  );
}
