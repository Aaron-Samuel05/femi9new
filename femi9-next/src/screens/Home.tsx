'use client'

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link } from '@/lib/router-compat'
import { CycleTracker } from '@/components/CycleTracker'
import { PRODUCTS } from '@/data/products'
import type { ProductWithVariants } from '@/lib/services/products'
import type { BlogPostDTO } from '@/lib/services/blog'
import { Footer } from '@/components/Footer'
import { Nav } from '@/components/Nav'
import { ProductCard } from '@/components/ProductCard'

const ASSET = '/assets/figma-home/'

interface Props {
  products: ProductWithVariants[]
  posts: BlogPostDTO[]
}

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
    // Preserve Figma's pointer-entry trigger, but also reveal when a section
    // enters the viewport. Scrolling does not consistently dispatch mouseenter,
    // which otherwise leaves entire desktop sections in their hidden variant.
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

function Hero() {
  const [slide, setSlide] = useState<0 | 1>(0)
  const SLIDE_INTERVAL_MS = 6000

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let timer = 0
    const swap = () => {
      setSlide((current) => (current === 0 ? 1 : 0))
      timer = window.setTimeout(swap, SLIDE_INTERVAL_MS)
    }
    timer = window.setTimeout(swap, SLIDE_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [])

  const buyNow = () => document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section className={`fl-hero${slide === 1 ? ' is-second' : ''}`} aria-labelledby="fl-hero-heading">
      <div className="fl-hero__background fl-hero__background--first" />
      <div className="fl-hero__background fl-hero__background--second" />

      <div className="fl-hero__scene fl-hero__scene--first" aria-hidden={slide === 1}>
        <img className="fl-hero__flower fl-hero__flower--ghost" src={`${ASSET}hero-imgGroup.svg`} alt="" />
        <img className="fl-hero__flower fl-hero__flower--solid" src={`${ASSET}hero-imgGroup1.svg`} alt="" />
        <img className="fl-hero__cloud fl-hero__cloud--top" src={`${ASSET}hero-img4157844189182061.png`} alt="" />
        <img className="fl-hero__cloud fl-hero__cloud--bottom" src={`${ASSET}hero-img4157844189182061.png`} alt="" />
        <img className="fl-hero__cloud fl-hero__cloud--edge" src={`${ASSET}hero-img4157844189182061.png`} alt="" />
        <img className="fl-hero__pad" src={`${ASSET}hero-imgImage20.png`} alt="" />
        <img className="fl-hero__model" src={`${ASSET}image 19.png`} alt="Woman seated beside Femi9 pads" />
        <div className="fl-shell fl-hero__inner">
          <div className="fl-hero__copy">
          <h1 id="fl-hero-heading"><strong>Rash-Free Sanitary Pads</strong> That Feel Like Nothing At All.</h1>
          <p>Experience cotton-soft comfort with our breathable, ultra-absorbent sanitary pads. Designed for leak-proof protection and reliable absorbency—from your morning commute to restful nights. Femi9 pads move with you, wherever your day takes you.</p>
          <div className="fl-hero__proof">
            <span><img src={`${ASSET}hero-imgBadgetCheckAlt21.png`} alt="" />Certified Organic Cotton</span>
            <i />
            <span><img src={`${ASSET}hero-imgSeedling1.png`} alt="" />Biodegradable</span>
          </div>
            <button type="button" className="fl-btn fl-btn--gold" onClick={buyNow}>Buy Sanitary Pads Online</button>
          </div>
        </div>
      </div>
 
      <div className="fl-hero__scene fl-hero__scene--second" aria-hidden={slide === 0}>
        <img className="fl-hero__second-shape fl-hero__second-shape--top" src={`${ASSET}hero-imgRectangle18.svg`} alt="" />
        <img className="fl-hero__second-shape fl-hero__second-shape--bottom" src={`${ASSET}hero-imgRectangle17.svg`} alt="" />
        <img className="fl-hero__second-product" src={`${ASSET}hero-imgImage30.png`} alt="Femi9 organic pads displayed on a pedestal" />
        <div className="fl-shell fl-hero__inner">
          <div className="fl-hero__copy fl-hero__copy--second">
            <h2><strong>Protection You Notice</strong>, The Pad You Don&apos;t.</h2>
            <p>Ultra-absorbent. Exceptionally comfortable. Certified organic cotton, thoughtfully designed for you.</p>
            <div className="fl-hero__proof">
              <span><img src={`${ASSET}hero-imgBadgetCheckAlt21.png`} alt="" />Certified Organic Cotton</span>
              <i />
              <span><img src={`${ASSET}hero-imgSeedling1.png`} alt="" />Biodegradable</span>
            </div>
            <button type="button" className="fl-btn fl-btn--gold" onClick={buyNow}>Buy Sanitary Pads Online</button>
          </div>
        </div>
      </div>

      <div className="fl-hero__pager" role="group" aria-label="Hero slides">
        <button type="button" aria-label="Show first slide" className={slide === 0 ? 'is-active' : ''} onClick={() => setSlide(0)} />
        <button type="button" aria-label="Show second slide" className={slide === 1 ? 'is-active' : ''} onClick={() => setSlide(1)} />
      </div>
    </section>
  )
}



