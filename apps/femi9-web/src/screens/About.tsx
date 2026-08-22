'use client'

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link } from '@/lib/router-compat'
import { OptImg } from '@/components/OptImg'
import { useMediaGate } from '@/components/useMediaGate'

const ASSET = '/assets/figma-home/'

function Flower({ light = false }: { light?: boolean }) {
  return (
    <span className={`fl-flower${light ? ' fl-flower--light' : ''}`} aria-hidden="true">
      <img src={`${ASSET}about-imgGroup.svg`} alt="" width={16} height={16} loading="lazy" decoding="async" />
    </span>
  )
}

function Reveal({
  children,
  className,
  id,
}: {
  children: ReactNode
  className: string
  id?: string
}) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setVisible(true)
      return
    }

    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [id])

  return (
    <section
      ref={ref}
      className={className}
      id={id}
      data-visible={visible ? 'true' : undefined}
      onMouseEnter={() => setVisible(true)}
      onFocusCapture={() => setVisible(true)}
    >
      {children}
    </section>
  )
}

const FOUNDERS = [
  { base: 'figma-home/about-founder', label: 'FOUNDERS', variant: 'doctor', name: 'Dr. Gomathi V', arrow: 'about-hover-gomathi.svg' },
  { base: 'figma-home/about-man', label: 'CO-FOUNDERS', variant: 'woman', name: 'Vignesh Shivan', arrow: 'about-hover-vignesh.svg' },
  { base: 'figma-home/about-woman', label: 'CO-FOUNDERS', variant: 'man', name: 'Nayanthara', arrow: 'about-hover-nayanthara.svg' },
] as const

export function AboutScreen() {
  // Below 621px the hover arrows and sparks are not shown at all, and below
  // 901px the --edge shape is laid out entirely off-canvas. Gating the markup
  // rather than the CSS is what keeps a phone from downloading them: three
  // 45KB arrows plus three 15KB sparks is 184KB per phone visit for pixels
  // that are never painted.
  const wide = useMediaGate('(min-width: 621px)')
  const desktopShapes = useMediaGate('(min-width: 901px)')

  return (
    <main className="figma-landing" id="top">
      <Reveal className="fl-about" id="about">
        <img className="fl-about__shape fl-about__shape--corner" src={`${ASSET}about-imgPolygon1.svg`} alt="" width={499} height={134} loading="lazy" decoding="async" />
        <img className="fl-about__shape fl-about__shape--top" src={`${ASSET}about-imgVector2.svg`} alt="" width={857} height={537} loading="lazy" decoding="async" />
        <img className="fl-about__shape fl-about__shape--bottom" src={`${ASSET}about-imgVector3.svg`} alt="" width={883} height={537} loading="lazy" decoding="async" />
        {desktopShapes && (
          <img className="fl-about__shape fl-about__shape--edge" src={`${ASSET}about-imgRectangle16.svg`} alt="" width={499} height={131} loading="lazy" decoding="async" />
        )}
        <div className="fl-shell fl-about__layout">
          {/* `role="group"`: aria-label on a bare div is discarded, because ARIA
              forbids naming a generic element — VoiceOver and TalkBack both
              dropped this label. */}
          <div className="fl-about__people" role="group" aria-label="Femi9 founders">
            {FOUNDERS.map((person, index) => (
              <figure className={`fl-founder fl-founder--${person.variant}`} key={person.variant} tabIndex={0}>
                <span className="fl-founder__portrait">
                  {/* The name is in the alt: all three used to read "Femi9
                      founder", so a screen reader got the same label 3x. */}
                  <OptImg
                    base={person.base}
                    sizes="(max-width: 620px) 55vw, 300px"
                    alt={`Femi9 founder ${person.name}`}
                    priority={index === 0}
                  />
                </span>
                {wide && person.variant === 'man' && (
                  <span className="fl-founder__spark" aria-hidden="true">
                    <img src={`${ASSET}about-imgVector4.svg`} alt="" width={32} height={32} loading="lazy" decoding="async" />
                    <img src={`${ASSET}about-imgVector5.svg`} alt="" width={32} height={32} loading="lazy" decoding="async" />
                    <img src={`${ASSET}about-imgVector6.svg`} alt="" width={32} height={32} loading="lazy" decoding="async" />
                  </span>
                )}
                <span className="fl-founder__hover-name">{person.name}</span>
                {wide && (
                  <img className="fl-founder__hover-arrow" src={`${ASSET}${person.arrow}`} alt="" width={36} height={71} loading="lazy" decoding="async" />
                )}
                <figcaption>{person.label}</figcaption>
              </figure>
            ))}
          </div>
          <div className="fl-about__copy">
            <p className="fl-kicker">About Us <Flower /></p>
            <h2>Built By A Doctor. Backed By Women. Made For Every Body.</h2>
            <p>Femi9 Began With A Simple Belief: Period Care Should Be Safe, Honest And Genuinely Comfortable. Today It Is Also A Movement That Puts Income And Dignity Into Women&apos;s Hands.</p>
            <p>Femi9 Began With A Simple Belief: Period Care Should Be Safe, Honest And Genuinely Comfortable. Today It Is Also A Movement That Puts Income And Dignity Into Women&apos;s Hands.</p>
            <Link className="fl-btn fl-btn--outline" to="/periods-wall">Know More</Link>
          </div>
        </div>
      </Reveal>
    </main>
  )
}
