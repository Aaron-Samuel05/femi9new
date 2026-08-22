"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAYERS, LAYER_COLORS } from "@/lib/content";
import { usePrefersReducedMotion } from "@/lib/motion";

const AUTO_ADVANCE_MS = 2800;
const STAGGER_MS = 100;

/**
 * The 5-layer protection system. Cards stagger in when the section is 35% visible,
 * then auto-advance every 2.8s; clicking a card or dot selects it and restarts the
 * timer. Not scroll-jacked — the section scrolls normally.
 */
export function LayerStack() {
  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [staggering, setStaggering] = useState(true);
  const sectionRef = useRef<HTMLDivElement>(null);
  const revealedOnce = useRef(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  // The observer both reveals the stack (once, with a stagger) and pauses the
  // carousel whenever the section leaves the viewport.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    let staggerTimer: ReturnType<typeof setTimeout> | undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setInView(entry.isIntersecting);
          if (entry.isIntersecting && !revealedOnce.current) {
            revealedOnce.current = true;
            setRevealed(true);
            staggerTimer = setTimeout(() => setStaggering(false), LAYERS.length * STAGGER_MS + 600);
          }
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (staggerTimer) clearTimeout(staggerTimer);
    };
  }, []);

  // Auto-advance. `active` is a dependency so selecting a card restarts the clock.
  useEffect(() => {
    if (!inView || !revealed || staggering || reducedMotion) return;
    const timer = setTimeout(() => setActive((current) => (current + 1) % LAYERS.length), AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [inView, revealed, staggering, active, reducedMotion]);

  const select = useCallback((index: number) => setActive(index), []);
  const layer = LAYERS[active];

  return (
    <section id="tech" ref={sectionRef} className="px-safe relative overflow-hidden bg-moss py-section text-butter">
      <div
        className="absolute -top-15 -right-15 size-[clamp(180px,26vw,340px)] rounded-full bg-butter/12"
        aria-hidden
      />
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-block md:grid-cols-2">
        {/* Copy panel — cross-fades on change */}
        <div>
          <div className="eyebrow mb-4 text-butter opacity-80">5-Layer Protection System</div>
          <div className="mb-1.5 font-display text-[clamp(20px,2vw,26px)] leading-none opacity-60">
            Layer {active + 1} of 5
          </div>
          <div key={active} className="animate-[layer-in_.45s_var(--ease-reveal)_both]">
            <h2 className="m-0 mb-5 min-h-[1.1em] font-display text-[clamp(30px,4.6vw,60px)] font-normal leading-[1.02]">
              {layer.title}
            </h2>
            {/* min-height reserves space for the longest copy so the panel doesn't
                jump between layers — measured in ch/em so it scales with the type */}
            <p className="m-0 mb-6.5 max-w-[48ch] text-body leading-[1.6] opacity-90 md:min-h-[3.2em]">{layer.desc}</p>
            <ul className="m-0 mb-6.5 flex list-none flex-col gap-3 p-0 text-[clamp(14px,1.3vw,16px)]">
              {layer.benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2.5">
                  <span className="text-butter" aria-hidden>
                    ✓
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
          {/* dots get a 44px tall invisible hit area on touch, 4px visual bar */}
          <div className="-my-5 flex gap-2.5" role="tablist" aria-label="Protection layers">
            {LAYERS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={`Layer ${index + 1}: ${item.title}`}
                onClick={() => select(index)}
                className="group flex h-11 w-[clamp(26px,3vw,34px)] cursor-pointer items-center"
              >
                <span
                  className={`block h-1 w-full rounded-[4px] transition-colors ${
                    index === active ? "bg-butter" : "bg-butter/30 group-hover:bg-butter/60"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Card stack — heights live in CSS vars so the whole stack scales with the
            viewport; 94% width leaves room for the active card's 1.05 scale-out */}
        <div className="flex items-center justify-center">
          <div
            className="relative w-[94%] max-w-[360px]"
            style={{
              ["--layer-h" as string]: "clamp(54px, 9vw, 74px)",
              ["--layer-gap" as string]: "clamp(9px, 1.6vw, 14px)",
              height: `calc(${LAYERS.length} * (var(--layer-h) + var(--layer-gap)) - var(--layer-gap))`,
            }}
          >
            {LAYERS.map((item, index) => {
              const isActive = index === active;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => select(index)}
                  aria-label={`Show layer ${index + 1}: ${item.title}`}
                  className="absolute inset-x-0 flex cursor-pointer items-center rounded-chip pr-3 pl-[clamp(14px,2.2vw,24px)] text-left leading-tight font-semibold transition-[transform,opacity,box-shadow,background-color,font-size,color] duration-[600ms,500ms,450ms,400ms,300ms,300ms] ease-[var(--ease-reveal)]"
                  style={{
                    top: `calc(${index} * (var(--layer-h) + var(--layer-gap)))`,
                    height: "var(--layer-h)",
                    transformOrigin: "left center",
                    transitionDelay: staggering ? `${index * STAGGER_MS}ms` : "0ms",
                    opacity: revealed ? (isActive ? 1 : 0.5) : 0,
                    transform: `translateY(${revealed ? 0 : 38}px) scale(${isActive ? 1.05 : 1})`,
                    background: isActive ? LAYER_COLORS[0] : LAYER_COLORS[index],
                    color: isActive ? "#272C05" : "rgba(39,44,5,.7)",
                    fontSize: isActive ? "clamp(14px, 1.3vw, 16px)" : "clamp(13px, 1.2vw, 15px)",
                    boxShadow: isActive ? "var(--shadow-layer)" : "var(--shadow-soft)",
                  }}
                >
                  {index + 1}. {item.title}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`@keyframes layer-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </section>
  );
}
