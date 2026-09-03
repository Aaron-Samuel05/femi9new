"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * The launch-offer popup - one image, over the page, on arrival.
 *
 * Everything about it is set in the console (Settings → Launch popup): whether
 * it runs at all, which artwork it shows, how long it stays and what a screen
 * reader hears instead of it. Nothing here is hardcoded, because a promo whose
 * dates live in a deploy is a promo somebody has to ship code to end.
 *
 * ── Why the whole thing is client-side after a server read ──────────────────
 * The CONFIG is read on the server (the root layout already runs per request,
 * so it costs one extra query and no round trip), but whether to SHOW it is a
 * per-browser decision: it depends on `sessionStorage`, which does not exist
 * during SSR. Rendering the markup on the server and hiding it on the client
 * would flash the popup at every returning visitor for one frame. So the server
 * decides WHAT, and this decides WHETHER.
 *
 * ── Once per visit, keyed on the artwork ────────────────────────────────────
 * `sessionStorage` rather than `localStorage`: a shopper who closes a promo
 * should not see it again while she browses, but a visit next week is a new
 * visit and the offer is presumably still on. The stored value is the image
 * URL, not a boolean — so uploading NEW artwork in the console starts a new
 * campaign for everyone, including the people who dismissed the last one. The
 * upload route stamps every object with a timestamp, so a replacement is always
 * a different URL even under the same filename.
 *
 * Storage is wrapped: Safari's private mode throws on the first write rather
 * than returning null, and an exception here would take the whole layout down.
 * A browser that will not remember gets the popup once per page instead, which
 * is a worse experience than intended but not a broken one.
 *
 * ── The image is a plain <img>, deliberately ────────────────────────────────
 * The artwork is a GIF. `next/image` would run it through the optimizer, which
 * re-encodes to a still frame — the animation is the offer, so it must be
 * served as uploaded. `unoptimized` would do the same job, but a plain tag says
 * why on its own.
 */

/** How long the page gets to itself before the popup appears. Long enough that
 *  it reads as a greeting rather than an interstitial, short enough that it is
 *  still part of arriving. */
const APPEAR_DELAY_MS = 900;

/** Session key. Prefixed like every other client-stored value in the app. */
const SEEN_KEY = "lumi9:launch-popup";

function readSeen(): string | null {
  try {
    return window.sessionStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function markSeen(value: string) {
  try {
    window.sessionStorage.setItem(SEEN_KEY, value);
  } catch {
    /* private mode, or storage disabled — see the note above. */
  }
}

export function LaunchPopup({
  imageUrl,
  alt,
  seconds,
}: {
  imageUrl: string;
  /** The console's description. Empty is not treated as decorative — see below. */
  alt: string;
  /** Auto-dismiss after this many seconds. `0` = stays until she closes it. */
  seconds: number;
}) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Arrival: show once per session, after the page has had a moment to itself.
  useEffect(() => {
    if (readSeen() === imageUrl) return;
    const t = setTimeout(() => {
      markSeen(imageUrl);
      setOpen(true);
    }, APPEAR_DELAY_MS);
    return () => clearTimeout(t);
  }, [imageUrl]);

  // The console's duration. `0` is a real setting, not a missing one: it means
  // no timer at all, so the popup waits for her. Anything else closes itself.
  useEffect(() => {
    if (!open || seconds <= 0) return;
    const t = setTimeout(close, seconds * 1000);
    return () => clearTimeout(t);
  }, [open, seconds, close]);

  // Focus, Escape and the scroll lock — the same three the cart drawer does,
  // and for the same reasons. A modal that leaves the page scrollable behind it
  // is a modal a thumb scrolls straight past on a phone.
  useEffect(() => {
    if (!open) {
      if (lastFocused.current) {
        lastFocused.current.focus?.();
        lastFocused.current = null;
      }
      return;
    }

    lastFocused.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);

    const body = document.body;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width };

    body.style.overflow = "hidden";
    if (coarse) {
      // iOS Safari does not honour `overflow:hidden` on the body; only
      // `position:fixed` holds there.
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = "";
      if (coarse) {
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.width = previous.width;
        // Pinning the body scrolled the document to 0. Put her back.
        window.scrollTo(0, scrollY);
      }
    };
  }, [open, close]);

  // Unmounted while closed, unlike the cart drawer. The drawer opens and closes
  // many times and animates both ways; this opens once per visit and never
  // comes back, so leaving a full-screen scrim in the DOM for the rest of the
  // session buys nothing and risks eating clicks.
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Launch offer"}
      className="fixed inset-0 z-140 flex items-center justify-center p-[max(16px,env(safe-area-inset-left))]"
    >
      {/* Scrim. Clicking it closes, like the cart drawer's - and `aria-hidden`
          for the same reason: the dismissal it offers is already reachable, as
          the close button and as Escape. */}
      <div
        onClick={close}
        aria-hidden
        className="absolute inset-0 bg-midnight/55 motion-safe:animate-popup-scrim"
      />

      <div className="relative max-h-[min(86vh,760px)] w-auto max-w-[min(92vw,440px)] motion-safe:animate-popup-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          /* An offer is never decorative: an empty alt would tell a screen
             reader there is nothing here, in a dialog that has taken over the
             page. The fallback names the thing so the close button has context. */
          alt={alt || "Launch offer"}
          className="block h-auto max-h-[min(86vh,760px)] w-auto max-w-full rounded-card shadow-[0_24px_70px_-20px_rgb(39_44_5_/_0.55)]"
        />

        {/* The X. A full 44px touch target, on its own scrim-dark pill so it
            stays visible whatever the artwork puts behind it - a promo GIF is
            usually pale in exactly the corner a bare icon would sit in. */}
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label="Close offer"
          className="absolute top-2 right-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-midnight/60 text-paper backdrop-blur-sm transition-colors hover:bg-midnight/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper"
        >
          <Icon name="close" size={20} strokeWidth={2.1} />
        </button>
      </div>
    </div>
  );
}
