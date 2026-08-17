'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  VIDEO_TESTIMONIALS,
  testimonialsForProduct,
  type VideoTestimonial,
} from '../data/videoTestimonials'
import '../styles/video-testimonials.css'

/**
 * "Real Stories" — a centre-focused rail of customer clips.
 *
 * One clip plays at a time, in the middle of the rail, AT FULL LENGTH. When it
 * ends the rail advances to the next one on its own. The previous version cut
 * every clip off after three seconds on a timer, which showed the first breath
 * of six stories and the whole of none of them.
 *
 * The rules that keep an auto-playing rail from being hostile:
 * • It does nothing until the section is actually on screen. Playing clips for
 *   a section nobody has scrolled to would download several MB of video — her
 *   data — to animate pixels out of view.
 * • Sound is off until she asks for it. Autoplay with audio is both blocked by
 *   every browser and rude; a click is what turns it on (and a click is also
 *   the one gesture browsers accept as consent for it).
 * • Only the current and next clip are allowed to preload. `preload="none"`
 *   everywhere else means the rail costs one poster per card until it starts.
 * • Reduced motion means it waits: nothing plays or advances until she picks a
 *   clip. This is a moving carousel that also plays video, which is squarely
 *   what that preference is about.
 * • A hidden tab stops it, so it is not burning battery in the background.
 *
 * Nothing is captioned. The cards are the section — a name under every one of
 * them turns a wall of faces into a row of labelled exhibits, and the clips
 * introduce their own speakers anyway. The name is still carried in the a11y
 * tree: it is what every control on the card is labelled with.
 */

interface Props {
  /** Scope to one product's clips. Omit for every clip (the landing rail). */
  productId?: string
  /** Pass null where the host section already has its own heading. */
  heading?: string | null
  subhead?: string | null
  /** Extra class on the <section>, for host-page overrides. */
  className?: string
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6Z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
    </svg>
  )
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
  )
}

function Clip({
  clip,
  index,
  isActive,
  playing,
  muted,
  preload,
  register,
  onSelect,
  onToggle,
  onToggleSound,
  onEnded,
}: {
  clip: VideoTestimonial
  index: number
  isActive: boolean
  playing: boolean
  muted: boolean
  preload: 'none' | 'metadata' | 'auto'
  register: (i: number, el: HTMLVideoElement | null) => void
  onSelect: (i: number) => void
  onToggle: () => void
  onToggleSound: () => void
  onEnded: (i: number) => void
}) {
  /** The progress fill. Written to directly on every timeupdate — routing that
   *  through state would re-render the whole rail four times a second. */
  const barRef = useRef<HTMLElement>(null)

  return (
    <li className={`vt-card${isActive ? ' is-active' : ''}`}>
      <div className="vt-frame">
        <video
          ref={(el) => register(index, el)}
          className="vt-video"
          src={clip.src}
          poster={clip.poster}
          playsInline
          preload={preload}
          onEnded={() => onEnded(index)}
          onTimeUpdate={(e) => {
            if (!isActive) return
            const v = e.currentTarget
            const bar = barRef.current
            if (bar && v.duration) bar.style.transform = `scaleX(${v.currentTime / v.duration})`
          }}
          // Decorative in the a11y tree: the buttons over it are the labelled
          // controls and the name below is the text alternative.
          aria-hidden="true"
          tabIndex={-1}
        />

        <button
          type="button"
          className="vt-hit"
          onClick={() => (isActive ? onToggle() : onSelect(index))}
          aria-label={
            isActive
              ? playing
                ? `Pause ${clip.name}'s story`
                : `Play ${clip.name}'s story`
              : `Play ${clip.name}'s story with sound`
          }
        />

        {!isActive && (
          <span className="vt-badge" aria-hidden="true">
            <PlayIcon />
          </span>
        )}

        {isActive && (
          <>
            <button
              type="button"
              className="vt-ctl vt-ctl--transport"
              onClick={onToggle}
              aria-label={playing ? 'Pause this story' : 'Play this story'}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              className="vt-ctl vt-ctl--sound"
              onClick={onToggleSound}
              aria-label={muted ? 'Unmute this story' : 'Mute this story'}
              aria-pressed={!muted}
            >
              <SoundIcon muted={muted} />
            </button>
            <span className="vt-progress" aria-hidden="true">
              <i ref={barRef} />
            </span>
          </>
        )}
      </div>

    </li>
  )
}

