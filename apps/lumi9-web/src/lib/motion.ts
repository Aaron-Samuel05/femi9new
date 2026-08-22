"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeToReducedMotion(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeToReducedMotion,
    prefersReducedMotion,
    () => false,
  );
}

/* ---------------------------------------------------------------------------
   Scroll reveal — one shared IntersectionObserver at threshold .12, matching
   the design's `[data-reveal]` behaviour (reveal once, then stop observing).
   --------------------------------------------------------------------------- */

let revealObserver: IntersectionObserver | null = null;

function getRevealObserver() {
  if (revealObserver) return revealObserver;
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.shown = "true";
          revealObserver?.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12 },
  );
  return revealObserver;
}

export function useRevealRef<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.dataset.shown = "true";
      return;
    }

    const observer = getRevealObserver();
    observer.observe(el);
    return () => observer.unobserve(el);
  }, []);

  return ref;
}

/* ---------------------------------------------------------------------------
   Parallax — a single rAF loop drives every registered node:
     translate3d(mouseX * f * 60px, -relativeScroll * f * .12 + mouseY * f * 40px, 0)
   with the pointer offset lerped at .06 per frame (design tokens: factors .06–.35).
   --------------------------------------------------------------------------- */

type ParallaxNode = { el: HTMLElement; factor: number; pointerScale: number };

const nodes = new Set<ParallaxNode>();
let rafId: number | null = null;
let pointerX = 0;
let pointerY = 0;
let targetX = 0;
let targetY = 0;
let listening = false;

function onPointerMove(event: PointerEvent) {
  targetX = event.clientX / window.innerWidth - 0.5;
  targetY = event.clientY / window.innerHeight - 0.5;
}

function frame() {
  pointerX += (targetX - pointerX) * 0.06;
  pointerY += (targetY - pointerY) * 0.06;

  const scrollY = window.scrollY;
  const viewportCenter = scrollY + window.innerHeight / 2;

  for (const node of nodes) {
    const rect = node.el.getBoundingClientRect();
    const center = rect.top + scrollY + rect.height / 2;
    const relative = viewportCenter - center;
    const x = pointerX * node.factor * node.pointerScale;
    const y = -relative * node.factor * 0.12 + pointerY * node.factor * (node.pointerScale * 0.67);
    node.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  }

  rafId = nodes.size ? requestAnimationFrame(frame) : null;
}

function start() {
  if (!listening) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    listening = true;
  }
  if (rafId === null) rafId = requestAnimationFrame(frame);
}

function stop() {
  if (nodes.size === 0) {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    if (listening) {
      window.removeEventListener("pointermove", onPointerMove);
      listening = false;
    }
  }
}

/**
 * @param factor drift strength, ~0.06 (slow column) to ~0.35 (hero confetti)
 * @param pointerScale px of pointer travel at factor 1 — 60 on the home hero, 40 elsewhere
 */
export function useParallaxRef<T extends HTMLElement>(factor = 0.2, pointerScale = 60) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;

    const node: ParallaxNode = { el, factor, pointerScale };
    nodes.add(node);
    start();

    return () => {
      nodes.delete(node);
      el.style.transform = "";
      stop();
    };
  }, [factor, pointerScale]);

  return ref;
}
