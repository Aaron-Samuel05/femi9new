import { useEffect, useRef } from 'react'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"], .interactive'

/**
 * Fluid cursor (spec §1). A precise dot rides the pointer while a soft ring
 * lags behind and stretches along the direction of travel — the "fluid trail".
 * Over interactive elements the ring swells and fills. It augments the native
 * cursor rather than replacing it (keeps the site usable), and disables itself
 * entirely on touch devices and under reduced motion.
 */
export function FluidCursor() {
  const ringRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (prefersReduced) return
    if (window.matchMedia('(hover: none)').matches) return

    const half = 0.5
    let mx = window.innerWidth * half
    let my = window.innerHeight * half
    let rx = mx
    let ry = my
    let raf = 0
    let active = false

    const onMove = (e: PointerEvent) => {
      mx = e.clientX
      my = e.clientY
      if (!active) {
        active = true
        document.body.classList.add('has-fluid-cursor')
      }
    }

    const onOver = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      const hot = !!el?.closest?.(INTERACTIVE)
      ringRef.current?.classList.toggle('is-hover', hot)
    }

    const onLeave = () => {
      active = false
      document.body.classList.remove('has-fluid-cursor')
    }

    const tick = () => {
      const nrx = rx + (mx - rx) * 0.16
      const nry = ry + (my - ry) * 0.16
      const vx = nrx - rx
      const vy = nry - ry
      rx = nrx
      ry = nry

      const speed = Math.min(Math.hypot(vx, vy), 34)
      const angle = Math.atan2(vy, vx)
      const stretch = 1 + speed * 0.02
      const squash = 1 / Math.sqrt(stretch)

      if (ringRef.current) {
        ringRef.current.style.transform =
          `translate(${rx}px, ${ry}px) translate(-50%, -50%) rotate(${angle}rad) scale(${stretch}, ${squash})`
      }
      if (dotRef.current) {
        dotRef.current.style.transform =
          `translate(${mx}px, ${my}px) translate(-50%, -50%)`
      }
      raf = requestAnimationFrame(tick)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('pointerleave', onLeave)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerleave', onLeave)
      document.body.classList.remove('has-fluid-cursor')
    }
  }, [])

  return (
    <>
      <div ref={ringRef} className="fluid-ring" aria-hidden="true" />
      <div ref={dotRef} className="fluid-dot" aria-hidden="true" />
    </>
  )
}
