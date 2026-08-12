'use client'

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link } from '@/lib/router-compat'

const ASSET = '/assets/figma-home/'

function Flower({ light = false }: { light?: boolean }) {
  return (
    <span className={`fl-flower${light ? ' fl-flower--light' : ''}`} aria-hidden="true">
      <img src={`${ASSET}about-imgGroup.svg`} alt="" />
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
  { image: 'about-founder.png', label: 'FOUNDERS', variant: 'doctor', name: 'Dr. Gomathi V', arrow: 'about-hover-gomathi.svg' },
  { image: 'about-man.png', label: 'CO-FOUNDERS', variant: 'woman', name: 'Vignesh Shivan', arrow: 'about-hover-vignesh.svg' },
  { image: 'about-woman.png', label: 'CO-FOUNDERS', variant: 'man', name: 'Nayanthara', arrow: 'about-hover-nayanthara.svg' },
] as const

export function AboutScreen() {
  return (
    <main className="figma-landing" id="top">
      <Reveal className="fl-about" id="about">
        <img className="fl-about__shape fl-about__shape--corner" src={`${ASSET}about-imgPolygon1.svg`} alt="" />
        <img className="fl-about__shape fl-about__shape--top" src={`${ASSET}about-imgVector2.svg`} alt="" />
        <img className="fl-about__shape fl-about__shape--bottom" src={`${ASSET}about-imgVector3.svg`} alt="" />
        <img className="fl-about__shape fl-about__shape--edge" src={`${ASSET}about-imgRectangle16.svg`} alt="" />
        <div className="fl-shell fl-about__layout">
          <div className="fl-about__people" aria-label="Femi9 founders">
            {FOUNDERS.map((person) => (
              <figure className={`fl-founder fl-founder--${person.variant}`} key={person.variant} tabIndex={0}>
                <span className="fl-founder__portrait">
                  <img src={`${ASSET}${person.image}`} alt="Femi9 founder" />
                </span>
                {person.variant === 'man' && (
                  <span className="fl-founder__spark" aria-hidden="true">
                    <img src={`${ASSET}about-imgVector4.svg`} alt="" />
                    <img src={`${ASSET}about-imgVector5.svg`} alt="" />
                    <img src={`${ASSET}about-imgVector6.svg`} alt="" />
                  </span>
                )}
                <span className="fl-founder__hover-name">{person.name}</span>
                <img className="fl-founder__hover-arrow" src={`${ASSET}${person.arrow}`} alt="" />
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
