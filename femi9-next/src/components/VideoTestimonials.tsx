'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { testimonialsForProduct, type VideoTestimonial } from '../data/videoTestimonials'

/**
 * "Real Stories" — a rail of short customer clips that plays itself.
 *
 * The rail advances every 3 seconds, scrolling the next clip into view and
 * previewing it muted, so the section shows what it contains without the
 * shopper having to touch anything. A click plays that clip properly, with
 * sound, and ends the rotation.
 *
 * The rules that keep an auto-playing rail from being hostile:
 * • It does nothing until the section is actually on screen. Rotating clips for
 *   a section nobody has scrolled to would download several MB of video — her
 *   data — to animate pixels out of view.
 * • Only the current and next clip are allowed to preload. `preload="none"`
 *   everywhere else means the rail costs one poster per card until it starts.
 * • Hovering pauses the rotation. The whole point of stopping on a clip is to
 *   watch it, and having it slide away under the cursor fights the reader.
 * • A click hands control over for good — after that it never auto-advances
 *   again, because she has said which one she wants.
 * • Reduced motion disables the rotation entirely: this is a moving carousel
 *   that also plays video, which is squarely what that preference is about.
 * • A hidden tab stops it, so it is not burning battery in the background.
 */

/** How long each clip holds before the rail moves on. */
const HOLD_MS = 3000

interface Props {
  productId: string
}

function Clip({
  clip,
  index,
  register,
  soundOn,
  onTakeOver,
  preload,
}: {
  clip: VideoTestimonial
  index: number
  register: (i: number, el: HTMLVideoElement | null) => void
  soundOn: boolean
  onTakeOver: (i: number) => void
  preload: 'none' | 'auto'
}) {
  return (
    <li className="vt-card">
      <button
        type="button"
        className={`vt-frame${soundOn ? ' is-playing' : ''}`}
        onClick={() => onTakeOver(index)}
        aria-label={soundOn ? `Pause ${clip.name}'s story` : `Play ${clip.name}'s story with sound`}
      >
        <video
          ref={(el) => register(index, el)}
          className="vt-video"
          src={clip.src}
          poster={clip.poster}
          playsInline
          loop
          muted
          preload={preload}
          // Decorative in the a11y tree: the button is the labelled control and
          // the name below is the text alternative.
          aria-hidden="true"
          tabIndex={-1}
        />
        <span className="vt-play" aria-hidden="true">
          {soundOn ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="7" y="5" width="3.6" height="14" rx="1.2" />
              <rect x="13.4" y="5" width="3.6" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5.6v12.8a1 1 0 0 0 1.53.85l10-6.4a1 1 0 0 0 0-1.7l-10-6.4A1 1 0 0 0 8 5.6Z" />
            </svg>
          )}
        </span>
      </button>
      {clip.quote && <p className="vt-quote">“{clip.quote}”</p>}
      <p className={`vt-name${clip.quote ? '' : ' vt-name--lead'}`}>{clip.name}</p>
    </li>
  )
}

export function VideoTestimonials({ productId }: Props) {
  const clips = testimonialsForProduct(productId)

  const railRef = useRef<HTMLUListElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const videos = useRef<(HTMLVideoElement | null)[]>([])

  const [active, setActive] = useState(0)
  const [inView, setInView] = useState(false)
  const [hovered, setHovered] = useState(false)
  /** Index playing with sound, once the visitor has taken over. Null = rotating. */
  const [soundIdx, setSoundIdx] = useState<number | null>(null)

  const register = useCallback((i: number, el: HTMLVideoElement | null) => {
    videos.current[i] = el
  }, [])

  // Only rotate while the section is genuinely on screen. Not unobserved after
  // the first hit, unlike a reveal animation: scrolling away has to STOP it.
  useEffect(() => {
    const node = sectionRef.current
    if (!node) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const rotating = inView && !hovered && soundIdx === null && !reduced

  // Advance the rail.
  useEffect(() => {
    if (!rotating || clips.length < 2) return
    const t = window.setInterval(() => setActive((i) => (i + 1) % clips.length), HOLD_MS)
    return () => window.clearInterval(t)
  }, [rotating, clips.length])

  // A background tab should not be decoding video. Rewinding `active` is not
  // needed — coming back simply resumes on whichever clip was current.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) videos.current.forEach((v) => v?.pause())
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Drive playback + scroll position from `active`.
  useEffect(() => {
    if (soundIdx !== null) return // the visitor is in charge

    videos.current.forEach((v, i) => {
      if (!v) return
      if (i === active && rotating) {
        v.muted = true
        v.currentTime = 0
        // Rejected by data-saver / battery-saver modes and by a browser that
        // declines autoplay. Nothing to recover: the poster simply stays.
        void v.play().catch(() => {})
      } else {
        v.pause()
      }
    })

    // Scroll the RAIL horizontally rather than calling scrollIntoView, which
    // would also scroll the page vertically and yank the visitor around while
    // she is reading something else on the way past.
    const rail = railRef.current
    const card = rail?.children[active] as HTMLElement | undefined
    if (rail && card && inView) {
      const delta = card.getBoundingClientRect().left - rail.getBoundingClientRect().left
      rail.scrollTo({ left: rail.scrollLeft + delta, behavior: 'smooth' })
    }
  }, [active, rotating, soundIdx, inView])

  /** A click is the one gesture browsers accept as consent for audio. */
  const takeOver = useCallback(
    (i: number) => {
      const v = videos.current[i]
      if (!v) return

      if (soundIdx === i) {
        v.pause()
        setSoundIdx(null)
        return
      }

      videos.current.forEach((other, j) => {
        if (j !== i) other?.pause()
      })

      // Both set SYNCHRONOUSLY, before play() is even called. The click is the
      // takeover; whether the media element manages to start is a separate
      // question. Deriving this from the play() promise meant a rejection — or
      // merely a slow resolve — left `soundIdx` null, so the rail carried on
      // rotating underneath a visitor who had just chosen a clip.
      setActive(i)
      setSoundIdx(i)

      v.muted = false
      void v.play().catch(() => {
        // Autoplay policy refused even with sound. Fall back to muted so the
        // click still does something visible; she keeps control either way.
        v.muted = true
        void v.play().catch(() => {})
      })
    },
    [soundIdx],
  )

  if (clips.length === 0) return null

  return (
    <section
      className="vt-section"
      aria-labelledby="vt-heading"
      ref={sectionRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
    >
      <h2 className="vt-heading" id="vt-heading">
        Real Stories
      </h2>
      <p className="vt-sub">Customers on what changed after they switched.</p>

      <ul className="vt-rail" ref={railRef}>
        {clips.map((clip, i) => (
          <Clip
            key={clip.id}
            clip={clip}
            index={i}
            register={register}
            soundOn={soundIdx === i}
            onTakeOver={takeOver}
            // Current and next only. Everything else stays at `none`, so the
            // rail costs six posters until it actually starts rotating.
            preload={inView && (i === active || i === (active + 1) % clips.length) ? 'auto' : 'none'}
          />
        ))}
      </ul>

      {/* Which clip is showing, and a way to jump straight to one. */}
      <div className="vt-dots" role="group" aria-label="Choose a story">
        {clips.map((clip, i) => (
          <button
            key={clip.id}
            type="button"
            className={`vt-dot${i === active ? ' is-active' : ''}`}
            aria-label={`Show ${clip.name}'s story`}
            aria-current={i === active}
            onClick={() => setActive(i)}
          />
        ))}
      </div>
    </section>
  )
}
