"use client";

import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Doodle } from "@/components/ui/Doodles";
import { Icon } from "@/components/ui/Icon";
import { usePrefersReducedMotion } from "@/lib/motion";
import { MOMENTS, type Moment } from "@/lib/moments";

/**
 * "Moments" — a centre-focused rail of the brand's Instagram clips and stills.
 *
 * Femi9's "Real Stories" rail (`components/VideoTestimonials.tsx` over there),
 * rebuilt on this app's Tailwind tokens rather than its hand-written CSS — the
 * same relationship the Journal and the checkout flow already have to their
 * Femi9 originals. The SHAPE came across; none of the palette did.
 *
 * One card is centred and active at a time, AT FULL LENGTH. When a clip ends
 * the rail advances on its own; a still has no end to reach, so it holds for
 * `STILL_DWELL` and then hands over. That mixed list is the one thing this rail
 * does that Femi9's does not: the source section is an Instagram feed, and half
 * of what the brand posts is a photo.
 *
 * There are only ever a handful of items, so the rail is an ENDLESS ROLL rather
 * than a row with two ends: the list is laid down several times over and the
 * roll folds back onto an identical card whenever it would run off the side.
 * Eight moments on a finite row means the last one is watched with half a screen
 * of paper beside it, and the wrap back to the first rewinds the whole rail in
 * front of the visitor. Folding costs nothing visually — the track repeats every
 * `count` cards, so the two positions are the same pixels — and the roll simply
 * keeps turning for as long as she watches. See `foldSlot` for the mechanics.
 *
 * The rules that keep an auto-playing rail from being hostile:
 * • It does nothing until the section is actually on screen. Playing clips for a
 *   section nobody has scrolled to would spend her data animating pixels out of
 *   view — and there is 26MB of video behind this rail.
 * • Sound is off until she asks for it. Autoplay with audio is blocked by every
 *   browser and rude besides; a click is what turns it on, and a click is also
 *   the one gesture browsers accept as consent for it.
 * • Only the current and next CLIP may preload. `preload="none"` everywhere else
 *   means the rail costs one poster per card until it starts.
 * • Reduced motion means it waits: nothing plays or advances until she picks a
 *   card. This is a moving carousel that also plays video, which is squarely
 *   what that preference is about.
 * • A hidden tab stops it, so it is not burning battery in the background.
 *
 * Nothing is captioned. The cards are the section — a label under every one of
 * them turns a wall of moments into a row of exhibits. The description is still
 * carried in the a11y tree: it is what every control on the card is labelled
 * with, and it is the still's `alt`.
 */

/** How long a photo card holds the middle before handing on. */
const STILL_DWELL = 4200;

/**
 * How many cards sit either side of the active one for the rail to look full to
 * both edges.
 *
 * These shoulders are what the rail is padded WITH. The alternative — a
 * half-screen lead-in of empty space — is a band of paper the moment the rail
 * sits anywhere near either end of its track, which is where it starts and where
 * a hand swipe can leave it. Real cards there cost nothing extra: every copy
 * shares its original's poster and sits at `preload="none"`, so sixteen cards is
 * still eight images.
 *
 * Five covers the widest case the card sizes below can resolve to: a card is at
 * most 400px on a 20px gap, so five reach 2100px — clear of the 1920px
 * half-screen of a 3840px display, and far clear of it at every width under.
 */
const SIDE_CARDS = 5;

/**
 * A layout effect that does not warn on the server.
 *
 * The fold has to be written to `scrollLeft` in the same frame React moves the
 * active card, or the browser paints one frame of the rail at the old offset
 * with the new card highlighted a screen away — a visible flinch at exactly the
 * moment the roll is meant to be seamless.
 */
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-full">
      <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6Z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-full">
      <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
    </svg>
  );
}

function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-full">
      <path d="M4 9.5v5a1 1 0 0 0 1 1h3l3.8 3.2a.8.8 0 0 0 1.3-.6V5.9a.8.8 0 0 0-1.3-.6L8 8.5H5a1 1 0 0 0-1 1Z" />
      {muted ? (
        <path
          d="m16.2 9.3 4.5 5.4M20.7 9.3l-4.5 5.4"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M16.4 8.6a4.6 4.6 0 0 1 0 6.8M18.9 6.4a8 8 0 0 1 0 11.2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          fill="none"
        />
      )}
    </svg>
  );
}

/** The round overlay controls on the active card. 44px on touch, per `coarse:`. */
const CTL =
  "absolute z-[3] grid size-9 place-items-center rounded-full border-0 bg-midnight/45 p-2 text-white opacity-85 backdrop-blur-[6px] transition-[opacity,background] hover:bg-midnight/70 hover:opacity-100 coarse:size-11";

