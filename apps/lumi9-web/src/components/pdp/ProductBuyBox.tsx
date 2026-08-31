"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { getPack, inr, leadPack, subscriptionPrice } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import type { DbProductSize } from "@/lib/catalog.server";
import { FEATURE_IMAGES, PDP_POLICY_ACCORDION } from "@/lib/content";

const TRUST: { icon: IconName; label: string }[] = [
  { icon: "leaf", label: "Chemical-free" },
  { icon: "clock", label: "12-hour dryness" },
  { icon: "shield", label: "Dermatologist tested" },
];

const FEATURE_THUMBS = [FEATURE_IMAGES.wetnessLock, FEATURE_IMAGES.softness, FEATURE_IMAGES.softAsCotton];

/**
 * Sticky gallery + buy column. Size lives in the URL (`/product/m`) so packs and
 * prices are shareable; pack, quantity and the active image are local state.
 */
export function ProductBuyBox({ size }: { size: DbProductSize }) {
  const { sizes, subscribeSavePct } = useCatalogData();
  // Opens on the tier priced at `basePrice`, which is what carries the
  // console's "Base price (₹)" field onto the product page — it was dropped in
  // catalog.server.ts and no surface read it, so editing that field moved the
  // console's own products list and nothing a shopper saw. Same pick as the
  // shop grid, so the two cannot quote different prices for one product.
  const [packCount, setPackCount] = useState(leadPack(size).count);
  const [qty, setQty] = useState(1);
  const [mainImage, setMainImage] = useState<string | null>(null);
  const { add } = useCart();

  const pack = getPack(size, packCount);
  const activeImage = mainImage ?? pack.image;

  /**
   * The accordion, from the console.
   *
   * It used to be three constants in `content.ts`, two of which the seed ALSO
   * wrote into `description` and `longDescription` — so the console had an
   * editor for both, saving one changed the row, and this panel went on
   * printing the module. Every entry with a real column behind it now reads it,
   * and an empty column drops its entry rather than showing a blank panel.
   *
   * Shipping & returns stays a constant: it is site policy, the same sentence
   * on every product, and there is no console page that owns it. It is appended
   * LAST so the product's own copy always leads.
   */
  const accordion = [
    ...(size.description ? [{ q: "Description", a: size.description }] : []),
    ...(size.longDescription ? [{ q: "Materials & safety", a: size.longDescription }] : []),
    ...size.features.filter((f) => f.body).map((f) => ({ q: f.title, a: f.body })),
    ...PDP_POLICY_ACCORDION,
  ];

  // Pack thumbs SELECT a tier; the extras only change the picture. `images`
  // beyond `packs.length` are photography the console uploaded that no tier
  // owns — dropping them would silently discard most of a six-image product.
  const thumbs = [
    ...size.packs.map((option) => ({
      // Not `src`: a product with fewer images than tiers gives every tier the
      // same photo, and a src-keyed list would collide and mark all of them
      // current at once. The variant id is unique whatever the images do.
      id: option.variantId,
      src: option.image,
      alt: option.imageAlt,
      onSelect: () => {
        setPackCount(option.count);
        setMainImage(option.image);
      },
    })),
    ...size.images.slice(size.packs.length).map((extra, i) => ({
      id: `extra-${size.packs.length + i}`,
      src: extra.url,
      alt: extra.alt,
      onSelect: () => setMainImage(extra.url),
    })),
    ...FEATURE_THUMBS.map((feature) => ({
      id: feature.src,
      src: feature.src,
      alt: feature.alt,
      onSelect: () => setMainImage(feature.src),
    })),
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-block md:grid-cols-[1.1fr_1fr]">
      {/* GALLERY */}
      <div className="md:sticky md:top-24">
        <div className="relative aspect-square overflow-hidden rounded-media bg-shell shadow-deep">
          <Image
            key={activeImage}
            src={activeImage}
            alt={`Cloud Soft ${size.name}`}
            fill
            priority
            sizes="(max-width: 768px) 92vw, 620px"
            className="object-cover"
          />
          <span className="absolute top-3.5 left-3.5 rounded-pill bg-butter px-3 py-1.5 text-[clamp(11px,1.1vw,13px)] font-bold text-midnight">
            Chemical-free
          </span>
        </div>

        <div className="scroll-row mt-4 gap-[clamp(8px,1vw,12px)] max-md:-mx-[var(--spacing-gutter)] max-md:px-[var(--spacing-gutter)]">
          {thumbs.map((thumb) => (
            <button
              key={thumb.id}
              type="button"
              onClick={thumb.onSelect}
              aria-label={`View ${thumb.alt}`}
              aria-current={activeImage === thumb.src}
              className={`relative size-[clamp(58px,7vw,78px)] cursor-pointer overflow-hidden rounded-chip bg-shell p-0 ${
                activeImage === thumb.src ? "border-2 border-moss-deep" : "border-2 border-transparent"
              }`}
            >
              <Image src={thumb.src} alt="" fill sizes="78px" className="object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* INFO */}
      <div>
        <h1 className="m-0 mb-3 font-display text-[clamp(27px,7.5vw,46px)] md:text-[clamp(32px,3.6vw,46px)] font-normal leading-[1.05]">
          Cloud Soft Diaper Pants
        </h1>
        <div className="mb-5 flex items-center gap-3">
          <span className="text-base tracking-[2px] text-gold" aria-hidden>
            ★★★★★
          </span>
          <span className="text-sm text-muted">4.9 · 482 verified reviews</span>
        </div>
        <p className="m-0 mb-6.5 max-w-[54ch] text-[clamp(15px,1.4vw,17px)] leading-[1.6] text-muted">
          Ultra-soft, chemical-free pants with a 5-layer protection system and Wetness Lock core — up to 12 hours of
          dryness, gentle on delicate skin.
        </p>

        <div className="mb-7 flex flex-wrap items-baseline gap-3">
          <div className="font-display text-[clamp(30px,3.4vw,40px)] leading-none text-midnight">{inr(pack.price)}</div>
          <div className="text-sm text-muted">
            for {pack.count} pants · ₹{(pack.price / pack.count).toFixed(1)}/pant
          </div>
        </div>

        {/* SIZE — each option is a real route, so the URL always matches the choice */}
        <div className="mb-3 text-sm font-semibold">
          Size <span className="ml-1 font-normal text-muted">· fits {size.fits}</span>
        </div>
        <div className="mb-6.5 grid grid-cols-5 gap-[clamp(6px,0.9vw,10px)]">
          {sizes.map((option) => {
            const selected = option.size === size.size;
            return (
              <Link
                key={option.size}
                href={`/product/${option.size.toLowerCase()}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-chip border-[1.5px] px-1 py-2.5 text-[clamp(13px,1.4vw,15px)] font-bold transition-colors ${
                  selected
                    ? "border-midnight bg-midnight text-butter"
                    : "border-moss-tint text-midnight hover:border-moss-soft"
                }`}
              >
                {option.size}
                <span className="text-[clamp(10px,0.9vw,11px)] font-medium whitespace-nowrap opacity-70">{option.short}</span>
              </Link>
            );
          })}
        </div>

        {/* PACK */}
        <div className="mb-3 text-sm font-semibold">Pack size</div>
        <div className="mb-6.5 flex flex-wrap gap-2.5" role="group" aria-label="Pack size">
          {size.packs.map((option) => (
            <button
              key={option.count}
              type="button"
              aria-pressed={option.count === pack.count}
              onClick={() => {
                setPackCount(option.count);
                setMainImage(option.image);
              }}
              className="chip"
            >
              {option.count} pcs
            </button>
          ))}
        </div>

        {/* QTY + ADD */}
        <div className="mb-4 flex flex-wrap items-stretch gap-[clamp(10px,1.4vw,14px)]">
          <QtyStepper qty={qty} onChange={setQty} />
          <AddToCartButton
            onAdd={() => add(size.size, pack.count, qty)}
            className="btn btn-dark min-w-[60%] flex-1 font-bold"
          >
            Add to cart — {inr(pack.price * qty)}
          </AddToCartButton>
        </div>
        <Link
          href="/subscription"
          className="btn btn-cream mb-7 w-full border-[1.5px] border-moss-deep text-[clamp(14px,1.3vw,15px)]"
        >
          {/* The percentage is the console's, not a constant: renewal orders are
              discounted by Settings.subscribeSavePct, and this used to say 20%
              while that defaulted to 15. */}
          Subscribe &amp; save {subscribeSavePct}% — {inr(subscriptionPrice(pack.price, subscribeSavePct))}/month
        </Link>

        {/* TRUST */}
        <div className="mb-7.5 grid grid-cols-3 gap-[clamp(8px,1.2vw,14px)] rounded-chip bg-moss-tint p-[clamp(14px,1.8vw,20px)]">
          {TRUST.map((item) => (
            <div key={item.label} className="flex flex-col items-center gap-2 text-center text-moss-deep">
              <Icon name={item.icon} size={26} strokeWidth={1.7} />
              <span className="text-[clamp(11px,1vw,12px)] leading-[1.3] font-semibold text-midnight">{item.label}</span>
            </div>
          ))}
        </div>

        <Accordion items={accordion} defaultOpen={0} />
      </div>
    </div>
  );
}
