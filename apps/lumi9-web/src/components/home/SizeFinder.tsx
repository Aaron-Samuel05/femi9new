"use client";

import Link from "next/link";
import { useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Em, SectionHeading } from "@/components/ui/bits";
import { useCart } from "@/lib/cart";
import { defaultPack, type SizeCode } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";

/** Weight chips → recommended size card → add that size to the cart. */
export function SizeFinder() {
  const { weightOptions, getSize } = useCatalogData();
  const [picked, setPicked] = useState<SizeCode | null>(null);
  const { add } = useCart();
  const recommended = getSize(picked);

  return (
    <section id="sizes" className="px-safe bg-butter py-section">
      <div className="mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-block md:grid-cols-2">
        <Reveal>
          <SectionHeading eyebrow="Size finder" size="md" className="mb-4.5">
            The perfect fit, <Em>in one tap.</Em>
          </SectionHeading>
          <p className="m-0 mb-8 max-w-[46ch] text-body leading-[1.6] text-muted">
            Tell us your baby&apos;s weight and we&apos;ll match the size that moves with them — no red marks, no leaks.
          </p>
          <div className="mb-3 text-sm font-semibold text-midnight">Baby&apos;s weight</div>
          <div className="flex flex-wrap gap-2.5">
            {weightOptions.map((option) => (
              <button
                key={option.size}
                type="button"
                aria-pressed={picked === option.size}
                onClick={() => setPicked(option.size)}
                className="chip border-midnight text-[clamp(13px,1.2vw,15px)]"
              >
                {option.label}
              </button>
            ))}
          </div>
        </Reveal>

        <Reveal className="rounded-media bg-canvas p-card-lg text-center shadow-card">
          <div className="mb-2 text-sm text-muted">{recommended ? "We recommend" : "Tap a weight to begin"}</div>
          <div className="mb-1.5 font-display text-numeral leading-none text-moss-deep">
            {recommended ? recommended.size : "—"}
          </div>
          <div className="mb-6.5 text-[15px] text-midnight">
            {recommended ? `Cloud Soft ${recommended.name}` : "Your perfect fit appears here"}
          </div>
          <div className="mb-6.5 h-px bg-moss-tint" />
          <div className="mb-7 flex flex-wrap justify-around gap-4">
            <div>
              <div className="text-xs text-muted">Weight range</div>
              <div className="text-[clamp(15px,1.5vw,17px)] font-bold text-midnight">
                {recommended ? recommended.range : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted">Pack sizes</div>
              <div className="text-[clamp(15px,1.5vw,17px)] font-bold text-midnight">
                {recommended ? recommended.packs.map((pack) => pack.count).join(" / ") : "—"}
              </div>
            </div>
          </div>
          {recommended ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => add(recommended.size, defaultPack(recommended).count)}
                className="btn btn-dark w-full"
              >
                Add {recommended.size} to cart
              </button>
              <Link
                href={`/product/${recommended.size.toLowerCase()}`}
                className="inline-flex items-center coarse:min-h-10 justify-center text-sm font-semibold text-moss-deep hover:text-midnight"
              >
                See the {recommended.name} pack →
              </Link>
            </div>
          ) : (
            <button type="button" className="btn btn-dark w-full" disabled>
              Add to cart
            </button>
          )}
        </Reveal>
      </div>
    </section>
  );
}
