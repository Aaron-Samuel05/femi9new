import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { FluidCursor } from '../immersive/FluidCursor'

/**
 * LiquidBackground drags in three + R3F (~970KB raw, ~270KB gzipped). It is a
 * decorative fixed canvas behind the page at z-index -1, so nothing about the
 * first paint depends on it. Importing it statically put that whole chunk on
 * the critical path, competing with the hero image for bandwidth.
 *
 * lazy() alone is not enough: React starts the dynamic import as soon as the
 * component renders, which is still inside the initial burst. So we also wait
 * for the main thread to go idle. Until it mounts the page shows its cream
 * base, which is what .liquid-bg--fallback already renders anyway.
 */
const LiquidBackground = lazy(() =>
  import('../immersive/LiquidBackground').then((m) => ({ default: m.LiquidBackground })),
)

/** The zero-byte version of the same look. Already used as the no-WebGL path. */
const CssBackground = () => <div className="liquid-bg liquid-bg--fallback" aria-hidden="true" />

function DeferredLiquidBackground() {
  const [ready, setReady] = useState(false)
  const [skip, setSkip] = useState(false)

  useEffect(() => {
    // Two groups get the CSS gradient and never download the 3D bundle at all:
    //   - reduced-motion: the canvas would render a single static frame anyway
    //     (frameloop="demand"), so ~220KB gzipped buys them a still image.
    //   - Save-Data: they have explicitly asked for less.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
    if (reduced || saveData) {
      setSkip(true)
      return
    }

    // requestIdleCallback is missing in Safari; the timeout is both the
    // fallback and the upper bound, so the background always arrives.
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 3000 })
      return () => w.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(() => setReady(true), 1200)
    return () => window.clearTimeout(t)
  }, [])

  // Paint the gradient immediately for everyone, then upgrade to the live
  // canvas once idle. The two look near-identical, so the swap is invisible,
  // and nobody ever sees an unpainted background.
  if (skip || !ready) return <CssBackground />
  return (
    <Suspense fallback={<CssBackground />}>
      <LiquidBackground />
    </Suspense>
  )
}

export function StoreLayout() {
  return (
    <>
      <DeferredLiquidBackground />
      <FluidCursor />
      <Nav />
      <Outlet />
      <Footer />
    </>
  )
}
