"use client";

import Link from "next/link";
import { useState } from "react";
import { type SizeCode } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";

/** Weight chips → recommended size card. Defaults to M, as in the design. */
export function SizeMatcher() {
  const { weightOptions, getSizeOrDefault } = useCatalogData();
  const [picked, setPicked] = useState<SizeCode>("M");
  const size = getSizeOrDefault(picked);

  return (
    <section className="px-safe mx-auto max-w-[900px] pt-5 pb-section-sm">
      <div className="mb-[clamp(24px,4vw,40px)] flex flex-wrap justify-center gap-2.5">
        {weightOptions.map((option) => (
          <button
            key={option.size}
            type="button"
            aria-pressed={picked === option.size}
            onClick={() => setPicked(option.size)}
            className="chip text-[clamp(13px,1.2vw,15px)]"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="rounded-media border border-moss-tint bg-canvas p-card-lg text-center shadow-card">
        <div className="mb-2 text-sm text-muted">We recommend</div>
        <div className="mb-1.5 font-display text-numeral leading-none text-moss-deep">{size.size}</div>
        <div className="mb-6.5 text-[15px] text-midnight">Cloud Soft {size.name}</div>
        <div className="mb-6.5 h-px bg-moss-tint" />
        <div className="mb-7 flex flex-wrap justify-around gap-4">
          <div>
            <div className="text-xs text-muted">Weight range</div>
            <div className="text-[clamp(15px,1.5vw,17px)] font-bold">{size.range}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Pack sizes</div>
            <div className="text-[clamp(15px,1.5vw,17px)] font-bold">{size.packs.map((pack) => pack.count).join(" / ")}</div>
          </div>
        </div>
        <Link href={`/product/${size.size.toLowerCase()}`} className="btn btn-dark font-bold">
          Shop {size.size}
        </Link>
      </div>
    </section>
  );
}
