'use client'

import { useRef, useState } from 'react'
import { testimonialsForProduct, type VideoTestimonial } from '../data/videoTestimonials'

/**
 * "Real stories" — a rail of short customer clips on the product page.
 *
 * Playback rules, and why:
 * • Nothing autoplays on load. A page that starts four videos the moment it
 *   opens costs the shopper bandwidth she did not ask to spend, and on a phone
 *   that is her data. `preload="none"` means the bytes are not fetched until a
 *   clip is actually asked for; the poster carries the card until then.
 * • Hover previews are muted and silent by design — an unmuted autoplay is
 *   blocked by every browser anyway, and would be hostile if it were not.
 * • The card is a button, so a tap (or Enter) plays with sound. That is the one
 *   gesture browsers accept as consent for audio, and it is also the only way
 *   this works at all on a phone, which has no hover.
 */

interface Props {
  productId: string
}

function Clip({ clip }: { clip: VideoTestimonial }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  /** Silent preview while the pointer rests on the card. */
  const preview = () => {
    const v = ref.current
    if (!v || playing) return
    v.muted = true
    // play() rejects if the browser declines (data saver, reduced motion, a
    // battery-saving mode). Nothing to recover — the poster simply stays.
    void v.play().catch(() => {})
  }

  const stopPreview = () => {
    const v = ref.current
    if (!v || playing) return
    v.pause()
    v.currentTime = 0
  }

  /** A real click is consent for sound; this is the only path that unmutes. */
  const toggleWithSound = () => {
    const v = ref.current
    if (!v) return
    if (playing) {
      v.pause()
      setPlaying(false)
      return
    }
    v.muted = false
    v.currentTime = 0
    void v
      .play()
      .then(() => setPlaying(true))
      .catch(() => {
        // Autoplay policy refused even with sound. Fall back to a muted play so
        // the tap still does something visible rather than nothing.
        v.muted = true
        void v.play().catch(() => {})
      })
  }

  return (
    <li className="vt-card">
      <button
        type="button"
        className={`vt-frame${playing ? ' is-playing' : ''}`}
        onMouseEnter={preview}
        onMouseLeave={stopPreview}
        onClick={toggleWithSound}
        aria-label={
          playing ? `Pause ${clip.name}'s story` : `Play ${clip.name}'s story with sound`
        }
      >
        <video
          ref={ref}
          className="vt-video"
          src={clip.src}
          poster={clip.poster}
          playsInline
          loop
          muted
          preload="none"
          // Decorative in the a11y tree: the button above is the labelled
          // control, and the quote below is the text alternative.
          aria-hidden="true"
          tabIndex={-1}
          onEnded={() => setPlaying(false)}
        />
        <span className="vt-play" aria-hidden="true">
          {playing ? (
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
      {/* Optional: a card with no pull-quote shows the name alone rather than
          an invented line attributed to a real person. */}
      {clip.quote && <p className="vt-quote">“{clip.quote}”</p>}
      <p className={`vt-name${clip.quote ? '' : ' vt-name--lead'}`}>{clip.name}</p>
    </li>
  )
}

export function VideoTestimonials({ productId }: Props) {
  const clips = testimonialsForProduct(productId)

  // No clips configured for this product: render nothing rather than a heading
  // over an empty rail. See src/data/videoTestimonials.ts for how to add them.
  if (clips.length === 0) return null

  return (
    <section className="vt-section" aria-labelledby="vt-heading">
      <h2 className="vt-heading" id="vt-heading">
        Real Stories
      </h2>
      <p className="vt-sub">Customers on what changed after they switched.</p>

      {/* A scroll-snapping overflow rail, not a JS carousel: it is already
          swipeable on touch, keyboard-scrollable, and needs no arrows to be
          usable if the script never runs. */}
      <ul className="vt-rail">
        {clips.map((clip) => (
          <Clip key={clip.id} clip={clip} />
        ))}
      </ul>
    </section>
  )
}
