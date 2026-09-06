"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion";

export type ScrubAxis = "horizontal" | "vertical";
export type ScrubTrackingArea = "component" | "window";
export type ScrubObjectFit = "cover" | "contain" | "fill";

export type CursorScrubVideoProps = {
  /** Video URL. See ENCODING below - a normal MP4 will stutter. */
  src: string;
  /** First frame, shown while the file buffers. Keep it small; it is the LCP paint. */
  poster?: string;
  /** Which cursor axis drives the playhead. */
  axis?: ScrubAxis;
  /** Flip the mapping on the chosen axis. */
  reverse?: boolean;
  /** Measure the cursor against this component's box, or the whole viewport. */
  trackingArea?: ScrubTrackingArea;
  /** 0.02-1. Higher is snappier, lower carries more inertia. */
  smoothing?: number;
  objectFit?: ScrubObjectFit;
  showPoster?: boolean;
  borderRadius?: number;
  /** Extra scale applied as the cursor closes in. 0 disables the effect. */
  loom?: number;
  /** One-line affordance, shown until the first scrub and then retired. */
  hint?: string;
  /** Required: the video carries meaning, so it needs a name. */
  label: string;
  /** Fade the rectangle's edges out so it sits on a coloured page. */
  feather?: boolean;
  className?: string;
};

/**
 * A video whose playhead follows the cursor instead of a clock.
 *
 * ENCODING - this is the whole trick, and it is not optional. Seeking lands on
 * the nearest KEYFRAME, so a normally-encoded video (one keyframe every ~2s)
 * gives you about five distinct stills across the entire travel and a visible
 * lurch between each. Every frame has to be a keyframe:
 *
 *   ffmpeg -i in.mp4 -c:v libx264 -preset slow -crf 18 \
 *     -g 1 -keyint_min 1 -x264-params "scenecut=0" \
 *     -profile:v high -pix_fmt yuv420p -movflags +faststart -an out.mp4
 *
 * That inflates the file - all-intra has no interframe compression to lean on -
 * so pay for it by cropping dead space and dropping resolution rather than by
 * raising CRF, which is what puts banding into flat gradient backgrounds.
 *
 * DEGRADATION - a cursor is not a given, and this is the difference between a
 * clever hero and one that is simply broken for half its audience:
 *   - fine pointer          -> scrub (the intended experience)
 *   - coarse/no pointer     -> muted autoplay loop, so touch users see the
 *                              animation play rather than one frozen frame
 *   - prefers-reduced-motion -> hold frame 0, no scrub and no loop
 * Any failure at all leaves the poster on screen. It never renders empty.
 */
export function CursorScrubVideo({
  src,
  poster,
  axis = "horizontal",
  reverse = false,
  trackingArea = "component",
  smoothing = 0.22,
  objectFit = "cover",
  showPoster = true,
  borderRadius = 0,
  loom = 0.045,
  hint,
  label,
  feather = false,
  className = "",
}: CursorScrubVideoProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const loopingRef = useRef(false);
  const scrubbedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [scrubbed, setScrubbed] = useState(false);
  const [finePointer, setFinePointer] = useState<boolean | null>(null);

  const reducedMotion = usePrefersReducedMotion();

  // `null` until matchMedia has been read, so the first paint commits to
  // neither branch and hydration cannot mismatch.
  const scrubs = finePointer === true && !reducedMotion;
  const loops = finePointer === false && !reducedMotion;

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFinePointer(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  usePrime(videoRef, loopingRef, src);

  useScrub({
    hostRef,
    videoRef,
    scrubbedRef,
    onFirstScrub: () => setScrubbed(true),
    active: scrubs && ready,
    axis,
    reverse,
    trackingArea,
    smoothing,
    loom,
  });

  useLoop(videoRef, loopingRef, loops);

  return (
    <div
      ref={hostRef}
      className={`relative isolate overflow-hidden ${className}`}
      style={{ borderRadius: borderRadius || undefined }}
    >
      <video
        ref={videoRef}
        src={src}
        poster={showPoster ? poster : undefined}
        aria-label={label}
        muted
        playsInline
        preload="auto"
        disableRemotePlayback
        tabIndex={-1}
        className="size-full will-change-transform"
        style={{
          objectFit,
          transformOrigin: "50% 55%",
          // The feather lives on the VIDEO, not the wrapper. On the wrapper it
          // fades every overlay with it - the hint pill included - and an
          // affordance you cannot read is worse than none at all.
          //
          // `closest-side` is the part that actually works: a percentage radius
          // is measured against the box, so the fade can still be mid-gradient
          // when it reaches the edge, leaving a soft-looking tile with hard
          // corners. closest-side pins full transparency TO the nearest edge.
          maskImage: feather ? "radial-gradient(ellipse closest-side at 50% 45%, #000 72%, rgba(0,0,0,0.6) 90%, transparent 100%)" : undefined,
          WebkitMaskImage: feather ? "radial-gradient(ellipse closest-side at 50% 45%, #000 72%, rgba(0,0,0,0.6) 90%, transparent 100%)" : undefined,
        }}
        onCanPlayThrough={() => setReady(true)}
      />
      {hint && scrubs && ready && !scrubbed && <ScrubHint text={hint} />}
    </div>
  );
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Forces the browser to decode and buffer seekable frames.
 *
 * `preload="auto"` fetches bytes but does not guarantee a decoded picture, so
 * the first seek can land on nothing. A muted play/pause pair does guarantee it,
 * and muted playback needs no user gesture - which is the only reason this is
 * allowed to run on mount at all.
 */
function usePrime(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  loopingRef: React.RefObject<boolean>,
  src: string,
) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Set as a PROPERTY, not just the JSX attribute. React's SSR markup carries
    // muted="" but hydration does not reliably reassign it, and an unmuted video
    // has its play() rejected - which would silently kill the buffer priming
    // below and leave the first scrub landing on an undecoded frame.
    video.muted = true;
    video.load();
    const started = video.play();
    if (started) {
      started
        .then(() => {
          // The loop branch may have claimed playback while this promise was in
          // flight; pausing there would freeze the very thing it just started.
          if (loopingRef.current) return;
          video.pause();
          video.currentTime = 0;
        })
        .catch(() => {
          // Autoplay refused outright. Scrubbing still works - seeking is not
          // playback - so there is nothing to recover from.
        });
    }

    return () => {
      video.pause();
    };
  }, [videoRef, loopingRef, src]);
}

