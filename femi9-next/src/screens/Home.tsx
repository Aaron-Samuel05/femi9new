'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link } from '@/lib/router-compat'
import { CycleTracker } from '@/components/CycleTracker'
import type { ProductWithVariants } from '@/lib/services/products'
import type { BlogPostDTO } from '@/lib/services/blog'
import type { FeaturedReview } from '@/lib/services/reviews-public'
import { Footer } from '@/components/Footer'
import { Nav } from '@/components/Nav'
import { OptImg } from '@/components/OptImg'
import { ProductCard } from '@/components/ProductCard'
import { useMediaGate } from '@/components/useMediaGate'

const ASSET = '/assets/figma-home/'

interface Props {
  products: ProductWithVariants[]
  posts: BlogPostDTO[]
  /** Approved reviews from the database. Falls back to the authored set below
   *  only when there are too few to fill the rail. */
  featuredReviews: FeaturedReview[]
}

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
  // Below 769px the cloud wash and the pad cutout are hidden: the pad sits at
  // z-index 4 under a photo 43% wider than it, and the cloud is painted over by
  // everything above it. Gating the markup — not just the CSS — is what stops a
  // phone downloading a 3000x2000 and a 1024x1024 source it never paints.
  const wideEnoughForDecor = useMediaGate('(min-width: 769px)')

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setSlide((current) => (current === 0 ? 1 : 0))
    }, 6000)
    return () => window.clearInterval(timer)
  }, [])

  const buyNow = () => document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <section
      className={`fl-hero${slide === 0 ? ' is-second' : ''}`}
      aria-labelledby={slide === 0 ? 'fl-hero-girl-heading' : 'fl-hero-product-heading'}
    >
      <div className="fl-hero__background fl-hero__background--first" />
      <div className="fl-hero__background fl-hero__background--second" />

      {/* Slide 1 - Product Slide (Image 3).
          `inert` as well as `aria-hidden`: without it the hidden slide keeps its
          Buy Now button in the tab order, so a keyboard or switch user lands on
          an invisible control (WCAG 4.1.2). */}
      <div className="fl-hero__scene fl-hero__scene--first" aria-hidden={slide === 0} inert={slide === 0}>
        <img className="fl-hero__shape fl-hero__shape--top" src={`${ASSET}hero-imgRectangle18.svg`} alt="" aria-hidden="true" width={538} height={499} loading="lazy" decoding="async" />
        <img className="fl-hero__shape fl-hero__shape--bottom" src={`${ASSET}hero-imgRectangle17.svg`} alt="" aria-hidden="true" width={566} height={291} loading="lazy" decoding="async" />

        <div className="fl-shell fl-hero__inner">
          <div className="fl-hero__copy">
            {/* h2, not h1: the hero opens on the lifestyle slide, so that one
                owns the page's h1. Both are styled identically. */}
            <h2 id="fl-hero-product-heading">Confidence That Lasts All Day.</h2>
            <p>
              Stay protected through work, travel, workouts, and restful nights with ultra-absorbent organic pads designed to move with you - not against you.
            </p>
            <div className="fl-hero__proof">
              <span>
                <img src={`${ASSET}hero-imgBadgetCheckAlt21.png`} alt="" width={22} height={22} loading="lazy" decoding="async" />
                Certified Organic Cotton
              </span>
              <span className="fl-hero__proof-divider" aria-hidden="true">|</span>
              <span>
                <img src={`${ASSET}hero-imgSeedling1.png`} alt="" width={22} height={22} loading="lazy" decoding="async" />
                Biodegradable
              </span>
            </div>
            <div className="fl-hero__actions">
              <button type="button" className="fl-btn fl-btn--gold" onClick={buyNow}>
                Buy Now
              </button>
            </div>
          </div>
          <div className="fl-hero__visual">
            <OptImg
              className="fl-hero__product"
              base="figma-home/hero-imgImage30"
              sizes="(max-width: 768px) 82vw, (max-width: 1080px) 40vw, 470px"
              alt="Femi9 organic pads displayed on a pedestal"
            />
          </div>
        </div>
      </div>

      {/* Slide 2 - Lifestyle Slide (Image 4) */}
      <div className="fl-hero__scene fl-hero__scene--second" aria-hidden={slide === 1} inert={slide === 1}>
        {/* Renders at 74% of `.fl-hero__visual--second`, itself ~44% of the
            inner grid — hence ~34vw, not the full viewport. */}
        {wideEnoughForDecor && (
          <OptImg
            className="fl-hero__girl-clouds"
            base="figma-home/hero-img4157844189182061"
            sizes="34vw"
            alt=""
          />
        )}
        <img
          className="fl-hero__girl-flower-outline"
          src={`${ASSET}hero-imgGroup.svg`}
          alt=""
          aria-hidden="true"
          width={223}
          height={223}
          loading="lazy"
          decoding="async"
        />
        <div className="fl-shell fl-hero__inner">
          <div className="fl-hero__copy fl-hero__copy--second">
            <div className="fl-hero__card-panel">
              <img className="fl-hero__flower-icon" src={`${ASSET}hero-imgGroup1.svg`} alt="" aria-hidden="true" width={91} height={112} loading="lazy" decoding="async" />
              {/* The page's h1: this is the scene that paints first. */}
              <h1 id="fl-hero-girl-heading"><span>Organic Pads</span> That Feel<br />Like Nothing At All.</h1>
              <p>
                Ultra-Thin, Breathable Cotton Pads With A Mood-Lifting Anion Strip. Toxin-Free, Biodegradable, And Made For Real Life
              </p>
              <div className="fl-hero__proof fl-hero__proof--light">
                <span>
                  <img src={`${ASSET}hero-imgBadgetCheckAlt21.png`} alt="" width={22} height={22} loading="lazy" decoding="async" />
                  Certified Organic Cotton
                </span>
                <span className="fl-hero__proof-divider" aria-hidden="true">|</span>
                <span>
                  <img src={`${ASSET}hero-imgSeedling1.png`} alt="" width={22} height={22} loading="lazy" decoding="async" />
                  Biodegradable
                </span>
              </div>
              <div className="fl-hero__actions">
                <button type="button" className="fl-btn fl-btn--gold" onClick={buyNow}>
                  Buy Now
                </button>
              </div>
            </div>
          </div>
          <div className="fl-hero__visual fl-hero__visual--second">
            {wideEnoughForDecor && (
              <OptImg
                className="fl-hero__girl-pad"
                base="figma-home/hero-imgImage20"
                sizes="(max-width: 1285px) 360px, 460px"
                alt=""
              />
            )}
            {/* The hero opens on this slide, so this is the LCP image: eager and
                high priority, and preloaded in app/layout.tsx. Rebuilt at
                856x1168 by scripts/build-hero-cutout.mjs — the 698x872 cutout it
                replaces was being upscaled ~2x and looked soft. */}
            <OptImg
              className="fl-hero__lifestyle"
              base="figma-home/hero-lifestyle"
              sizes="(max-width: 768px) 82vw, (max-width: 1080px) 43vw, min(46vw, 680px)"
              alt="Woman seated on a Femi9 organic pad pack"
              priority
            />
          </div>
        </div>
      </div>

      <div className="fl-hero__pager" role="group" aria-label="Hero slides">
        <button
          type="button"
          aria-label="Show girl hero slide"
          className={slide === 0 ? 'is-active' : ''}
          onClick={() => setSlide(0)}
        />
        <button
          type="button"
          aria-label="Show product hero slide"
          className={slide === 1 ? 'is-active' : ''}
          onClick={() => setSlide(1)}
        />
      </div>
    </section>
  )
}



