import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Nav, HOME_LINKS } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { HeroMascot } from "@/components/three/HeroMascot";
import { FloatyBlob, Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { LayerStack } from "@/components/home/LayerStack";
import { ProductRange } from "@/components/home/ProductRange";
import { SizeFinder } from "@/components/home/SizeFinder";
import { Em, NumberedCard, QuoteCard, SectionHeading, StatBlock } from "@/components/ui/bits";
import { Icon } from "@/components/ui/Icon";
import { FEATURE_IMAGES, HERO_STATS, MARQUEE_ITEMS, TESTIMONIALS, USPS, VALUES } from "@/lib/content";
import { SIZES } from "@/lib/catalog";
import { absoluteUrl, canonical, jsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

const HOME_TITLE = "Baby Diapers & Baby Diaper Pants Online | Lumi9 by Femi9";
const HOME_DESCRIPTION =
  "Shop Lumi9 baby diapers and diaper pants for newborns and growing babies. Discover soft, breathable comfort, quick moisture absorption, 360° protection, wetness indicators and sizes from NB to XL.";

export const metadata: Metadata = {
  // The brief's homepage title already names the brand, so it opts out of the
  // layout's "%s · Lumi9" template rather than ending "… | Lumi9 by Femi9 · Lumi9".
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  keywords: [
    "baby diapers",
    "diaper pants for baby",
    "baby diapers online",
    "best baby diapers in India",
    "buy baby diapers online India",
    "soft baby diapers",
    "breathable baby diapers",
    "leak proof baby diapers",
    "premium baby diapers",
    "wetness indicator diapers",
    "360 degree protection diapers",
    "Lumi9 diapers",
    "Lumi9 baby diaper pants",
    "Femi9 Lumi9",
  ],
  alternates: canonical("/"),
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION },
};

/**
 * The size run as an ItemList.
 *
 * Sourced from the seed list rather than the database on purpose: this is a
 * navigational hint about which size pages exist, it changes only when a size
 * is added or retired, and it must not be the thing that makes the homepage
 * fail when the catalogue read is slow. Prices and availability are stated on
 * the product pages, where the Product schema reads them live.
 */
const SIZE_LIST_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Lumi9 Cloud Soft baby diaper range",
  itemListOrder: "https://schema.org/ItemListOrderAscending",
  numberOfItems: SIZES.length,
  itemListElement: SIZES.map((size, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: `Lumi9 Cloud Soft ${size.name} baby diapers — ${size.fits}`,
    url: absoluteUrl(`/product/${size.size.toLowerCase()}`),
  })),
};

const FEATURE_COLUMNS = [
  { factor: 0.06, offset: false, images: [FEATURE_IMAGES.softness, FEATURE_IMAGES.gentleSteps] },
  { factor: 0.16, offset: true, images: [FEATURE_IMAGES.wetnessLock, FEATURE_IMAGES.happinessWrapped] },
  { factor: 0.1, offset: false, images: [FEATURE_IMAGES.softAsCotton, FEATURE_IMAGES.soothingComfort] },
];