export function VideoTestimonials({
  productId,
  heading = 'Real Stories',
  subhead = 'Customers on what changed after they switched.',
  className,
}: Props) {
  const clips = productId ? testimonialsForProduct(productId) : VIDEO_TESTIMONIALS

  const railRef = useRef<HTMLUListElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const videos = useRef<(HTMLVideoElement | null)[]>([])

  /**
   * Start in the MIDDLE of the list, not at the front.
   *
   * The rail centres whatever is playing, and the first clip can only be
   * centred by leaving half a screen of nothing to the left of it — the section
   * would open on a lone card in a gutter. Starting halfway in means the band is
   * full of faces on both sides from the first paint, which is the shape of the
   * design. Same value on the server and the client, so hydration agrees.
   */
  const [active, setActive] = useState(() => Math.floor(clips.length / 2))
  const [inView, setInView] = useState(false)
  /** What the visitor wants: whether the active clip should be running. */
  const [playing, setPlaying] = useState(true)
  const [muted, setMuted] = useState(true)

  const register = useCallback((i: number, el: HTMLVideoElement | null) => {
    videos.current[i] = el
  }, [])

  // Reduced motion: hold everything until she picks a clip. Applied in an
  // effect rather than in the initial state so the server and the first client
  // render agree — the transport icon depends on this.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false)
  }, [])

  // Only run while the section is genuinely on screen. Not unobserved after the
  // first hit, unlike a reveal animation: scrolling away has to STOP it.
  useEffect(() => {
    const node = sectionRef.current
    if (!node) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  // Everything that is not the active clip is stopped and rewound, so coming
  // back to one starts the story from the top rather than mid-sentence.
  useEffect(() => {
    videos.current.forEach((v, i) => {
      if (!v || i === active) return
      v.pause()
      v.currentTime = 0
    })
  }, [active])

  // Drive the active clip. Deliberately does NOT depend on `muted`: toggling
  // sound must not restart playback, so the mute handler sets it on the element
  // directly and this only applies the current value when it (re)starts one.
  useEffect(() => {
    const v = videos.current[active]
    if (!v) return
    v.muted = muted
    if (inView && playing) {
      void v.play().catch(() => {
        // No gesture is in flight here — this is the rail moving on by itself —
        // so a browser that has not granted unmuted autoplay will refuse. Drop
        // the sound rather than the story and try once more; if that fails too
        // (data-saver, battery-saver) the poster simply stays.
        if (!v.muted) {
          v.muted = true
          setMuted(true)
          void v.play().catch(() => {})
        }
      })
    } else {
      v.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, inView, playing])

  // Scroll the ACTIVE card to the middle of the rail. Scrolls the rail itself
  // rather than calling scrollIntoView, which would also scroll the page
  // vertically and yank the visitor around while she is reading something else
  // on the way past.
  useEffect(() => {
    const rail = railRef.current
    const card = rail?.children[active] as HTMLElement | undefined
    if (!rail || !card || !inView) return
    const target = card.offsetLeft + card.offsetWidth / 2 - rail.clientWidth / 2
    rail.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [active, inView])

  // A background tab should not be decoding video. `playing` is left alone, so
  // coming back resumes whichever clip was current.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) videos.current.forEach((v) => v?.pause())
      else if (playing && inView) void videos.current[active]?.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [active, playing, inView])

  const go = useCallback(
    (dir: -1 | 1) => setActive((i) => (i + dir + clips.length) % clips.length),
    [clips.length],
  )

  /**
   * Picking a clip. The click is a user gesture, so this is the one moment the
   * browser will let sound start — hence `play()` here, imperatively, rather
   * than leaving it to the effect above, whose call happens a tick later and
   * can fall outside the gesture window.
   */
  const select = useCallback((i: number) => {
    const v = videos.current[i]
    setActive(i)
    setPlaying(true)
    setMuted(false)
    if (!v) return
    v.muted = false
    v.currentTime = 0
    void v.play().catch(() => {
      // Refused even with a gesture (some mobile data-saver modes). Fall back
      // to muted so the click still does something visible.
      v.muted = true
      setMuted(true)
      void v.play().catch(() => {})
    })
  }, [])

  /** Play/pause the clip already in the middle. */
  const toggle = useCallback(() => setPlaying((p) => !p), [])

  const toggleSound = useCallback(() => {
    setMuted((m) => {
      const next = !m
      const v = videos.current[active]
      if (v) v.muted = next
      return next
    })
  }, [active])

  /** A clip that has run its course hands the rail to the next story. */
  const handleEnded = useCallback(
    (i: number) => {
      if (i !== active) return
      if (clips.length < 2) {
        setPlaying(false)
        return
      }
      go(1)
    },
    [active, clips.length, go],
  )

  if (clips.length === 0) return null

  return (
    <section
      className={`vt-section${className ? ` ${className}` : ''}`}
      aria-labelledby={heading ? 'vt-heading' : undefined}
      aria-label={heading ? undefined : 'Customer video stories'}
      ref={sectionRef}
    >
      {heading && (
        <h2 className="vt-heading" id="vt-heading">
          {heading}
        </h2>
      )}
      {subhead && <p className="vt-sub">{subhead}</p>}

      <ul className="vt-rail" ref={railRef}>
        {clips.map((clip, i) => (
          <Clip
            key={clip.id}
            clip={clip}
            index={i}
            isActive={i === active}
            playing={playing}
            muted={muted}
            register={register}
            onSelect={select}
            onToggle={toggle}
            onToggleSound={toggleSound}
            onEnded={handleEnded}
            // Current and next only. Everything else stays at `none`, so the
            // rail costs one poster per card until it actually starts.
            preload={inView && (i === active || i === (active + 1) % clips.length) ? 'auto' : 'none'}
          />
        ))}
      </ul>

      <div className="vt-controls">
        <button type="button" className="vt-arrow" aria-label="Previous story" onClick={() => go(-1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 5 8 12l7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="vt-dots" role="group" aria-label="Choose a story">
          {clips.map((clip, i) => (
            <button
              key={clip.id}
              type="button"
              className={`vt-dot${i === active ? ' is-active' : ''}`}
              aria-label={`Show ${clip.name}'s story`}
              aria-current={i === active}
              onClick={() => select(i)}
            />
          ))}
        </div>

        <button type="button" className="vt-arrow" aria-label="Next story" onClick={() => go(1)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  )
}
