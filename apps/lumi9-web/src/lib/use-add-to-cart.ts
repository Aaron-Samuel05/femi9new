"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The idle → pending → added → idle machine behind every add-to-cart control.
 *
 * ── Why it is a hook and not three copies ───────────────────────────────────
 * There are three of these controls (the round "+" on a product card, the PDP
 * buy button, the size finder's CTA) and they used to disagree about what
 * pressing one meant: the card flipped to a tick after 1200ms, the other two
 * did nothing at all. One machine means one answer.
 *
 * ── Why it waits ────────────────────────────────────────────────────────────
 * The old control set `added` synchronously in the click handler. On a slow
 * connection that is a tick shown for a request still in flight, and on a
 * failed one it is a tick shown beside a toast saying the add did not work.
 * `run` awaits the write and only celebrates a `true`.
 *
 * PENDING IS NOT SHOWN IMMEDIATELY. A spinner that appears and vanishes inside
 * 80ms is a flicker, and a local cart write usually resolves that fast - so the
 * pending state is armed on a short delay and cancelled if the write beats it.
 * The button still disables on the first frame, which is what stops a double
 * add; only the *visual* is deferred.
 *
 * ── Why it tracks mounting ──────────────────────────────────────────────────
 * Every one of these lives in a list that can re-render out from under it (a
 * size filter on /shop swaps the whole card row). Setting state after unmount
 * is a warning at best and a leaked timer at worst.
 */

export type AddState = "idle" | "pending" | "added";

/** How long a settled write waits before the spinner would have been noise. */
const PENDING_DELAY_MS = 140;
/** How long the tick holds. Long enough to read, short enough not to block a
 *  second add of the same item. */
const ADDED_HOLD_MS = 1600;

export function useAddToCart(perform: () => Promise<boolean>) {
  const [state, setState] = useState<AddState>("idle");
  // Separate from `state`: the control is unclickable from the first frame,
  // even while the pending VISUAL is still being deferred.
  const [busy, setBusy] = useState(false);

  const mounted = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
    };
  }, []);

  // `perform` is captured per call rather than in the dependency list: these
  // callers build it inline from props, so listing it would give `run` a new
  // identity on every render of every card in the grid.
  //
  // Written in an EFFECT, not in the render body. Assigning `.current` during
  // render is rejected by `react-hooks/refs` (which CI runs) and is genuinely
  // unsafe under a re-render React discards - the ref would keep a closure from
  // a render that never committed. An effect with no dependency array runs
  // after every commit, which is exactly the right moment.
  const performRef = useRef(perform);
  useEffect(() => {
    performRef.current = perform;
  });

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    clearTimers();

    const pendingTimer = setTimeout(() => {
      if (mounted.current) setState("pending");
    }, PENDING_DELAY_MS);
    timers.current.push(pendingTimer);

    let ok = false;
    try {
      ok = await performRef.current();
    } finally {
      clearTimeout(pendingTimer);
      if (mounted.current) {
        setBusy(false);
        // A failure returns to idle silently. The toast owns the apology - a
        // button that also turns red says the same bad news twice, and leaves
        // the shopper unsure which control to press next.
        setState(ok ? "added" : "idle");
        if (ok) {
          const resetTimer = setTimeout(() => {
            if (mounted.current) setState("idle");
          }, ADDED_HOLD_MS);
          timers.current.push(resetTimer);
        }
      }
    }
  }, [busy]);

  return { state, busy, run };
}
