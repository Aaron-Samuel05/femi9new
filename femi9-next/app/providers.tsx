'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { CartProvider } from '@/store/cart'
import { CycleModeProvider } from '@/immersive/CycleMode'
import { SmoothScroll, useLenis } from '@/immersive/SmoothScroll'
import { CartDrawer } from '@/components/CartDrawer'
import { Toast } from '@/components/Toast'

/**
 * On route change, reset scroll to top (or to a hash target if present).
 * Ported from the old App.tsx ScrollManager; uses Next's pathname hook and the
 * shared Lenis instance so it stays in step with the smooth-scroll loop.
 */
function ScrollManager() {
  const pathname = usePathname()
  const lenis = useLenis()

  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        if (lenis) lenis.scrollTo(el, { offset: -70 })
        else el.scrollIntoView({ behavior: 'smooth' })
        return
      }
    }
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo({ top: 0 })
  }, [pathname, lenis])

  return null
}

/**
 * App-wide client providers, mirroring the old App.tsx tree:
 * CartProvider → CycleModeProvider → SmoothScroll, plus the global
 * CartDrawer and Toast overlays.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <CycleModeProvider>
        <SmoothScroll>
          <ScrollManager />
          {children}
          <CartDrawer />
          <Toast />
        </SmoothScroll>
      </CycleModeProvider>
    </CartProvider>
  )
}
