import { useEffect, useRef, useState } from 'react'
import { useLenis } from './SmoothScroll'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Testimonial {
  name: string
  place: string
  quote: string
  duration: string
  poster: string // CSS background for the video poster
  /** Optional real testimonial video. Drop an mp4 in public/assets/testimonials
   *  and set e.g. video: '/assets/testimonials/aisha.mp4' — it plays on click. */
  video?: string
}

const TESTIMONIALS: Testimonial[] = [
  { name: 'Aisha R.', place: 'Mumbai', duration: '0:38',
    quote: 'The anion strip genuinely eased my cramps by day two.',
    poster: 'linear-gradient(150deg, #FBE7D6, #F3C9A9)' },
  { name: 'Meera K.', place: 'Bengaluru', duration: '0:52',
    quote: 'So thin I forget I’m wearing one — and zero rash.',
    poster: 'linear-gradient(150deg, #E7F0EA, #B9D8C6)' },
  { name: 'Fatima S.', place: 'Hyderabad', duration: '0:44',
    quote: 'Switched the whole family. Zero leaks overnight.',
    poster: 'linear-gradient(150deg, #F2ECF9, #D6C2EC)' },
  { name: 'Priya N.', place: 'Delhi', duration: '0:31',
    quote: 'The first pad that didn’t irritate my skin at all.',
    poster: 'linear-gradient(150deg, #FFF1C6, #FBD98A)' },
  { name: 'Zara H.', place: 'Pune', duration: '0:47',
    quote: 'Biodegradable and it actually performs. Rare combo.',
    poster: 'linear-gradient(150deg, #FBE0D3, #E8A98C)' },
  { name: 'Nandini V.', place: 'Chennai', duration: '0:59',
    quote: 'Overnight 425 is a game-changer on my heavy days.',
    poster: 'linear-gradient(150deg, #E6EFF0, #AEC9CC)' },
]

const COPIES = 3

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
}

function VideoCard({
  t, hidden, active, onOpen,
}: { t: Testimonial; hidden: boolean; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`tvid-card interactive ${active ? 'is-active' : ''}`}
      style={{ background: t.poster }}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : 0}
      onClick={onOpen}
      aria-label={`Play ${t.name}'s testimonial`}
    >
      {active && t.video ? (
        <video className="tvid-video" src={t.video} autoPlay controls playsInline />
      ) : (
        <>
          <span className="tvid-duration">{t.duration}</span>
          <span className="tvid-avatar">{initials(t.name)}</span>
          <span className="tvid-wave" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => <i key={i} style={{ '--b': i } as React.CSSProperties} />)}
          </span>
          <span className="tvid-play" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="tvid-meta">
            <b>{t.name}</b>
            <small>{t.place}</small>
            <p>“{t.quote}”</p>
          </span>
        </>
      )}
    </button>
  )
}

/**
 * Testimonial video wall. A horizontal row of video cards that always drifts to
 * the RIGHT: it speeds up when you scroll down, and keeps moving right — just
 * slower — when you scroll up or sit idle, so people can actually watch them.
 * Hovering (or opening a video) pauses the drift. Reduced motion turns it into
 * a plain manual-scroll row.
 */
export function Testimonials() {
  const trackRef = useRef<HTMLDivElement>(null)
  const lenis = useLenis()
  const [openId, setOpenId] = useState<number | null>(null)

  // live refs read inside the rAF loop without re-subscribing
  const pausedRef = useRef(false)
  const openRef = useRef(false)
  openRef.current = openId !== null

  useEffect(() => {
    if (prefersReduced) return
    const track = trackRef.current
    if (!track) return

    const BASE = 0.8       // idle rightward drift (px/frame)
    const MIN = 0.2        // never fully stop unless paused — always verifiable
    const SLOW = 0.28      // target when scrolling up
    const MAX_BOOST = 5

    let setWidth = track.scrollWidth / COPIES
    let x = -setWidth
    let speed = BASE
    let raf = 0
    let inView = true

    const measure = () => {
      const prev = setWidth
      setWidth = track.scrollWidth / COPIES
      if (prev) x = (x / prev) * setWidth // keep relative position on resize
    }

    const io = new IntersectionObserver(
      ([e]) => { inView = e.isIntersecting },
      { rootMargin: '120px' },
    )
    io.observe(track)

    const tick = () => {
      const paused = pausedRef.current || openRef.current
      const v = lenis ? lenis.velocity : 0 // + = scrolling down
      let target: number
      if (paused) target = 0
      else if (v > 0.05) target = BASE + Math.min(v * 0.05, MAX_BOOST) // down → faster
      else if (v < -0.05) target = SLOW                                // up → slower
      else target = BASE                                               // idle → drift

      speed += (target - speed) * 0.07
      if (!paused) speed = Math.max(MIN, speed)

      if (inView) {
        x += speed
        if (x >= 0) x -= setWidth
        track.style.transform = `translate3d(${x}px,0,0)`
      }
      raf = requestAnimationFrame(tick)
    }

    measure()
    x = -setWidth
    window.addEventListener('resize', measure)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      io.disconnect()
    }
  }, [lenis])

  const cards = Array.from({ length: COPIES }).flatMap((_, c) =>
    TESTIMONIALS.map((t, i) => {
      const id = c * TESTIMONIALS.length + i
      return (
        <VideoCard
          key={id}
          t={t}
          hidden={c !== 0}
          active={openId === id}
          onOpen={() => setOpenId((cur) => (cur === id ? null : id))}
        />
      )
    }),
  )

  return (
    <section className="tvids" aria-label="Video testimonials from Femi9 users">
      <div className="wrap tvids-head">
        <span className="eyebrow">In their words</span>
        <h2 className="display tvids-title">Real people, real relief.</h2>
      </div>
      <div
        className={`tvids-viewport ${prefersReduced ? 'is-static' : ''}`}
        onPointerEnter={() => { pausedRef.current = true }}
        onPointerLeave={() => { pausedRef.current = false }}
      >
        <div className="tvids-shift">
          <div className="tvids-track" ref={trackRef}>
            {prefersReduced
              ? TESTIMONIALS.map((t, i) => (
                  <VideoCard key={i} t={t} hidden={false} active={openId === i}
                    onOpen={() => setOpenId((cur) => (cur === i ? null : i))} />
                ))
              : cards}
          </div>
        </div>
      </div>
    </section>
  )
}