const BENEFITS = [
  { image: 'figma-home/why-imgImage23', art: 'comfort', title: 'Cotton-Soft Comfort', copy: 'A gentle, soft surface that feels nice against your skin throughout your period.' },
  { image: 'figma-home/why-imgImage24', art: 'breathable', title: 'Breathable Design', copy: 'Airflow-friendly layers that help reduce trapped heat and keep you fresher, longer.' },
  { image: 'figma-home/why-imgImage25', art: 'anion', title: 'Reliable Absorbency & Leak Protection', copy: 'Designed to absorb quickly and keep you protected through regular and heavier flow days.' },
  { image: 'figma-home/why-imgImage26', art: 'clean', title: 'Rash-Conscious Comfort', copy: 'Thoughtfully made for women who want gentle, comfortable pads without unnecessary irritants.' },
  { image: 'figma-home/why-imgImage25', art: 'anion', title: 'Freshness & Odour Control', copy: 'Stay feeling fresh and confident, whether you\'re at work, traveling, or resting.' },
  { image: 'figma-home/why-imgImage26', art: 'clean', title: 'Made for Everyday Movement', copy: 'A lightweight fit that supports freedom of movement-focus on your day, not your pad.' },
] as const

function Benefit({ item, side }: { item: (typeof BENEFITS)[number]; side: 'left' | 'right' }) {
  return (
    <article className={`fl-benefit fl-benefit--${side}`}>
      {side === 'right' && <div><h3>{item.title}</h3><p>{item.copy}</p></div>}
      <span className={`fl-benefit__art fl-benefit__art--${item.art}`} aria-hidden="true">
        {/* The art is blown up to 219-244% of its box by the crop rules, so the
            rendered width is roughly 2.4x the visible chip. */}
        <OptImg base={item.image} sizes="(max-width: 620px) 200px, (max-width: 900px) 250px, 340px" alt="" />
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
          <div className="fl-why__product">
            <OptImg
              base="figma-home/why-imgImage22"
              sizes="(max-width: 900px) 100vw, 500px"
              alt="Femi9 pad on a lavender pedestal"
            />
          </div>
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
  const cards = products.slice(0, 4)

  return (
    <Reveal className="fl-products" id="products">
      <img className="fl-products__ribbon" src={`${ASSET}products-imgRectangle15.svg`} alt="" width={1548} height={278} loading="lazy" decoding="async" />
      <div className="fl-shell">
        <div className="fl-heading">
          <div>
            <p className="fl-kicker fl-kicker--gold">Buy Now <Flower /></p>
            <h2>Choose Your Perfect Fit. Shop Sanitary Pads for Your Flow.</h2>
            <p style={{ marginBottom: '16px' }}>
              Every body is different. Whether you experience light flow, regular flow, or heavy flow periods, Femi9 has a sanitary pad designed just for you.
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
              Choose the pad size and protection level that matches your flow, then shop with confidence and comfort in mind.
            </p>
          </div>
          {/* Was `to="/#products"` while sitting INSIDE #products — a visible
              no-op that also implied a catalog route which did not exist. */}
          <Link className="fl-btn fl-btn--outline fl-btn--arrow" to="/products">View All <span>→</span></Link>
        </div>
        <div className="grid-products" style={{ marginTop: 44 }}>
          {cards.map((product) => (
            <ProductCard key={product.id} product={product} showInsideOnHover />
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
      <img className="fl-journal__ribbon" src={`${ASSET}blogs-imgVector2.svg`} alt="" width={844} height={425} loading="lazy" decoding="async" />
      <img className="fl-journal__polygon" src={`${ASSET}blogs-imgPolygon2.svg`} alt="" width={185} height={185} loading="lazy" decoding="async" />
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
                {post?.image ? (
                  // An editor-supplied URL, so there is no derivative ladder for
                  // it — the most we can do is stop it blocking and reserve a box.
                  <img src={post.image} alt="" width={1536} height={1024} loading="lazy" decoding="async" />
                ) : (
                  // The desktop crop scales this to ~313% of the card, hence the
                  // deliberately large non-mobile `sizes`.
                  <OptImg base="figma-home/blogs-imgImage18" sizes="(max-width: 900px) 92vw, 1350px" alt="" />
                )}
              </span>
              <span className="fl-blog__shade" />
              <span className="fl-blog__meta">
                <span className="fl-blog__read">
                  <small>{post ? `${post.readTime} min read` : '5 min read'}</small>
                  <span className="fl-blog__arrow"><img src={`${ASSET}blogs-imgFrame.svg`} alt="" width={30} height={30} loading="lazy" decoding="async" /></span>
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

/** Portraits used by the rail. Reused in order for database reviews — these
 *  are stock customer imagery, never claimed to be the named reviewer. */
const REVIEW_PORTRAITS = [
  'figma-home/testimonials-imgFrame28',
  'figma-home/testimonials-imgFrame29',
  'figma-home/testimonials-imgFrame30',
  'figma-home/testimonials-imgFrame32',
] as const

const REVIEWS = [
  { image: 'figma-home/testimonials-imgFrame28', name: 'K', quote: 'Forget I’m Wearing One. And Zero Rash.' },
  { image: 'figma-home/testimonials-imgFrame29', name: 'Fatima S.', quote: 'Switched The Whole Family. Zero Leaks Overnight.' },
  { image: 'figma-home/testimonials-imgFrame30', name: 'Priya N.', quote: 'The First Pad That Didn’t Irritate My Skin At All.' },
  { image: 'figma-home/testimonials-imgFrame32', name: 'Make The Switch This Month', quote: 'Overnight 425 Is A Game-Changer.' },
] as const

/**
 * Testimonial rail.
 *
 * Prefers real approved reviews and only falls back to the authored set when
 * there are fewer than three — the same pattern the Journal teaser already uses
 * for posts. The authored entries carry a portrait; DB reviews do not, so they
 * reuse the same portraits in order as generic customer imagery rather than
 * inventing a face for a named person.
 */
function Testimonials({ featuredReviews }: { featuredReviews: FeaturedReview[] }) {
  const [manualOffset, setManualOffset] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const cards = useMemo(() => {
    if (featuredReviews.length < 3) {
      return REVIEWS.map((r) => ({ key: r.name, image: r.image, name: r.name, quote: r.quote }))
    }
    return featuredReviews.slice(0, 6).map((r, i) => ({
      key: r.id,
      image: REVIEW_PORTRAITS[i % REVIEW_PORTRAITS.length],
      name: r.place ? `${r.name} · ${r.place}` : r.name,
      quote: r.quote,
    }))
  }, [featuredReviews])

  const items = [...cards, ...cards]
  const shift = manualOffset === null ? undefined : `calc(-80px - ${manualOffset * 421}px)`

  /**
   * The 421px step is the DESKTOP card pitch (381px card + 40px gap). Below
   * 900px the rail is a real `overflow-x:auto` scroller with ~326px cards, so
   * translating it 421px dragged the visible card half off-screen and fought
   * the native scroll position. There, scroll it instead of transforming it.
   */
  const step = (dir: -1 | 1) => {
    const track = trackRef.current
    if (track && window.matchMedia('(max-width: 900px)').matches) {
      const card = track.firstElementChild as HTMLElement | null
      track.scrollBy({ left: dir * ((card?.offsetWidth ?? 300) + 16), behavior: 'smooth' })
      return
    }
    setManualOffset((value) => ((value ?? 0) + dir + cards.length) % cards.length)
  }

  return (
    <Reveal className="fl-testimonials" id="testimonials">
      <div className="fl-shell">
        <div className="fl-heading">
          <div><p className="fl-kicker fl-kicker--gold">Testimonial <Flower /></p><h2>Real Period Stories. Real Everyday Confidence.</h2></div>
          <div className="fl-testimonials__controls">
            <button type="button" aria-label="Previous testimonial" onClick={() => step(-1)}><img src={`${ASSET}testimonials-imgFrame.svg`} alt="" width={32} height={32} loading="lazy" decoding="async" /></button>
            <button type="button" aria-label="Next testimonial" onClick={() => step(1)}><img src={`${ASSET}testimonials-imgFrame1.svg`} alt="" width={32} height={32} loading="lazy" decoding="async" /></button>
          </div>
        </div>
        <div ref={trackRef} className={`fl-testimonials__track${manualOffset !== null ? ' is-manual' : ''}`} style={{ '--testimonial-shift': shift } as CSSProperties}>
          {items.map((item, index) => (
            <article className="fl-review" key={`${item.key}-${index}`}>
              <div className="fl-review__media">
                <OptImg base={item.image} sizes="(max-width: 620px) 86vw, (max-width: 900px) 330px, 381px" alt="Femi9 customer" />
                <img className="fl-review__play" src={`${ASSET}testimonials-imgGroup.svg`} alt="" width={52} height={52} loading="lazy" decoding="async" />
              </div>
              <div className="fl-review__body"><img src={`${ASSET}testimonials-imgFrame31.svg`} alt="Five stars" width={90} height={18} loading="lazy" decoding="async" /><h3>{item.name}</h3><p>“{item.quote}”</p></div>
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
      <img className="fl-partner__ribbon" src={`${ASSET}partner-imgVector2.svg`} alt="" width={844} height={425} loading="lazy" decoding="async" />
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
        <div className="fl-partner__image">
          <OptImg
            base="figma-home/partner-imgImage38"
            sizes="(max-width: 900px) 92vw, 640px"
            alt="Femi9 women entrepreneurs"
          />
        </div>
      </div>
    </Reveal>
  )
}

export function Home({ products, posts, featuredReviews }: Props) {
  return (
    <main className="figma-landing" id="top">
      <Nav />
      <Hero />
      <ProductGrid products={products} />
      <Why />
      {/* Styling lives in figma-landing-responsive.css. It was an inline style
          object on every element here, which outranks any media query, so this
          was the one landing section that kept 80px of desktop padding and a
          35px heading at 360px. */}
      <section id="about-femi9" className="about-section">
        <div className="fl-shell">
          <h2>Designed for Her. Driven by Care. Made to Move With Her.</h2>
          <p>
            Femi9 was created with one simple purpose: to make period care more comfortable, thoughtful, and reliable. We design our sanitary pads around what real women need-softness against your skin, breathable comfort that actually works, absorbency you can count on, and protection you can trust.
          </p>
          <p>
            Beyond just products, Femi9 is about encouraging better menstrual hygiene choices, building awareness, and giving women the confidence they deserve throughout their cycle.
          </p>
          <Link to="/about" className="fl-btn fl-btn--gold">
            Know More About Femi9
          </Link>
        </div>
      </section>
      <Journal posts={posts} />
      <div className="fl-cycle"><CycleTracker /></div>
      <Testimonials featuredReviews={featuredReviews} />
      <Partner />
      <Footer />
    </main>
  )
}
