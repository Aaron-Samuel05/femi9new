"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";

import { CursorScrubVideo } from "@/components/media/CursorScrubVideo";
import { Em, StatBlock } from "@/components/ui/bits";
import { usePrefersReducedMotion } from "@/lib/motion";
import { HERO_STATS } from "@/lib/content";

/**
 * The homepage hero: three offers behind one mascot.
 *
 * WHAT IS FIXED AND WHAT MOVES. Lumi holds the centre and never changes with
 * the slide - she is the brand, not the promotion - and the Shop Now button
 * never moves either, so the one thing a visitor is meant to click does not
 * walk out from under the cursor every six seconds. Everything else (the
 * backdrop plate, the copy, the drifting artwork) belongs to the slide.
 *
 * ONE H1, ALWAYS. Slide 0's headline is the page's only <h1> and it is in the
 * server-rendered HTML whatever slide is showing. The offer slides render their
 * headline as a <p> styled to match: three rotating h1s would hand a crawler a
 * different primary heading depending on when it looked.
 *
 * MOTION IS EARNED. Auto-advance stops on hover, on keyboard focus and on a
 * hidden tab, and `prefers-reduced-motion` freezes the whole thing on slide 0
 * with no parallax and no scrub. See `dampen` for why the cursor work is done
 * with quickTo rather than a React state update.
 */

const SLIDE_MS = 6000;

type HeroArt = {
  src: string;
  alt: string;
  /** Tailwind box for the layer. Positioned against the hero, not the flow. */
  className: string;
  /** Pixels of travel at the far edge of the viewport. Bigger = nearer. */
  depth: number;
  /** Intrinsic size of the file, so the layer reserves its box before decode. */
  w: number;
  h: number;
};

type HeroSlide = {
  id: string;
  eyebrow: string;
  /** Rendered as <h1> for the first slide and <p> for the rest. */
  headline: React.ReactNode;
  lead: string;
  /**
   * Backdrop, crossfaded. A CSS gradient or an image URL.
   *
   * Image paths carry a `-vN` suffix because `/assets/*` is served
   * `immutable` for a year: editing one of these in place ships a change
   * nobody who has already visited will ever see. Bump the suffix instead.
   */
  plate: string;
  art: HeroArt[];
};

const SLIDES: readonly HeroSlide[] = [
  {
    id: "cloudsoft",
    eyebrow: "Trusted by 40,000+ Indian families",
    headline: (
      <>
        Cloud Soft Baby Diapers
        <br />
        Made for <Em>Happy</Em> Little Days
      </>
    ),
    lead:
      "From sleepy newborn cuddles to crawling, stretching and first little steps, Lumi9 baby diapers are designed to move comfortably with your growing baby - soft cotton-like comfort, quick moisture absorption and a flexible fit.",
    plate: "radial-gradient(120% 90% at 78% 20%, #eef1e0 0%, #f7f5ea 55%)",
    art: [],
  },
  {
    id: "subscription",
    eyebrow: "Everyday baby comfort",
    headline: (
      <>
        Subscription Offer
        <br />
        <Em>15% off</Em> every delivery
      </>
    ),
    lead: "Subscribe once and the right size arrives on its own - skip, pause or cancel from your account whenever you need to.",
    plate: "/assets/hero/plate-linen-v2.webp",
    art: [
      {
        src: "/assets/hero/baby-sleeping-v2.webp",
        alt: "",
        className:
          "right-[-14%] bottom-[-6%] w-[min(94vw,620px)] md:right-[-4%] md:bottom-[-4%] md:w-[min(46vw,660px)]",
        depth: 26,
        w: 840,
        h: 760,
      },
    ],
  },
  {
    id: "launch",
    eyebrow: "Comfort that babies love",
    headline: (
      <>
        Launching Offer
        <br />
        <Em>10% off</Em> your first box
      </>
    ),
    lead: "Cloud-soft, chemical-free and built for wriggling - meet the diaper that keeps up with a baby in full flight.",
    plate: "/assets/hero/plate-cloud-v1.webp",
    art: [
      {
        src: "/assets/hero/baby-flying-v1.webp",
        alt: "",
        className:
          "right-[-10%] top-[16%] w-[min(88vw,560px)] md:right-[-2%] md:top-[14%] md:w-[min(42vw,600px)]",
        depth: 42,
        w: 817,
        h: 760,
      },
    ],
  },
];