export default function HomePage() {
  return (
    <>
      {/* The hero mascot is above the fold, but useGLTF can only request it after
          the bundle loads and hydrates — about a second of dead time. Preloading
          starts the model and its decoder while the JS is still downloading. */}
      <link rel="preload" href="/assets/mascot.glb" as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/draco/draco_wasm_wrapper.js" as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/draco/draco_decoder.wasm" as="fetch" crossOrigin="anonymous" />

      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(SIZE_LIST_SCHEMA)} />

      <Nav variant="home" links={HOME_LINKS} cta="both" />

      <main>
        {/* HERO — clears the fixed nav by its measured height (--nav-h) */}
        <header
          id="top"
          /* full-height hero, except on short viewports (landscape phones, split
             screens) where it just wraps its content instead of overflowing */
          className="px-safe relative flex min-h-[100svh] flex-col items-center gap-[clamp(20px,4vw,32px)] pb-[clamp(40px,6vw,60px)] pt-[calc(var(--nav-h,104px)+clamp(20px,4vw,44px))] md:flex-row md:gap-0 [@media(max-height:560px)]:min-h-0 [@media(max-height:560px)]:pt-[calc(var(--nav-h,104px)+14px)] [@media(max-height:560px)]:pb-8"
          style={{ background: "radial-gradient(120% 90% at 78% 20%, #eef1e0 0%, #f7f5ea 55%)" }}
        >
          <FloatyBlob
            factor={0.12}
            className="absolute top-[12%] left-[6%] size-[clamp(90px,14vw,180px)]"
            innerClassName="rounded-full bg-butter opacity-55 blur-[2px]"
            duration="7s"
          />
          <FloatyBlob
            factor={0.28}
            className="absolute bottom-[14%] left-[18%] size-[clamp(48px,7vw,90px)]"
            innerClassName="rounded-full bg-moss-soft opacity-40"
            duration="5.5s"
            delay=".6s"
          />
          <FloatyBlob
            factor={0.2}
            className="absolute top-[22%] right-[8%] size-[clamp(64px,9vw,120px)]"
            innerClassName="rounded-full border-2 border-dashed border-moss opacity-35"
            duration="8s"
            delay=".3s"
          />
          <FloatyBlob
            factor={0.35}
            className="absolute right-[22%] bottom-[22%] size-[clamp(32px,4.5vw,56px)]"
            innerClassName="rounded-full bg-gold opacity-50"
            duration="6s"
            delay="1s"
          />

          <div className="relative z-3 w-full max-w-[620px] flex-1">
            <div className="mb-[clamp(16px,2.6vw,26px)] inline-flex max-w-full items-center gap-2 rounded-pill border border-moss-tint bg-canvas px-[15px] py-[7px] text-[clamp(12px,1.1vw,13px)] font-semibold text-moss-deep">
              <span className="size-[7px] shrink-0 rounded-full bg-moss" aria-hidden />
              Trusted by 40,000+ Indian families
            </div>
            {/* The page's one H1, and the only place the primary keyword
                ("baby diapers") belongs at this weight. */}
            <h1 className="m-0 mb-[clamp(14px,2vw,20px)] font-display text-[clamp(34px,8.6vw,78px)] font-normal leading-[1.0] md:text-[clamp(42px,5.4vw,78px)]">
              CloudSoft Baby Diapers
              <br />
              Made for <Em>Happy</Em> Little Days
            </h1>
            <p className="m-0 mb-[clamp(24px,3.4vw,34px)] max-w-[54ch] text-lead leading-[1.6] text-muted">
              From sleepy newborn cuddles to crawling, stretching and first little steps, Lumi9 baby diapers are
              designed to move comfortably with your growing baby — soft cotton-like comfort, quick moisture
              absorption, breathable protection and a flexible fit for playtime, naps and nighttime rest.
            </p>
            <div className="mb-[clamp(28px,4vw,40px)] flex flex-wrap gap-3.5">
              <Link href="/shop" className="btn btn-dark max-[400px]:w-full">
                Shop Baby Diapers →
              </Link>
              <Link href="#sizes" className="btn btn-ghost max-[400px]:w-full">
                Find your baby’s size
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-[clamp(20px,3vw,30px)] gap-y-4">
              {HERO_STATS.map((stat) => (
                <StatBlock key={stat.label} value={stat.value} label={stat.label} />
              ))}
            </div>
          </div>

          <div className="relative z-2 flex w-full min-w-0 flex-1 items-center justify-center md:self-stretch">
            <div
              className="absolute aspect-square w-[min(72vw,560px)] rounded-full md:w-[min(46vw,560px)]"
              style={{ background: "radial-gradient(circle, #dfe6c6 0%, rgba(223,230,198,0) 68%)" }}
              aria-hidden
            />
            <HeroMascot />
          </div>

        </header>

        {/* TRUST MARQUEE */}
        <div className="overflow-hidden bg-midnight py-[clamp(14px,1.8vw,20px)] whitespace-nowrap text-butter">
          <div className="inline-flex motion-safe:animate-marquee">
            {[0, 1].map((copy) => (
              <div key={copy} className="inline-flex" aria-hidden={copy === 1}>
                {MARQUEE_ITEMS.map((item) => (
                  <span key={item} className="flex items-center font-display text-[clamp(16px,2vw,22px)] opacity-92">
                    <span className="px-[clamp(18px,3vw,34px)]">{item}</span>
                    <span aria-hidden>·</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* WHY LUMI9 */}
        <section id="why" className="px-safe bg-paper py-section">
          <div className="mx-auto max-w-[1180px]">
            <Reveal className="mb-[clamp(36px,5vw,64px)] max-w-[720px]">
              <SectionHeading eyebrow="Why Lumi9">
                Comfort and protection should come <Em>standard.</Em>
              </SectionHeading>
              <p className="m-0 mt-5 text-body leading-[1.65] text-muted">
                Every little stretch, crawl, nap and nighttime cuddle deserves comfort you can count on. Lumi9 baby
                diapers bring together soft everyday care, fast moisture management, breathable materials and
                all-around protection to support your baby through every little move.
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-[clamp(14px,1.8vw,22px)] sm:grid-cols-2 lg:grid-cols-3">
              {USPS.map((usp) => (
                <Reveal key={usp.title} className="rounded-card border border-moss-tint bg-canvas p-card">
                  <div className="mb-[clamp(16px,2.2vw,22px)] flex size-13 items-center justify-center rounded-chip bg-moss-tint text-moss-deep">
                    <Icon name={usp.icon} size={26} />
                  </div>
                  <h3 className="m-0 mb-2.5 text-[clamp(17px,1.6vw,20px)] font-bold">{usp.title}</h3>
                  <p className="m-0 text-[clamp(14px,1.2vw,15px)] leading-[1.6] text-muted">{usp.body}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <LayerStack />
        <ProductRange />
        <SizeFinder />

        {/* BRAND STORY */}
        <section id="story" className="px-safe relative overflow-hidden bg-paper py-section-lg">
          <Parallax
            factor={0.2}
            className="absolute top-[10%] right-[6%] size-[clamp(80px,12vw,150px)] rounded-full bg-moss-tint opacity-60"
            aria-hidden
          />
          <div className="relative z-2 mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-block md:grid-cols-2">
            <Reveal className="relative">
              <div className="relative aspect-5/6 overflow-hidden rounded-media shadow-hero">
                <Parallax factor={0.1} className="absolute inset-x-0 top-[-9%] h-[118%]">
                  <Image
                    src={FEATURE_IMAGES.softness.src}
                    alt="A peacefully sleeping baby"
                    fill
                    sizes="(max-width: 768px) 92vw, 560px"
                    className="object-cover"
                  />
                </Parallax>
              </div>
              <Parallax
                factor={0.26}
                className="absolute bottom-[clamp(-16px,-2vw,-26px)] left-[clamp(-12px,-2vw,-26px)] flex items-center gap-3.5 rounded-[20px] bg-canvas px-[clamp(16px,2vw,24px)] py-[clamp(12px,1.6vw,18px)] shadow-float"
              >
                <div className="font-display text-[clamp(26px,3vw,36px)] leading-none text-moss-deep">4.9★</div>
                <div className="text-[clamp(12px,1.1vw,13px)] leading-[1.35] text-muted">
                  Rated by
                  <br />
                  40,000+ parents
                </div>
              </Parallax>
            </Reveal>

            <Reveal>
              <SectionHeading eyebrow="Our story" size="sm" className="mb-5.5">
                Made for the little moments parents <Em>notice most.</Em>
              </SectionHeading>
              <p className="m-0 mb-4.5 text-body leading-[1.65] text-muted">
                There is a particular kind of silence parents recognise. The room is finally quiet. Your baby has
                fallen asleep after a long day of feeding, playing, crawling and being carried from one loving pair of
                arms to another. And then you check the diaper.
              </p>
              <p className="m-0 mb-7 text-body leading-[1.65] text-muted">
                Those small questions are part of everyday parenting, and they are part of what shapes Lumi9 by Femi9 —
                soft everyday comfort, moisture-management technology, breathable materials and flexible protection in
                baby diapers made to support babies as they grow.
              </p>
              <Link href="/about" className="inline-flex items-center coarse:min-h-10 text-[15px] font-semibold text-moss-deep hover:text-midnight">
                Read our story →
              </Link>
            </Reveal>
          </div>
        </section>

        {/* FEATURE GALLERY */}
        <section id="features" className="px-safe relative overflow-hidden bg-moss-tint py-section">
          <Parallax
            factor={0.12}
            className="absolute top-[8%] -left-10 size-[clamp(110px,16vw,200px)] rounded-full bg-butter/50 blur-[4px]"
            aria-hidden
          />
          <Parallax
            factor={0.2}
            className="absolute right-[4%] bottom-[10%] size-[clamp(70px,10vw,120px)] rounded-full bg-moss-soft opacity-40"
            aria-hidden
          />
          <div className="relative z-2 mx-auto max-w-[1240px]">
            <Reveal className="mx-auto mb-[clamp(36px,5.5vw,66px)] max-w-[680px] text-center">
              <SectionHeading eyebrow="The Lumi9 difference">
                Designed for every <Em>little</Em> milestone.
              </SectionHeading>
            </Reveal>
            <div className="grid grid-cols-1 items-start gap-[clamp(14px,2vw,24px)] sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_COLUMNS.map((column) => (
                <Parallax
                  key={column.factor}
                  factor={column.factor}
                  className={`flex flex-col gap-[clamp(14px,2vw,24px)] ${column.offset ? "lg:mt-14" : ""}`}
                >
                  {column.images.map((image) => (
                    <Reveal key={image.src} className="overflow-hidden rounded-card shadow-lift">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        width={900}
                        height={1200}
                        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 380px"
                        className="block h-auto w-full"
                      />
                    </Reveal>
                  ))}
                </Parallax>
              ))}
            </div>
          </div>
        </section>

        {/* VALUES */}
        <section className="px-safe bg-canvas py-section">
          <div className="mx-auto max-w-[1180px]">
            <Reveal
              as="h2"
              className="m-0 mb-[clamp(32px,4.6vw,56px)] text-center font-display text-[clamp(28px,3.6vw,46px)] font-normal"
            >
              The values behind every Lumi9 baby diaper
            </Reveal>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-moss-tint bg-moss-tint sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
              {VALUES.map((value) => (
                <Reveal key={value.n}>
                  <NumberedCard n={value.n} title={value.title} body={value.body} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <section className="px-safe bg-paper py-section">
          <div className="mx-auto max-w-[1180px]">
            <Reveal className="mb-[clamp(28px,4vw,44px)] text-center">
              <div className="eyebrow mb-4">Loved by Lumi9 mums</div>
              <h2 className="m-0 font-display text-[clamp(26px,3.6vw,44px)] leading-[1.06] font-normal">
                Real parent moments. Everyday cloud-soft comfort.
              </h2>
            </Reveal>
            <div className="grid grid-cols-1 gap-[clamp(14px,1.8vw,22px)] sm:grid-cols-2 lg:grid-cols-3">
              {TESTIMONIALS.map((testimonial) => (
                <Reveal key={testimonial.name}>
                  <QuoteCard {...testimonial} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* SUBSCRIPTION CTA */}
        <section id="subscribe" className="px-safe py-[clamp(28px,4vw,48px)]">
          <Reveal className="relative mx-auto max-w-[1180px] overflow-hidden rounded-panel bg-midnight px-[clamp(22px,4vw,60px)] py-[clamp(40px,6vw,72px)]">
            <Parallax
              factor={0.18}
              className="absolute -top-10 right-15 size-[clamp(120px,18vw,220px)] rounded-full bg-butter/10"
              aria-hidden
            />
            <Parallax
              factor={0.3}
              className="absolute -right-7.5 -bottom-15 size-[clamp(90px,13vw,160px)] rounded-full bg-moss-soft/18"
              aria-hidden
            />
            <div className="relative z-2 max-w-[640px]">
              <div className="eyebrow mb-4.5 text-gold">The Lumi9 subscription</div>
              <h2 className="m-0 mb-5 font-display text-[clamp(28px,4.4vw,54px)] font-normal leading-[1.04] text-butter">
                Never run out of baby diapers again.
              </h2>
              <p className="m-0 mb-[clamp(24px,3.4vw,34px)] text-body leading-[1.6] text-butter/80">
                Because the last thing a parent wants at 2 a.m. is to discover there is only one diaper left. Choose
                your Lumi9 size and pack, set up recurring delivery, and move from NB through XL as your baby grows.
              </p>
              <div className="flex flex-wrap gap-3.5">
                <Link href="/subscription" className="btn btn-cream max-[400px]:w-full">
                  Start my box — save 20%
                </Link>
                <Link
                  href="#tech"
                  className="btn border-butter/35 text-butter hover:border-butter hover:text-butter max-[400px]:w-full"
                >
                  How it works
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <Footer />
    </>
  );
}