/** Coarse-pointer fallback: play it, so a phone sees the animation. */
function useLoop(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  loopingRef: React.RefObject<boolean>,
  active: boolean,
) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;

    loopingRef.current = true;
    video.loop = true;
    const started = video.play();
    if (started) started.catch(() => {});

    return () => {
      loopingRef.current = false;
      video.loop = false;
      video.pause();
    };
  }, [videoRef, loopingRef, active]);
}

/** The scrub loop: pointer -> normalised position -> lerped playhead. */
function useScrub({
  hostRef,
  videoRef,
  scrubbedRef,
  onFirstScrub,
  active,
  axis,
  reverse,
  trackingArea,
  smoothing,
  loom,
}: {
  hostRef: React.RefObject<HTMLDivElement | null>;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  scrubbedRef: React.RefObject<boolean>;
  onFirstScrub: () => void;
  active: boolean;
  axis: ScrubAxis;
  reverse: boolean;
  trackingArea: ScrubTrackingArea;
  smoothing: number;
  loom: number;
}) {
  // Held in a ref so a fresh inline callback each render does not tear down and
  // rebuild the pointer listeners and the rAF loop underneath the interaction.
  const notify = useRef(onFirstScrub);
  useEffect(() => {
    notify.current = onFirstScrub;
  }, [onFirstScrub]);

  useEffect(() => {
    const host = hostRef.current;
    const video = videoRef.current;
    if (!host || !video || !active) return;

    const ease = clamp01(smoothing) || 0.22;
    let raf = 0;
    let seeking = false;
    let target = 0;
    let current = 0;
    let loomNow = 0;
    let loomTarget = 0;

    const onSeeking = () => {
      seeking = true;
    };
    const onSeeked = () => {
      seeking = false;
    };
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);

    const onMove = (event: PointerEvent) => {
      // Touch drags are scrolls, not aiming. Reading them would yank the
      // playhead around under the thumb while someone is trying to leave.
      if (event.pointerType !== "mouse") return;

      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      let nx: number;
      let ny: number;
      if (trackingArea === "window") {
        nx = event.clientX / window.innerWidth;
        ny = event.clientY / window.innerHeight;
      } else {
        // Deliberately NOT offsetX/offsetY: those are relative to whatever the
        // event happened to hit, so the moment the pointer crosses a child the
        // origin jumps and the playhead snaps. clientX minus the host's own
        // rect is the same number, measured from a box that does not move.
        nx = (event.clientX - rect.left) / rect.width;
        ny = (event.clientY - rect.top) / rect.height;
      }

      let pos = clamp01(axis === "horizontal" ? nx : ny);
      if (reverse) pos = 1 - pos;

      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) target = pos * duration;

      // Loom: how close the cursor is to the character, 0 at arm's length.
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const reach = Math.max(rect.width, rect.height);
      loomTarget = clamp01(1 - Math.hypot(dx, dy) / reach);

      if (!scrubbedRef.current) {
        scrubbedRef.current = true;
        notify.current();
      }
    };

    const frame = () => {
      const duration = video.duration;
      if (Number.isFinite(duration) && duration > 0) {
        current += (target - current) * ease;
        // Two guards, both load-bearing. Seeking while a seek is outstanding
        // makes the decoder drop the earlier request and the picture stalls;
        // and re-seeking for sub-frame deltas (a 24fps frame is 41ms) is pure
        // churn that shows up as jitter rather than smoothness.
        if (!seeking && Math.abs(video.currentTime - current) > 0.008) {
          video.currentTime = current;
        }
      }
      loomNow += (loomTarget - loomNow) * 0.08;
      video.style.transform = `scale(${(1 + loomNow * loom).toFixed(4)})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const surface: Window | HTMLDivElement = trackingArea === "window" ? window : host;
    surface.addEventListener("pointermove", onMove as EventListener, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      surface.removeEventListener("pointermove", onMove as EventListener);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.style.transform = "";
    };
  }, [hostRef, videoRef, scrubbedRef, active, axis, reverse, trackingArea, smoothing, loom]);
}

/** Says what to do, once, then gets out of the way for good. */
function ScrubHint({ text }: { text: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[6%] z-2 flex justify-center px-4">
      <span className="inline-flex items-center gap-2 rounded-pill border border-moss-tint bg-canvas/92 px-[13px] py-[6px] text-[12px] font-semibold text-moss-deep shadow-sm backdrop-blur-sm motion-safe:animate-pulse">
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
          <path
            d="M3 2.5l9.5 5.2-4.1 1-1.9 4.1z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
        {text}
      </span>
    </div>
  );
}