export function HeroStage() {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const hostRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  }, []);

  // --- auto-advance -------------------------------------------------------
  // Three separate reasons to hold: the visitor is reading (hover/focus), the
  // tab is not on screen, or they have asked for less motion. A timer that
  // ignored the hidden-tab case would queue up advances and then flash through
  // them all when the tab came back.
  useEffect(() => {
    if (reducedMotion || paused) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [reducedMotion, paused]);

  // --- copy transition ----------------------------------------------------
  useEffect(() => {
    const el = copyRef.current;
    if (!el) return;
    const lines = el.querySelectorAll<HTMLElement>("[data-hero-line]");
    if (reducedMotion) {
      gsap.set(lines, { opacity: 1, y: 0 });
      return;
    }
    const tl = gsap.timeline();
    tl.fromTo(
      lines,
      { opacity: 0, y: 18 },
      { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: 0.07 },
    );
    return () => {
      tl.kill();
    };
  }, [index, reducedMotion]);

  return (
    <header
      id="top"
      ref={hostRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="px-safe relative isolate flex min-h-[100svh] flex-col items-center overflow-hidden pt-[calc(var(--nav-h,68px)+clamp(18px,4vw,44px))] pb-[clamp(32px,6vw,60px)] [@media(max-height:560px)]:min-h-0 [@media(max-height:560px)]:pt-[calc(var(--nav-h,68px)+14px)] [@media(max-height:560px)]:pb-8"
    >
      <Plates index={index} />
      <ArtLayers index={index} reducedMotion={reducedMotion} />

      {/* Content sits above the art; Lumi is between them (z-2 vs z-3). */}
      <div className="relative z-3 mx-auto flex w-full max-w-[1240px] flex-1 flex-col px-[clamp(16px,4vw,40px)] md:flex-row md:items-center">
        {/* Capped at 40%: the copy owns the left band, Lumi the middle, the
            drifting artwork the right. Wider and it runs under her. */}
        <div ref={copyRef} className="w-full max-w-[520px] md:w-[40%] md:max-w-[460px] md:shrink-0">
          <SlideCopy slide={SLIDES[index]} first={index === 0} />

          {/* Fixed: outside SlideCopy so it is never re-mounted or re-animated
              between slides, and never changes position. */}
          <div className="mt-[clamp(14px,3.4vw,32px)] flex flex-wrap gap-3">
            <Link href="/shop" className="btn btn-dark max-[520px]:w-full">
              Shop Now →
            </Link>
            <Link href="#sizes" className="btn btn-ghost max-[520px]:w-full">
              Find your baby’s size
            </Link>
          </div>

          <div className="mt-[clamp(14px,4vw,36px)] flex flex-wrap gap-x-[clamp(20px,3vw,30px)] gap-y-3">
            {HERO_STATS.map((stat) => (
              <StatBlock key={stat.label} value={stat.value} label={stat.label} />
            ))}
          </div>

          <Dots index={index} go={go} />
        </div>
      </div>

      <LumiStage />
    </header>
  );
}

function SlideCopy({ slide, first }: { slide: HeroSlide; first: boolean }) {
  const Headline = first ? "h1" : "p";
  return (
    <>
      <div
        data-hero-line
        className="mb-[clamp(10px,2.6vw,26px)] inline-flex max-w-full items-center gap-2 rounded-pill border border-moss-tint bg-canvas/80 px-[15px] py-[7px] text-[clamp(12px,1.1vw,13px)] font-semibold text-moss-deep backdrop-blur-sm"
      >
        <span className="size-[7px] shrink-0 rounded-full bg-moss" aria-hidden />
        {slide.eyebrow}
      </div>
      <Headline
        data-hero-line
        className="m-0 mb-[clamp(10px,2vw,20px)] font-display text-[clamp(32px,8.2vw,70px)] font-normal leading-[1.02] md:text-[clamp(38px,4.9vw,70px)]"
      >
        {slide.headline}
      </Headline>
      <p
        data-hero-line
        className="m-0 max-w-[52ch] text-lead leading-[1.55] text-muted md:leading-[1.6]"
      >
        {slide.lead}
      </p>
    </>
  );
}

/** Crossfading backdrops. Every plate stays mounted so a switch is a fade, not a load. */
function Plates({ index }: { index: number }) {
  return (
    <div className="absolute inset-0 -z-1" aria-hidden>
      {SLIDES.map((slide, i) => {
        const isImage = slide.plate.startsWith("/");
        return (
          <div
            key={slide.id}
            className="absolute inset-0 transition-opacity duration-[900ms] ease-out motion-reduce:transition-none"
            style={{
              opacity: i === index ? 1 : 0,
              background: isImage ? undefined : slide.plate,
              backgroundImage: isImage ? `url(${slide.plate})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        );
      })}
      {/* Keeps the left-hand copy legible over the photographic plates without
          washing the artwork out on the right. */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(100deg, rgba(247,245,234,.92) 0%, rgba(247,245,234,.55) 42%, rgba(247,245,234,0) 68%)" }}
      />
    </div>
  );
}

/**
 * The drifting artwork - the flying baby, and the leaves and stars around it.
 *
 * Damped with gsap.quickTo: it writes the transform straight to the element on
 * GSAP's own ticker. Routing pointer moves through React state instead would
 * re-render the whole hero at pointer frequency, and the mascot video is in
 * that tree.
 */
function ArtLayers({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const host = layerRef.current;
    if (!host) return;

    const nodes = Array.from(host.querySelectorAll<HTMLElement>("[data-depth]"));
    const setters = nodes.map((el) => ({
      el,
      depth: Number(el.dataset.depth) || 20,
      x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3" }),
      y: gsap.quickTo(el, "y", { duration: 1.1, ease: "power3" }),
    }));

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      for (const s of setters) {
        s.x(nx * s.depth);
        // Vertical travel is deliberately shallower - a layer that tracks the
        // cursor 1:1 on both axes reads as a sticker following the mouse, not
        // as something floating behind the page.
        s.y(ny * s.depth * 0.55);
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      for (const s of setters) gsap.killTweensOf(s.el);
    };
  }, [reducedMotion, index]);

  return (
    <div ref={layerRef} className="absolute inset-0 -z-1 overflow-hidden" aria-hidden>
      {SLIDES.map((slide, i) => (
        <div
          key={slide.id}
          className="absolute inset-0 transition-opacity duration-[900ms] ease-out motion-reduce:transition-none"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          {slide.art.map((art) => (
            <Image
              key={art.src}
              src={art.src}
              alt={art.alt}
              width={art.w}
              height={art.h}
              data-depth={art.depth}
              // Only the first slide's art competes for LCP; the rest are two
              // crossfades away and should not contend for the same bandwidth.
              priority={i === 0}
              loading={i === 0 ? undefined : "lazy"}
              sizes="(max-width: 768px) 90vw, 45vw"
              className={`absolute h-auto will-change-transform ${art.className}`}
            />
          ))}
          {i === 2 && <FloatingBits />}
        </div>
      ))}
    </div>
  );
}

/**
 * The leaves and stars from the launch banner, redrawn rather than cut out.
 *
 * They are flat two-tone shapes, so tracing them as SVG costs a few hundred
 * bytes, stays crisp at any size and - unlike a cutout lifted off a soft
 * gradient - carries no halo onto a backdrop that changes behind it.
 */
function FloatingBits() {
  const bits = [
    { d: "M12 2C6 6 2 12 2 18c6 0 10-4 10-10z", cls: "left-[54%] top-[24%] size-[clamp(20px,2.6vw,34px)] text-moss/45", depth: 64, spin: -18 },
    { d: "M12 2C6 6 2 12 2 18c6 0 10-4 10-10z", cls: "left-[62%] top-[62%] size-[clamp(16px,2vw,26px)] text-moss/30", depth: 88, spin: 34 },
    { d: "M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z", cls: "left-[70%] top-[18%] size-[clamp(12px,1.5vw,20px)] text-gold/60", depth: 108, spin: 12 },
    { d: "M12 1l2.6 7.4L22 11l-7.4 2.6L12 21l-2.6-7.4L2 11l7.4-2.6z", cls: "left-[48%] top-[70%] size-[clamp(10px,1.2vw,16px)] text-gold/45", depth: 76, spin: -24 },
  ];
  return (
    <>
      {bits.map((bit, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          data-depth={bit.depth}
          className={`absolute will-change-transform motion-safe:animate-floaty ${bit.cls}`}
          style={{ rotate: `${bit.spin}deg`, animationDelay: `${i * 0.7}s` }}
          fill="currentColor"
          aria-hidden
        >
          <path d={bit.d} />
        </svg>
      ))}
    </>
  );
}

/**
 * Lumi, centred and unchanging.
 *
 * The video is transparent (see CursorScrubVideo's `sources`), so the slide
 * backdrop shows through her instead of her carrying a cream tile across it -
 * which is the whole reason the backdrops can change at all. `feather` is
 * deliberately NOT set: a feather fades a rectangle into a matching colour, and
 * with real alpha there is no rectangle left to hide.
 */
function LumiStage() {
  return (
    // Centred on the hero, but SIZED to the middle band. Left at full width the
    // clip's own box is the viewport, and object-contain then scales her to the
    // height - 620px tall is 560px wide, which reaches straight through the
    // copy column beside her.
    // IN FLOW on mobile, absolute from `md` up. Stacked, the copy runs the full
    // width, so an absolutely-positioned mascot sits on top of the stat row
    // instead of beside it; `mt-auto` drops her to the foot of the column and
    // the copy keeps its own space. Only the two-column layout wants her
    // lifted out of the flow so she can hold the true centre.
    <div className="pointer-events-none relative z-2 mt-auto flex w-full justify-center md:absolute md:inset-x-0 md:bottom-0 md:mt-0">
      <CursorScrubVideo
        src="/assets/lumi-scrub-v2.mp4"
        sources={[
          // Safari first: it can play the WebM's container but not its alpha,
          // and would pick a silently opaque file if that were offered first.
          { src: "/assets/lumi-scrub-v2.mp4", type: 'video/mp4; codecs="hvc1"' },
          { src: "/assets/lumi-scrub-v2.webm", type: "video/webm" },
        ]}
        poster="/assets/lumi-scrub-v2-poster.webp"
        label="Lumi, the Lumi9 avocado, looking around"
        hint="Move your cursor"
        axis="horizontal"
        trackingArea="window"
        smoothing={0.16}
        objectFit="contain"
        loom={0.04}
        className="h-[min(26svh,200px)] w-[min(66vw,260px)] min-[420px]:h-[min(30svh,240px)] min-[420px]:w-[min(62vw,290px)] md:h-[min(56svh,460px)] md:w-[min(38vw,420px)] [@media(max-height:560px)]:h-[min(58svh,200px)]"
      />
    </div>
  );
}

function Dots({ index, go }: { index: number; go: (n: number) => void }) {
  return (
    <div
      className="mt-[clamp(14px,3.4vw,34px)] flex items-center gap-2"
      role="tablist"
      aria-label="Hero offers"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
      }}
    >
      {SLIDES.map((slide, i) => (
        <button
          key={slide.id}
          type="button"
          role="tab"
          aria-selected={i === index}
          aria-label={slide.eyebrow}
          tabIndex={i === index ? 0 : -1}
          onClick={() => go(i)}
          // Stop the MOUSE taking focus. Focusing a dot makes the browser
          // scroll it into view against `scroll-padding-top` (set globally to
          // clear the fixed nav), and with `scroll-behavior: smooth` that is a
          // visible lurch on every click. Keyboard focus is untouched, so Tab
          // and the arrow keys still reach and drive these.
          onMouseDown={(e) => e.preventDefault()}
          className={`h-[6px] rounded-pill transition-all duration-300 ${
            i === index ? "w-7 bg-moss" : "w-[18px] bg-moss/25 hover:bg-moss/45"
          }`}
        />
      ))}
    </div>
  );
}