function Card({
  item,
  index,
  isActive,
  playing,
  muted,
  folding,
  preload,
  register,
  onSelect,
  onToggle,
  onToggleSound,
  onEnded,
}: {
  item: Moment;
  index: number;
  isActive: boolean;
  playing: boolean;
  muted: boolean;
  folding: boolean;
  preload: "none" | "auto";
  register: (i: number, el: HTMLVideoElement | null) => void;
  onSelect: (i: number) => void;
  onToggle: () => void;
  onToggleSound: () => void;
  onEnded: (i: number) => void;
}) {
  /**
   * The progress fill, written to directly on every `timeupdate`. Routing that
   * through state would re-render the whole rail four times a second.
   */
  const barRef = useRef<HTMLSpanElement>(null);
  const isClip = Boolean(item.video);

  return (
    <li className="flex flex-none w-[var(--m-w)] snap-center flex-col items-center">
      <div
        className={[
          "relative w-full overflow-hidden rounded-media bg-shell",
          // Same WIDTH as its neighbours and simply taller — scaling the active
          // card in both axes would push the neighbours off-centre every time
          // the rail advanced.
          isActive ? "h-[var(--m-h-active)] shadow-hero" : "h-[var(--m-h)] shadow-soft",
          // The frame the roll folds in: the card arriving at the centre has to
          // be full height IMMEDIATELY. Animating it up from neighbour size is
          // the one difference that would betray the seam.
          folding ? "transition-none" : "transition-[height,box-shadow] duration-500 ease-[var(--ease-reveal)]",
        ].join(" ")}
      >
        {isClip ? (
          <video
            ref={(el) => register(index, el)}
            className={[
              "block size-full object-cover",
              // The neighbours sit back a step so the middle of the rail is
              // unambiguously the thing being watched.
              isActive ? "" : "[filter:saturate(0.92)brightness(0.94)] transition-[filter]",
            ].join(" ")}
            src={item.video}
            poster={item.poster}
            playsInline
            preload={preload}
            onEnded={() => onEnded(index)}
            onTimeUpdate={(e) => {
              if (!isActive) return;
              const v = e.currentTarget;
              const bar = barRef.current;
              if (bar && v.duration) bar.style.transform = `scaleX(${v.currentTime / v.duration})`;
            }}
            // Decorative in the a11y tree: the buttons over it are the labelled
            // controls and `alt` rides on those.
            aria-hidden="true"
            tabIndex={-1}
          />
        ) : (
          /* `unoptimized`, like the feature wall on this page: the file is an
             already-sized JPEG behind CloudFront, and the optimiser would only
             re-fetch it through the app server. */
          <Image
            src={item.poster}
            alt={item.alt}
            fill
            unoptimized
            sizes="(max-width: 620px) 66vw, (max-width: 1024px) 30vw, 400px"
            className={[
              "object-cover",
              isActive ? "" : "[filter:saturate(0.92)brightness(0.94)] transition-[filter]",
            ].join(" ")}
          />
        )}

        {/* Full-bleed click target, UNDER the controls, so pause and mute stay
            clickable while the rest of the card is one big "this one" surface. */}
        <button
          type="button"
          className="absolute inset-0 z-[2] cursor-pointer border-0 bg-transparent p-0"
          onClick={() => (isActive && isClip ? onToggle() : onSelect(index))}
          aria-label={
            isActive && isClip
              ? playing
                ? `Pause: ${item.alt}`
                : `Play: ${item.alt}`
              : isClip
                ? `Play with sound: ${item.alt}`
                : `Bring to the front: ${item.alt}`
          }
        />

        {/* The only cue on a poster frame that there is a video behind it. A
            still gets none — nothing plays, and a play glyph over a photo is a
            promise the card cannot keep. */}
        {!isActive && isClip && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-1/2 z-[3] grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-canvas/90 p-3 pl-[13px] text-moss-deep shadow-soft"
          >
            <PlayGlyph />
          </span>
        )}

        {isActive && isClip && (
          <>
            {/* Transport top-left, sound bottom-right — clear of the burned-in
                captions these creatives carry through the middle. */}
            <button
              type="button"
              className={`${CTL} top-2.5 left-2.5`}
              onClick={onToggle}
              aria-label={playing ? "Pause this moment" : "Play this moment"}
            >
              {playing ? <PauseGlyph /> : <PlayGlyph />}
            </button>
            <button
              type="button"
              className={`${CTL} right-2.5 bottom-2.5`}
              onClick={onToggleSound}
              aria-label={muted ? "Unmute this moment" : "Mute this moment"}
              aria-pressed={!muted}
            >
              <SoundGlyph muted={muted} />
            </button>

            {/* How far through the clip we are. The point of playing a clip to
                its end rather than cutting it off is that there IS an end, so it
                is worth showing where it is. A still has no duration to show and
                gets no bar. */}
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 z-[3] h-[3px] bg-canvas/30">
              <span ref={barRef} className="block size-full origin-left scale-x-0 bg-canvas" />
            </span>
          </>
        )}
      </div>
    </li>
  );
}

