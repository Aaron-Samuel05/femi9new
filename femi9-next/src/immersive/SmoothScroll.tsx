import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const LenisContext = createContext<Lenis | null>(null)

/** Access the active Lenis instance (null under reduced motion / before mount). */
export const useLenis = () => useContext(LenisContext)

/**
 * The "Flow" scroll (spec §1). One Lenis smooth-scroll instance for the whole
 * app, driven from GSAP's ticker so Lenis and ScrollTrigger share a single rAF
 * loop instead of fighting over two. No-ops under `prefers-reduced-motion`, so
 * the site falls straight back to native scrolling for anyone who asks for it.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null)

  useEffect(() => {
    if (prefersReduced) return

    const instance = new Lenis({
      // lerp-based smoothing gives a continuous, weighted glide (feels smoother
      // than a fixed per-input duration). ~0.09 is the premium sweet spot:
      // lower = floatier, higher = snappier.
      lerp: 0.09,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.8,
      syncTouch: false,
      anchors: true,
    })
    setLenis(instance)

    instance.on('scroll', ScrollTrigger.update)
    const raf = (time: number) => instance.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      instance.destroy()
      setLenis(null)
    }
  }, [])

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>
}
