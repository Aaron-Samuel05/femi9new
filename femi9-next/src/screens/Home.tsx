'use client'

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link } from '@/lib/router-compat'
import { useCart } from '@/store/cart'
import { CycleTracker } from '@/components/CycleTracker'
import type { ProductWithVariants } from '@/lib/services/products'
import type { BlogPostDTO } from '@/lib/services/blog'

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

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.dataset.visible = 'true'
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.dataset.visible = 'true'
          observer.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className={className} id={id}>
      {children}
    </section>
  )
}

const NAV = [
  ['#products', 'Products'],
  ['#why', 'Why Femi9'],
  ['#about', 'About Us'],
  ['#journal', 'Journal'],
  ['#opportunities', 'Opportunities'],
] as const

function LandingNav() {
  const { count, openCart } = useCart()
  const [open, setOpen] = useState(false)

  const scrollTo = (target: string) => {
    setOpen(false)
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <header className="fl-nav">
      <Link className="fl-nav__logo" to="/" aria-label="Femi9 home">
        <img src={`${ASSET}navbar-imgImage29.png`} alt="Femi9" />
      </Link>
      <nav className="fl-nav__links" aria-label="Landing page navigation">
        {NAV.map(([target, label]) => (
          <button type="button" key={target} onClick={() => scrollTo(target)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="fl-nav__actions">
        <Link className="fl-nav__icon" to="/account" aria-label="My account">
          <img src={`${ASSET}navbar-imgLayer2.svg`} alt="" />
        </Link>
        <button className="fl-nav__icon" type="button" onClick={openCart} aria-label="Open bag">
          <img src={`${ASSET}navbar-imgFrame.svg`} alt="" />
          {count > 0 && <span>{count}</span>}
        </button>
        <button
          className="fl-nav__menu"
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <i />
          <i />
        </button>
      </div>
      <div className={`fl-nav__mobile${open ? ' is-open' : ''}`}>
        {NAV.map(([target, label]) => (
          <button type="button" key={target} onClick={() => scrollTo(target)}>
            {label}
          </button>
        ))}
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="fl-hero" aria-labelledby="fl-hero-heading">
      <img className="fl-hero__flower fl-hero__flower--ghost" src={`${ASSET}hero-imgGroup.svg`} alt="" />
      <img className="fl-hero__flower fl-hero__flower--solid" src={`${ASSET}hero-imgGroup1.svg`} alt="" />
      <img className="fl-hero__cloud fl-hero__cloud--top" src={`${ASSET}hero-img4157844189182061.png`} alt="" />
      <img className="fl-hero__cloud fl-hero__cloud--bottom" src={`${ASSET}hero-img4157844189182061.png`} alt="" />
      <img className="fl-hero__cloud fl-hero__cloud--edge" src={`${ASSET}hero-img4157844189182061.png`} alt="" />
      <img className="fl-hero__pad" src={`${ASSET}hero-imgImage20.png`} alt="" />
      <img className="fl-hero__model" src={`${ASSET}hero-imgImage19.png`} alt="Woman seated beside Femi9 pads" />
      <div className="fl-shell fl-hero__inner">
        <div className="fl-hero__copy">
          <h1 id="fl-hero-heading"><strong>Organic Pads</strong> That Feel Like Nothing At All.</h1>
          <p>Ultra-Thin, Breathable Cotton Pads With A Mood-Lifting Anion Strip. Toxin-Free, Biodegradable, And Made For Real Life</p>
          <div className="fl-hero__proof">
            <span><img src={`${ASSET}hero-imgBadgetCheckAlt21.png`} alt="" />Certified Organic Cotton</span>
            <i />
            <span><img src={`${ASSET}hero-imgSeedling1.png`} alt="" />Biodegradable</span>
          </div>
          <button type="button" className="fl-btn fl-btn--gold" onClick={() => document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' })}>Buy Now</button>
        </div>
      </div>
      <div className="fl-hero__pager" aria-hidden="true"><span /><i /></div>
    </section>
  )
}

const FOUNDERS = [
  { image: 'about-founder.png', label: 'FOUNDERS', variant: 'doctor' },
  { image: 'about-woman.png', label: 'CO-FOUNDERS', variant: 'woman' },
  { image: 'about-man.png', label: 'CO-FOUNDERS', variant: 'man' },
] as const

function About() {
  return (
    <Reveal className="fl-about" id="about">
      <img className="fl-about__shape fl-about__shape--corner" src={`${ASSET}about-imgPolygon1.svg`} alt="" />
      <img className="fl-about__shape fl-about__shape--top" src={`${ASSET}about-imgVector2.svg`} alt="" />
      <img className="fl-about__shape fl-about__shape--bottom" src={`${ASSET}about-imgVector3.svg`} alt="" />
      <div className="fl-shell fl-about__layout">
        <div className="fl-about__people" aria-label="Femi9 founders">
          {FOUNDERS.map((person) => (
            <figure className={`fl-founder fl-founder--${person.variant}`} key={person.variant}>
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
  )
}

const BENEFITS = [
  { image: 'why-imgImage23.png', title: 'Cotton-Soft Comfort', copy: 'Feels Soft Against Your Skin For All-Day Comfort With Zero Irritation.' },
  { image: 'why-imgImage24.png', title: 'Breathable Design', copy: 'Airflow-Friendly Layers Help Reduce Heat And Keep You Feeling Fresh.' },
  { image: 'why-imgImage25.png', title: 'Anion Strip Technology', copy: 'Helps Reduce Odour And Provides Extra Comfort Throughout Your Period.' },
  { image: 'why-imgImage26.png', title: 'Nothing Nasty', copy: 'Free From Harsh Chemicals, Chlorine And Toxins For Skin-Friendly Protection.' },
] as const

function Benefit({ item, side }: { item: (typeof BENEFITS)[number]; side: 'left' | 'right' }) {
  return (
    <article className={`fl-benefit fl-benefit--${side}`}>
      <img src={`${ASSET}${item.image}`} alt="" />
      <div><h3>{item.title}</h3><p>{item.copy}</p></div>
    </article>
  )
}

function Why() {
  return (
    <Reveal className="fl-why" id="why">
      <div className="fl-shell">
        <div className="fl-heading fl-heading--light">
          <div><p className="fl-kicker">Why Femi9 <Flower light /></p><h2>Built By A Doctor. Backed By Women.<br />Made For Every Body.</h2><p>Knowledge, Care, And Confidence—Everything You Need To Understand Your Body Better.</p></div>
          <Link className="fl-btn fl-btn--light" to="/periods-wall">View Details <span>→</span></Link>
        </div>
        <div className="fl-why__grid">
          <div className="fl-why__column"><Benefit item={BENEFITS[0]} side="left" /><Benefit item={BENEFITS[1]} side="left" /></div>
          <div className="fl-why__product"><img src={`${ASSET}why-imgImage22.png`} alt="Femi9 pad on a lavender pedestal" /></div>
          <div className="fl-why__column"><Benefit item={BENEFITS[2]} side="right" /><Benefit item={BENEFITS[3]} side="right" /></div>
        </div>
      </div>
    </Reveal>
  )
}

function ProductGrid({ products }: { products: ProductWithVariants[] }) {
  const { add } = useCart()
  const cards = Array.from({ length: 4 }, (_, index) => products[index] ?? products[0])

  return (
    <Reveal className="fl-products" id="products">
      <img className="fl-products__ribbon" src={`${ASSET}products-imgRectangle15.svg`} alt="" />
      <div className="fl-shell">
        <div className="fl-heading">
          <div><p className="fl-kicker fl-kicker--gold">Buy Now <Flower /></p><h2>Real People, Real Relief.</h2><p>Knowledge, Care, And Confidence—Everything You Need To Understand Your Body Better.</p></div>
          <Link className="fl-btn fl-btn--outline fl-btn--arrow" to={products[0] ? `/product/${products[0].id}` : '/'}>View All <span>→</span></Link>
        </div>
        <div className="fl-products__grid">
          {cards.map((product, index) => {
            const slug = product?.id ?? 'p330dw'
            const variantId = product?.variants[0]?.id
            return (
              <article className="fl-product" key={`${slug}-${index}`} style={{ '--card-index': index } as CSSProperties}>
                <Link className="fl-product__media" to={`/product/${slug}`}>
                  <img src={`${ASSET}products-imgFrame206.png`} alt="Femi9 organic cotton pad pack" />
                </Link>
                <div className="fl-product__body">
                  <Link to={`/product/${slug}`}><h3>Femi9-330mm-Extra-Large 6 Pads</h3></Link>
                  <p>qnty: 8 pads</p>
                  <div><strong>₹ 1,099</strong><button type="button" disabled={!variantId} onClick={() => variantId && void add(variantId)}>Buy Now</button></div>
                </div>
              </article>
            )
          })}
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
      <div className="fl-shell">
        <div className="fl-heading">
          <div><p className="fl-kicker">Blogs <Flower /></p><h2>Women&apos;s Wellness Journal</h2><p>Knowledge, Care, And Confidence—Everything You Need To Understand Your Body Better.</p></div>
          <Link className="fl-btn fl-btn--outline" to="/blog">View All</Link>
        </div>
        <div className="fl-journal__grid">
          {JOURNAL.map((item, index) => (
            <Link className="fl-blog" to={posts[index] ? `/blog/${posts[index].slug}` : '/blog'} key={item.title} style={{ '--blog-index': index } as CSSProperties}>
              <span className={`fl-blog__photo fl-blog__photo--${item.pos}`} />
              <span className="fl-blog__shade" />
              <span className="fl-blog__meta"><b>{item.tag}</b><small>5mins Read</small></span>
              <h3>{item.title}</h3>
            </Link>
          ))}
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
          <div><p className="fl-kicker fl-kicker--gold">Testimonial <Flower /></p><h2>Real People, Real Relief.</h2></div>
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

function LandingFooter() {
  const { notify } = useCart()
  const [email, setEmail] = useState('')
  const subscribe = (event: FormEvent) => {
    event.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return notify('Please enter a valid email')
    setEmail('')
    notify('Thanks! You are on the list')
  }

  return (
    <Reveal className="fl-footer">
      <div className="fl-shell">
        <div className="fl-footer__cta">
          <img className="fl-footer__flower fl-footer__flower--one" src={`${ASSET}footer-imgVector.svg`} alt="" />
          <img className="fl-footer__flower fl-footer__flower--two" src={`${ASSET}footer-imgVector.svg`} alt="" />
          <div><h2>Make The Switch This Month.</h2><p>Try A Starter Pack, Feel The Difference, And Never Go Back To Plastic Pads.</p><button className="fl-btn fl-btn--gold" type="button" onClick={() => document.querySelector('#products')?.scrollIntoView({ behavior: 'smooth' })}>Buy Now</button></div>
          <img className="fl-footer__packs" src={`${ASSET}footer-imgImage9.png`} alt="Hands holding two Femi9 packs" />
        </div>
        <div className="fl-footer__grid">
          <div className="fl-footer__brand"><img src={`${ASSET}footer-imgImage1.png`} alt="Femi9" /><p>Organic, breathable period care that is kinder to your body and the planet.</p><img className="fl-footer__social" src={`${ASSET}footer-imgFrame3.svg`} alt="Facebook and Instagram" /></div>
          <div><h3>SHOP</h3><Link to="/product/p330dw">330mm Double Wings</Link><Link to="/product/p330cw">330mm Centre Wings</Link><Link to="/product/p290l9">290mm Large</Link><Link to="/product/p290l3">290mm Starter</Link></div>
          <div><h3>FEMI9</h3><a href="#why">Why Femi9</a><a href="#about">Our Story</a><a href="#opportunities">Impact</a></div>
          <div><h3>SUPPORT</h3><a href="tel:+1234567890"><img src={`${ASSET}footer-imgIcon.svg`} alt="" /> +123 456 7890</a><a href="mailto:support@mm.com"><img src={`${ASSET}footer-imgIcon1.svg`} alt="" /> support@mm.com</a></div>
          <div className="fl-footer__newsletter"><h3>CARE IN YOUR INBOX</h3><p>Organic, breathable period care that is kinder to your body and the planet.</p><form onSubmit={subscribe}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Enter your mail" aria-label="Email address" /><button type="submit">Subscribe</button></form></div>
        </div>
        <p className="fl-footer__copyright">© Femi9 2026. All rights reserved.</p>
      </div>
    </Reveal>
  )
}

export function Home({ products, posts }: Props) {
  return (
    <main className="figma-landing" id="top">
      <LandingNav />
      <Hero />
      <About />
      <Why />
      <ProductGrid products={products} />
      <Journal posts={posts} />
      <div className="fl-cycle"><CycleTracker /></div>
      <Testimonials />
      <Partner />
      <LandingFooter />
    </main>
  )
}