export function Moments() {
  const count = MOMENTS.length;

  /**
   * The track: one run of the list with `SIDE_CARDS` of wrap-around either side,
   * so `track[i]` and `track[i + count]` are always the same moment.
   *
   * That is the whole trick. The active card only ever occupies the middle band
   * — positions `SIDE_CARDS` to `SIDE_CARDS + count - 1`, one per moment — and
   * the shoulders exist so the band's outermost cards still have a full rail
   * beside them, and so a swipe past the band meets more cards rather than the
   * end of the rail.
   */
  const total = count < 2 ? count : count + 2 * SIDE_CARDS;
  const track = Array.from({ length: total }, (_, i) => MOMENTS[i % count]);

  /**
   * Fold a position back into that band, onto the identical card `count` places
   * away. Because the two positions show the same moment with the same
   * neighbours, a rail teleported between them is pixel-for-pixel unchanged —
   * which is what lets the roll pass the last card and land on the first with no
   * rewind. Pure, and used both to move the roll and to decide what to preload.
   */
  const foldSlot = useCallback(
    (slot: number) => {
      if (count < 2) return 0;
      let i = slot;
      while (i < SIDE_CARDS) i += count;
      while (i > total - 1 - SIDE_CARDS) i -= count;
      return i;
    },
    [count, total],
  );

  const railRef = useRef<HTMLUListElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const videos = useRef<(HTMLVideoElement | null)[]>([]);

  /**
   * Start in the MIDDLE of the track, not at the front.
   *
   * The rail centres whatever is active, and a card at the front can only be
   * centred by leaving half a screen of nothing to the left of it — the section
   * would open on a lone card in a gutter. Starting halfway in means the band is
   * full on both sides from the first paint. Same value on the server and the
   * client, so hydration agrees.
   *
   * `jumped` rides along with the index rather than living in its own state: the
   * scroll and the card that grows have to agree about whether this move is a
   * glide or a fold, and two states would let them disagree for a frame.
   */
  const [pos, setPos] = useState(() => ({
    index: count < 2 ? 0 : SIDE_CARDS + Math.floor(count / 2),
    jumped: false,
  }));
  const active = pos.index;
  const [inView, setInView] = useState(false);
  const reduced = usePrefersReducedMotion();
  /**
   * Whether the rail should be running at all.
   *
   * `null` is "whatever her motion preference implies" — turning normally, held
   * under `prefers-reduced-motion: reduce`. Any press pins it to a real boolean,
   * so choosing a moment starts the rail even under reduced motion (she asked
   * for that one) and pausing stops it even without.
   *
   * DERIVED, rather than an effect that writes `playing` on mount. The
   * preference is an external store, and `usePrefersReducedMotion` reads it
   * through `useSyncExternalStore` with a `false` server snapshot — so this
   * agrees across hydration without a second render that corrects itself, which
   * is what the mount effect was really buying.
   */
  const [intent, setIntent] = useState<boolean | null>(null);
  const playing = intent ?? !reduced;
  const [muted, setMuted] = useState(true);

  const register = useCallback((i: number, el: HTMLVideoElement | null) => {
    videos.current[i] = el;
  }, []);

  /** Move the roll one card. Never runs out of track: it folds instead. */
  const go = useCallback(
    (dir: -1 | 1) =>
      setPos(({ index }) => {
        const next = foldSlot(index + dir);
        return { index: next, jumped: next !== index + dir };
      }),
    [foldSlot],
  );

  // Only run while the section is genuinely on screen. Not unobserved after the
  // first hit, unlike a reveal: scrolling away has to STOP it.
  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // Everything that is not active is stopped and rewound, so coming back to a
  // clip starts it from the top rather than mid-sentence.
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v || i === active) return;
      v.pause();
      v.currentTime = 0;
    });
  }, [active]);

  /**
   * Drive the active card — and this is where the two kinds part company.
   *
   * A clip is played and hands over from `onEnded`. A still has no such event,
   * so the dwell timer IS its "ended": same contract, same `go(1)`, so the roll
   * does not need to know which kind it is turning past.
   *
   * Deliberately does NOT depend on `muted`: toggling sound must not restart
   * playback, so the mute handler sets it on the element directly and this only
   * applies the current value when it (re)starts one.
   */
  useEffect(() => {
    if (!inView || !playing) {
      videos.current[active]?.pause();
      return;
    }

    const v = videos.current[active];
    if (v) {
      v.muted = muted;
      void v.play().catch(() => {
        // No gesture is in flight here — this is the rail moving on by itself —
        // so a browser that has not granted unmuted autoplay will refuse. Drop
        // the sound rather than the moment and try once more; if that fails too
        // (data-saver, battery-saver) the poster simply stays.
        if (!v.muted) {
          v.muted = true;
          setMuted(true);
          void v.play().catch(() => {});
        }
      });
      return;
    }

    const t = window.setTimeout(() => go(1), STILL_DWELL);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, inView, playing, go]);

  // Scroll the ACTIVE card to the middle of the rail. Scrolls the rail itself
  // rather than calling scrollIntoView, which would also scroll the PAGE and
  // yank the visitor around while she is reading something else on the way past.
  //
  // Deliberately NOT gated on `inView`, unlike the effect above. Gated, the rail
  // holds scrollLeft 0 until the section crosses the observer's threshold, and
  // at 0 the whole left half is shoulder — the section reads as a band of paper
  // with a few cards pushed off to the right, which is what it must not look
  // like. Taking the opening position on mount costs one scrollLeft write and no
  // bytes: nothing plays and nothing is fetched until `inView` flips.
  //
  // Two moves are not animated: the very first, which is the rail taking up its
  // opening position rather than advancing anywhere, and a fold, which is a
  // teleport onto identical pixels and would read as a rewind if it glided.
  const settled = useRef(false);
  useIsoLayoutEffect(() => {
    const rail = railRef.current;
    const card = rail?.children[active] as HTMLElement | undefined;
    if (!rail || !card) return;
    const target = card.offsetLeft + card.offsetWidth / 2 - rail.clientWidth / 2;
    rail.scrollTo({
      left: Math.max(0, target),
      behavior: pos.jumped || !settled.current ? "auto" : "smooth",
    });
    settled.current = true;
  }, [pos, active]);

  // A background tab should not be decoding video. `playing` is left alone, so
  // coming back resumes whichever card was current.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) videos.current.forEach((v) => v?.pause());
      else if (playing && inView) void videos.current[active]?.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active, playing, inView]);

  /**
   * Picking a card. The click is a user gesture, so this is the one moment the
   * browser will let sound start — hence `play()` here, imperatively, rather
   * than leaving it to the effect above, whose call happens a tick later and can
   * fall outside the gesture window.
   *
   * Takes a track position, which for a card near the edge of the visible band
   * can belong to a neighbouring copy; folding it keeps the roll's invariant
   * without changing what she sees.
   */
  const select = useCallback(
    (slot: number) => {
      const i = foldSlot(slot);
      setPos({ index: i, jumped: i !== slot });
      setIntent(true);

      const v = videos.current[i];
      if (!v) return; // a still — nothing to start, the dwell effect takes it
      setMuted(false);
      v.muted = false;
      v.currentTime = 0;
      void v.play().catch(() => {
        // Refused even with a gesture (some mobile data-saver modes). Fall back
        // to muted so the click still does something visible.
        v.muted = true;
        setMuted(true);
        void v.play().catch(() => {});
      });
    },
    [foldSlot],
  );

  /**
   * Play/pause whatever is in the middle. On a still this holds it there.
   *
   * Resolves `null` against the CURRENT preference before flipping, so the
   * first press on a rail that is being held by reduced motion starts it rather
   * than toggling an intent nobody set.
   */
  const toggle = useCallback(() => setIntent((prev) => !(prev ?? !reduced)), [reduced]);

  const toggleSound = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const v = videos.current[active];
      if (v) v.muted = next;
      return next;
    });
  }, [active]);

  /**
   * A clip that has run its course hands the rail on — and after the last moment
   * that is the first one again, because `go` folds rather than stopping. A rail
   * of one has nowhere to hand off to, so it replays.
   */
  const handleEnded = useCallback(
    (i: number) => {
      if (i !== active) return;
      if (count < 2) {
        const v = videos.current[i];
        if (v) {
          v.currentTime = 0;
          void v.play().catch(() => {});
        }
        return;
      }
      go(1);
    },
    [active, count, go],
  );

  if (count === 0) return null;

  /**
   * What plays next, folded the same way the roll itself will fold — so at the
   * seam between last moment and first it is the card the roll actually lands on
   * that has been warmed up, not the one at the end of the track nobody reaches.
   */
  const upcoming = foldSlot(active + 1);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="moments-heading"
      /* moss-tint, not paper: the journal above is canvas and the reviews below
         are paper, and a paper band between them would merge with the reviews
         into one field with two headings floating in it. Three tones, three
         sections. */
      className="relative overflow-hidden bg-moss-tint py-section"
    >
      <div className="page-wrap">
        <Reveal>
          <div className="relative mx-auto max-w-[46ch] text-center">
            <Doodle
              mark="star"
              size={22}
              rotate={-14}
              className="absolute -top-3 -left-2 text-gold/60 sm:-left-8"
            />
            <Doodle
              mark="cloud"
              size={24}
              rotate={9}
              className="absolute -top-2 -right-2 text-moss-soft/60 sm:-right-8"
            />
            <h2
              id="moments-heading"
              className="text-balance font-display text-[clamp(26px,3.4vw,40px)] leading-[1.12] font-700 text-moss-deep"
            >
              Some things don’t need words, you just feel them
            </h2>
            <p className="mt-3 text-[15px] text-muted">Let your baby’s reaction say it all.</p>
          </div>
        </Reveal>
      </div>

      {/*
        Full-bleed, and no `page-wrap` on the rail: it runs to both gutters with
        the outer cards cropped by the edge, and that crop is load-bearing — it
        is what makes the middle card read as the one being watched rather than
        as the first of a row. The section is already the full width of the body,
        so this needs no 100vw trick; `body { overflow-x: hidden }` and
        `scrollbar-gutter: stable` in globals.css make one wrong anyway - 100vw
        counts the scrollbar the gutter has reserved, so it overflows by ~15px.

        The geometry lives in three custom properties so there is ONE place to
        change it. Phone values are the base: at the desktop clamps a 390px
        viewport collapses to the 190px floor, which leaves the card that is
        actually playing smaller than a thumbnail with two slivers of neighbour
        beside it. Give the rail most of the screen there and let the neighbours
        be the slivers.
      */}
      <ul
        ref={railRef}
        aria-label="Lumi9 on Instagram"
        className={[
          "mt-9 flex list-none items-center overflow-x-auto overscroll-x-contain",
          "gap-[clamp(10px,1.4vw,20px)] px-[clamp(10px,1.4vw,20px)] py-2",
          "snap-x snap-proximity no-scrollbar",
          "[--m-w:66vw] [--m-h:92vw] [--m-h-active:118vw]",
          "min-[620px]:[--m-w:clamp(190px,22vw,400px)]",
          "min-[620px]:[--m-h:clamp(300px,29vw,532px)]",
          "min-[620px]:[--m-h-active:clamp(370px,36vw,670px)]",
        ].join(" ")}
      >
        {track.map((item, i) => (
          <Card
            key={`${item.id}-${i}`}
            item={item}
            index={i}
            isActive={i === active}
            playing={playing}
            muted={muted}
            folding={pos.jumped}
            register={register}
            onSelect={select}
            onToggle={toggle}
            onToggleSound={toggleSound}
            onEnded={handleEnded}
            // Current and next only. Everything else stays at `none`, so the
            // rail costs one poster per card until it actually starts — and the
            // copies share those posters, so repeating the list costs no extra
            // requests either.
            preload={inView && (i === active || i === upcoming) ? "auto" : "none"}
          />
        ))}
      </ul>

      {/* No dots. A row of them is a progress meter — "eight moments, you are on
          the fourth" — and this rail has no fourth of eight: it turns for as long
          as she watches. Counting them out under an endless roll invites her to
          sit and wait for the set to finish. The arrows still let her move by
          hand, and every card is its own jump-to control. */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous moment"
          className="grid size-10 place-items-center rounded-full border border-midnight/10 bg-canvas text-moss-deep transition-transform hover:scale-108 hover:shadow-soft coarse:size-11"
        >
          <Icon name="arrowLeft" size={16} strokeWidth={1.9} />
        </button>
        <a
          href="https://www.instagram.com/lumi9official"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[14px] font-700 text-moss-deep hover:text-midnight coarse:min-h-11 coarse:content-center"
        >
          @lumi9official
        </a>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next moment"
          className="grid size-10 place-items-center rounded-full border border-midnight/10 bg-canvas text-moss-deep transition-transform hover:scale-108 hover:shadow-soft coarse:size-11"
        >
          <Icon name="arrowRight" size={16} strokeWidth={1.9} />
        </button>
      </div>
    </section>
  );
}
