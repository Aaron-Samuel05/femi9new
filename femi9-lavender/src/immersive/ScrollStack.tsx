import { useLayoutEffect, useRef, useCallback, type ReactNode } from 'react'
import { useLenis } from './SmoothScroll'
import './ScrollStack.css'

/**
 * ScrollStack (adapted from react-bits @react-bits/ScrollStack-JS-CSS).
 *
 * The original spins up its own Lenis instance. This site already runs one
 * global Lenis (see SmoothScroll) and two window-Lenis instances fight over the
 * wheel, so this version instead REUSES the global Lenis via `useLenis()` and
 * drives the stack off window scroll. Same effect, no scroll conflict. Falls
 * back to native scroll events when Lenis is off (reduced motion).
 */

interface ScrollStackItemProps {
  children: ReactNode
  itemClassName?: string
}

export function ScrollStackItem({ children, itemClassName = '' }: ScrollStackItemProps) {
  return <div className={`scroll-stack-card ${itemClassName}`.trim()}>{children}</div>
}

interface Transform {
  translateY: number
  scale: number
  rotation: number
  blur: number
}

interface ScrollStackProps {
  children: ReactNode
  className?: string
  itemDistance?: number
  itemScale?: number
  itemStackDistance?: number
  stackPosition?: string
  scaleEndPosition?: string
  baseScale?: number
  rotationAmount?: number
  blurAmount?: number
  onStackComplete?: () => void
}

export default function ScrollStack({
  children,
  className = '',
  itemDistance = 100,
  itemScale = 0.03,
  itemStackDistance = 30,
  stackPosition = '20%',
  scaleEndPosition = '10%',
  baseScale = 0.85,
  rotationAmount = 0,
  blurAmount = 0,
  onStackComplete,
}: ScrollStackProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLElement[]>([])
  const lastTransformsRef = useRef(new Map<number, Transform>())
  const stackCompletedRef = useRef(false)
  const isUpdatingRef = useRef(false)
  const lenis = useLenis()

  const calculateProgress = useCallback((scrollTop: number, start: number, end: number) => {
    if (scrollTop < start) return 0
    if (scrollTop > end) return 1
    return (scrollTop - start) / (end - start)
  }, [])

  const parsePercentage = useCallback((value: string, containerHeight: number) => {
    if (typeof value === 'string' && value.includes('%')) {
      return (parseFloat(value) / 100) * containerHeight
    }
    return parseFloat(value)
  }, [])

  const getElementOffset = useCallback((element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return rect.top + window.scrollY
  }, [])

  const updateCardTransforms = useCallback(() => {
    const cards = cardsRef.current
    if (!cards.length || isUpdatingRef.current) return
    isUpdatingRef.current = true

    const scrollTop = window.scrollY
    const containerHeight = window.innerHeight
    const stackPositionPx = parsePercentage(stackPosition, containerHeight)
    const scaleEndPositionPx = parsePercentage(scaleEndPosition, containerHeight)

    const endEl = scrollerRef.current?.querySelector<HTMLElement>('.scroll-stack-end')
    const endElementTop = endEl ? getElementOffset(endEl) : 0

    cards.forEach((card, i) => {
      const cardTop = getElementOffset(card)
      const triggerStart = cardTop - stackPositionPx - itemStackDistance * i
      const triggerEnd = cardTop - scaleEndPositionPx
      const pinStart = cardTop - stackPositionPx - itemStackDistance * i
      const pinEnd = endElementTop - containerHeight / 2

      const scaleProgress = calculateProgress(scrollTop, triggerStart, triggerEnd)
      const targetScale = baseScale + i * itemScale
      const scale = 1 - scaleProgress * (1 - targetScale)
      const rotation = rotationAmount ? i * rotationAmount * scaleProgress : 0

      let blur = 0
      if (blurAmount) {
        let topCardIndex = 0
        for (let j = 0; j < cards.length; j++) {
          const jCardTop = getElementOffset(cards[j])
          const jTriggerStart = jCardTop - stackPositionPx - itemStackDistance * j
          if (scrollTop >= jTriggerStart) topCardIndex = j
        }
        if (i < topCardIndex) {
          const depthInStack = topCardIndex - i
          blur = Math.max(0, depthInStack * blurAmount)
        }
      }

      let translateY = 0
      const isPinned = scrollTop >= pinStart && scrollTop <= pinEnd
      if (isPinned) {
        translateY = scrollTop - cardTop + stackPositionPx + itemStackDistance * i
      } else if (scrollTop > pinEnd) {
        translateY = pinEnd - cardTop + stackPositionPx + itemStackDistance * i
      }

      const newTransform: Transform = {
        translateY: Math.round(translateY * 100) / 100,
        scale: Math.round(scale * 1000) / 1000,
        rotation: Math.round(rotation * 100) / 100,
        blur: Math.round(blur * 100) / 100,
      }

      const last = lastTransformsRef.current.get(i)
      const changed =
        !last ||
        Math.abs(last.translateY - newTransform.translateY) > 0.1 ||
        Math.abs(last.scale - newTransform.scale) > 0.001 ||
        Math.abs(last.rotation - newTransform.rotation) > 0.1 ||
        Math.abs(last.blur - newTransform.blur) > 0.1

      if (changed) {
        card.style.transform = `translate3d(0, ${newTransform.translateY}px, 0) scale(${newTransform.scale}) rotate(${newTransform.rotation}deg)`
        card.style.filter = newTransform.blur > 0 ? `blur(${newTransform.blur}px)` : ''
        lastTransformsRef.current.set(i, newTransform)
      }

      if (i === cards.length - 1) {
        const inView = scrollTop >= pinStart && scrollTop <= pinEnd
        if (inView && !stackCompletedRef.current) {
          stackCompletedRef.current = true
          onStackComplete?.()
        } else if (!inView && stackCompletedRef.current) {
          stackCompletedRef.current = false
        }
      }
    })

    isUpdatingRef.current = false
  }, [
    itemScale,
    itemStackDistance,
    stackPosition,
    scaleEndPosition,
    baseScale,
    rotationAmount,
    blurAmount,
    onStackComplete,
    calculateProgress,
    parsePercentage,
    getElementOffset,
  ])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const cards = Array.from(scroller.querySelectorAll<HTMLElement>('.scroll-stack-card'))
    cardsRef.current = cards
    const cache = lastTransformsRef.current

    cards.forEach((card, i) => {
      if (i < cards.length - 1) card.style.marginBottom = `${itemDistance}px`
      card.style.willChange = 'transform, filter'
      card.style.transformOrigin = 'top center'
      card.style.backfaceVisibility = 'hidden'
    })

    const handle = () => updateCardTransforms()
    updateCardTransforms()

    lenis?.on('scroll', handle)
    window.addEventListener('scroll', handle, { passive: true })
    window.addEventListener('resize', handle)

    return () => {
      lenis?.off('scroll', handle)
      window.removeEventListener('scroll', handle)
      window.removeEventListener('resize', handle)
      cardsRef.current = []
      cache.clear()
      stackCompletedRef.current = false
      isUpdatingRef.current = false
    }
  }, [itemDistance, lenis, updateCardTransforms])

  return (
    <div className={`scroll-stack-scroller scroll-stack-window ${className}`.trim()} ref={scrollerRef}>
      <div className="scroll-stack-inner">
        {children}
        <div className="scroll-stack-end" />
      </div>
    </div>
  )
}