const BENEFITS = [
  { image: 'why-imgImage23.png', art: 'comfort', title: 'Cotton-Soft Comfort', copy: 'A gentle, soft surface that feels nice against your skin throughout your period.' },
  { image: 'why-imgImage24.png', art: 'breathable', title: 'Breathable Design', copy: 'Airflow-friendly layers that help reduce trapped heat and keep you fresher, longer.' },
  { image: 'why-imgImage25.png', art: 'anion', title: 'Reliable Absorbency & Leak Protection', copy: 'Designed to absorb quickly and keep you protected through regular and heavier flow days.' },
  { image: 'why-imgImage26.png', art: 'clean', title: 'Rash-Conscious Comfort', copy: 'Thoughtfully made for women who want gentle, comfortable pads without unnecessary irritants.' },
  { image: 'why-imgImage25.png', art: 'anion', title: 'Freshness & Odour Control', copy: 'Stay feeling fresh and confident, whether you\'re at work, traveling, or resting.' },
  { image: 'why-imgImage26.png', art: 'clean', title: 'Made for Everyday Movement', copy: 'A lightweight fit that supports freedom of movement—focus on your day, not your pad.' },
] as const

function Benefit({ item, side }: { item: (typeof BENEFITS)[number]; side: 'left' | 'right' }) {
  return (
    <article className={`fl-benefit fl-benefit--${side}`}>
      {side === 'right' && <div><h3>{item.title}</h3><p>{item.copy}</p></div>}
      <span className={`fl-benefit__art fl-benefit__art--${item.art}`} aria-hidden="true">
        <img src={`${ASSET}${item.image}`} alt="" />
      </span>
      {side === 'left' && <div><h3>{item.title}</h3><p>{item.copy}</p></div>}
    </article>
  )
}

function Why() {
  return (
    <Reveal className="fl-why" id="why">
      <div className="fl-shell">
        <div className="fl-heading fl-heading--light">
          <div><p className="fl-kicker">Why Femi9 <Flower light /></p><h2>Built By A Doctor. Backed By Women.<br />Made For Every Body.</h2><p>Knowledge, Care, And Confidence - Everything You Need To Understand Your Body Better.</p></div>
          <Link className="fl-btn fl-btn--light" to="/periods-wall">View Details <span>→</span></Link>
        </div>
        <div className="fl-why__grid">
          <div className="fl-why__column">
            <Benefit item={BENEFITS[0]} side="left" />
            <Benefit item={BENEFITS[1]} side="left" />
            <Benefit item={BENEFITS[2]} side="left" />
          </div>
          <div className="fl-why__product"><img src={`${ASSET}why-imgImage22.png`} alt="Femi9 pad on a lavender pedestal" /></div>
          <div className="fl-why__column">
            <Benefit item={BENEFITS[3]} side="right" />
            <Benefit item={BENEFITS[4]} side="right" />
            <Benefit item={BENEFITS[5]} side="right" />
          </div>
        </div>
      </div>
    </Reveal>
  )
}

