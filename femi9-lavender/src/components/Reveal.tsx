import { useEffect, useRef, useState, type ReactNode } from 'react'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Scroll-reveal hook. Returns a ref to attach and whether the element is in
 * view. Reuses the `.reveal` / `.in` CSS so animation matches the original.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(prefersReduced)

  useEffect(() => {
    if (prefersReduced) return
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInView(true)
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.14, rootMargin: '0px 0px -8% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return { ref, inView }
}

export function revealClass(inView: boolean, delay?: 1 | 2 | 3 | 4, extra = '') {
  return ['reveal', delay ? `d${delay}` : '', inView ? 'in' : '', extra].filter(Boolean).join(' ')
}

interface RevealProps {
  className?: string
  delay?: 1 | 2 | 3 | 4
  children: ReactNode
  id?: string
}

/** Convenience wrapper: renders a div with the reveal classes applied to it. */
export function Reveal({ className = '', delay, children, id }: RevealProps) {
  const { ref, inView } = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} id={id} className={revealClass(inView, delay, className)}>
      {children}
    </div>
  )
}