function ProductGrid({ products }: { products: ProductWithVariants[] }) {
  // Keep the landing page useful while an empty production catalog is being
  // seeded, but never repeat one product four times.
  const fallbackProducts: ProductWithVariants[] = PRODUCTS.slice(0, 4).map((product) => ({ ...product, variants: [] }))
  const cards = (products.length ? products : fallbackProducts).slice(0, 4)

  return (
    <Reveal className="fl-products" id="products">
      <img className="fl-products__ribbon" src={`${ASSET}products-imgRectangle15.svg`} alt="" />
      <div className="fl-shell">
        <div className="fl-heading">
          <div>
            <p className="fl-kicker fl-kicker--gold">Buy Now <Flower /></p>
            <h2>Choose Your Perfect Fit. Shop Sanitary Pads for Your Flow.</h2>
            <p style={{ marginBottom: '16px' }}>
              Every body is different. Whether you experience light flow, regular flow, or heavy flow periods, Femi9 has a sanitary pad designed just for you.
            </p>
            <div className="cta-group" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
              <Link to="/#products" className="fl-btn fl-btn--gold">Shop Sanitary Pads</Link>
              <Link to="/#products" className="fl-btn fl-btn--outline">Find Your Size</Link>
              <Link to="/#products" className="fl-btn fl-btn--outline">Buy Sanitary Pads Online</Link>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              Choose the pad size and protection level that matches your flow, then shop with confidence and comfort in mind.
            </p>
          </div>
          <Link className="fl-btn fl-btn--outline fl-btn--arrow" to="/#products">View All <span>→</span></Link>
        </div>
        <div className="grid-products" style={{ marginTop: 44 }}>
          {cards.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </Reveal>
  )
}

const JOURNAL = [
  { tag: 'Menstrual Health', title: '5 Signs Your Period Is Trying To Tell You Something', pos: 'left' },
  { tag: 'Wellness', title: 'Foods That Naturally Help Reduce Period Cramps', pos: 'center' },
  { tag: 'Self Care', title: 'Simple Night-Time Habits For Better Period Sleep', pos: 'right' },
] as const

function Journal({ posts }: { posts: BlogPostDTO[] }) {
  return (
    <Reveal className="fl-journal" id="journal">
      <img className="fl-journal__ribbon" src={`${ASSET}blogs-imgVector2.svg`} alt="" />
      <img className="fl-journal__polygon" src={`${ASSET}blogs-imgPolygon2.svg`} alt="" />
      <div className="fl-shell">
        <div className="fl-heading">
          <div><p className="fl-kicker">Blogs <Flower /></p><h2>Period Care, Explained Simply</h2><p>Knowledge, Care, And Confidence - Everything You Need To Understand Your Body Better.</p></div>
          <Link className="fl-btn fl-btn--outline" to="/blog">View All</Link>
        </div>
        <div className="fl-journal__grid">
          {JOURNAL.map((item, index) => {
            const post = posts[index]
            return (
            <Link className="fl-blog" to={post ? `/blog/${post.slug}` : '/blog'} key={post?.slug ?? item.title} style={{ '--blog-index': index } as CSSProperties}>
              <span className={`fl-blog__photo ${post?.image ? 'fl-blog__photo--dynamic' : `fl-blog__photo--${item.pos}`}`}>
                <img src={post?.image || `${ASSET}blogs-imgImage18.png`} alt="" />
              </span>
              <span className="fl-blog__shade" />
              <span className="fl-blog__meta">
                <b>{post?.category ?? item.tag}</b>
                <span className="fl-blog__read">
                  <small>{post ? `${post.readTime}mins Read` : '5mins Read'}</small>
                  <span className="fl-blog__arrow"><img src={`${ASSET}blogs-imgFrame.svg`} alt="" /></span>
                </span>
              </span>
              <h3>{post?.title ?? item.title}</h3>
            </Link>
            )
          })}
        </div>
      </div>
    </Reveal>
  )
}

const REVIEWS = [
  { image: 'testimonials-imgFrame28.png', name: 'K', quote: 'Forget I’m Wearing One. And Zero Rash.' },
  { image: 'testimonials-imgFrame29.png', name: 'Fatima S.', quote: 'Switched The Whole Family. Zero Leaks Overnight.' },
  { image: 'testimonials-imgFrame30.png', name: 'Priya N.', quote: 'The First Pad That Didn’t Irritate My Skin At All.' },
  { image: 'testimonials-imgFrame32.png', name: 'Make The Switch This Month', quote: 'Overnight 425 Is A Game-Changer.' },
] as const

function Testimonials() {
  const [manualOffset, setManualOffset] = useState<number | null>(null)
  const items = [...REVIEWS, ...REVIEWS]
  const shift = manualOffset === null ? undefined : `calc(-80px - ${manualOffset * 421}px)`

  return (
    <Reveal className="fl-testimonials" id="testimonials">
      <div className="fl-shell">
        <div className="fl-heading">
          <div><p className="fl-kicker fl-kicker--gold">Testimonial <Flower /></p><h2>Real Period Stories. Real Everyday Confidence.</h2></div>
          <div className="fl-testimonials__controls">
            <button type="button" aria-label="Previous testimonial" onClick={() => setManualOffset((value) => ((value ?? 0) - 1 + REVIEWS.length) % REVIEWS.length)}><img src={`${ASSET}testimonials-imgFrame.svg`} alt="" /></button>
            <button type="button" aria-label="Next testimonial" onClick={() => setManualOffset((value) => ((value ?? 0) + 1) % REVIEWS.length)}><img src={`${ASSET}testimonials-imgFrame1.svg`} alt="" /></button>
          </div>
        </div>
        <div className={`fl-testimonials__track${manualOffset !== null ? ' is-manual' : ''}`} style={{ '--testimonial-shift': shift } as CSSProperties}>
          {items.map((item, index) => (
            <article className="fl-review" key={`${item.name}-${index}`}>
              <div className="fl-review__media"><img src={`${ASSET}${item.image}`} alt="Femi9 customer" /><img className="fl-review__play" src={`${ASSET}testimonials-imgGroup.svg`} alt="" /></div>
              <div className="fl-review__body"><img src={`${ASSET}testimonials-imgFrame31.svg`} alt="Five stars" /><h3>{item.name}</h3><p>“{item.quote}”</p></div>
            </article>
          ))}
        </div>
      </div>
    </Reveal>
  )
}

function Partner() {
  return (
    <Reveal className="fl-partner" id="opportunities">
      <img className="fl-partner__ribbon" src={`${ASSET}partner-imgVector2.svg`} alt="" />
      <div className="fl-shell fl-partner__layout">
        <div className="fl-partner__copy">
          <h2>Turn Better Periods Into Your Livelihood</h2>
          <p>Join 5,000+ Women Across Tamil Nadu Earning A Real Income By Bringing Trusted, Organic Period Care To The People They Already Know.</p>
          <div className="fl-partner__stats">
            <span><strong>5,000+</strong><small>Women Entrepreneurs</small></span><span><strong>12</strong><small>Districts Across Tamil Nadu</small></span>
            <span><strong>Rs.8,000+</strong><small>Average Monthly Earning</small></span><span><strong>100%</strong><small>Flexible Hours</small></span>
          </div>
          <div className="fl-partner__actions"><Link className="fl-btn fl-btn--gold" to="/partner">Become A Partner</Link><Link className="fl-btn fl-btn--outline" to="/partner">How It Works</Link></div>
        </div>
        <div className="fl-partner__image"><img src={`${ASSET}partner-imgImage38.png`} alt="Femi9 women entrepreneurs" /></div>
      </div>
    </Reveal>
  )
}

export function Home({ products, posts }: Props) {
  return (
    <main className="figma-landing" id="top">
      <Nav />
      <Hero />
      <ProductGrid products={products} />
      <Why />
      <section id="about-femi9" className="about-section" style={{ padding: '80px 0', background: 'var(--bg-light)' }}>
        <div className="fl-shell" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2.2rem', marginBottom: '24px', color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>
            Designed for Her. Driven by Care. Made to Move With Her.
          </h2>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '16px', color: 'var(--ink)' }}>
            Femi9 was created with one simple purpose: to make period care more comfortable, thoughtful, and reliable. We design our sanitary pads around what real women need—softness against your skin, breathable comfort that actually works, absorbency you can count on, and protection you can trust.
          </p>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.6', marginBottom: '32px', color: 'var(--ink)' }}>
            Beyond just products, Femi9 is about encouraging better menstrual hygiene choices, building awareness, and giving women the confidence they deserve throughout their cycle.
          </p>
          <Link to="/about" className="fl-btn fl-btn--gold">
            Know More About Femi9
          </Link>
        </div>
      </section>
      <Journal posts={posts} />
      <div className="fl-cycle"><CycleTracker /></div>
      <Testimonials />
      <Partner />
      <Footer />
    </main>
  )
}
