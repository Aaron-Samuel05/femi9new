import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Nav, NAV_LINKS } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { CursorScrubVideo } from "@/components/media/CursorScrubVideo";
import { FloatyBlob, Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { LayerStack } from "@/components/home/LayerStack";
import { ProductRange } from "@/components/home/ProductRange";
import { SizeFinder } from "@/components/home/SizeFinder";
import { WhyLumi9 } from "@/components/home/WhyLumi9";
import { FeatureStrip } from "@/components/home/FeatureStrip";
import { Testimonials } from "@/components/home/Testimonials";
import { FeaturedJournal } from "@/components/home/FeaturedJournal";
import { Scallop, WaveEdge } from "@/components/ui/Scallop";
import { Em, SectionHeading, StatBlock } from "@/components/ui/bits";
import { FEATURE_IMAGES, HERO_STATS, MARQUEE_ITEMS } from "@/lib/content";
import { loadCatalog } from "@/lib/catalog.server";
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
 * Read from the DATABASE, like everything else the console owns.
 *
 * It used to be built from the `SIZES` array in `@/lib/catalog` — the seed's
 * input — on the argument that a navigational hint must not make the homepage
 * fail when the catalogue read is slow. That argument no longer holds: the root
 * layout is `force-dynamic` and already awaits `loadCatalog()` on every
 * request, so this page cannot render without that read succeeding anyway. All
 * the seed list bought was the chance to advertise a size the console had
 * retired. Prices and availability stay on the product pages, where the Product
 * schema reads them live.
 */
function sizeListSchema(sizes: { size: string; name: string; fits: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Lumi9 Cloud Soft baby diaper range",
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: sizes.length,
    itemListElement: sizes.map((size, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: `Lumi9 Cloud Soft ${size.name} baby diapers — ${size.fits}`,
      url: absoluteUrl(`/product/${size.size.toLowerCase()}`),
    })),
  };
}

/*
 * The gallery wall, read in rows.
 *
 * This was three COLUMNS, each with its own parallax factor (0.06 / 0.16 / 0.1)
 * and the middle one pushed down by lg:mt-14. Three different scroll speeds
 * means the columns can only line up at one scroll position and are ragged at
 * every other one, so a grid of six identically-sized creatives never read as
 * the wall it is - it read as tiles that had slipped. The stagger is a good
 * device for images of DIFFERENT heights; all eight of these are 1500x1500.
 *
 * Row-major here, so the order matches what the eye actually follows.
 */
const FEATURE_TILES = [
  FEATURE_IMAGES.softness,
  FEATURE_IMAGES.wetnessLock,
  FEATURE_IMAGES.softAsCotton,
  FEATURE_IMAGES.gentleSteps,
  FEATURE_IMAGES.happinessWrapped,
  FEATURE_IMAGES.soothingComfort,
];

export default async function HomePage() {
  const { sizes } = await loadCatalog();
  return (
    <>
      {/* The hero mascot is above the fold, but useGLTF can only request it after
          the bundle loads and hydrates — about a second of dead time. Preloading
          starts the model and its decoder while the JS is still downloading. */}
      <link rel="preload" href="/assets/mascot.glb" as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/draco/draco_wasm_wrapper.js" as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/draco/draco_decoder.wasm" as="fetch" crossOrigin="anonymous" />

      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(sizeListSchema(sizes))} />

      <Nav variant="home" links={NAV_LINKS} />

      <main>
        {/* HERO — clears the fixed nav by its measured height (--nav-h) */}
        <header
          id="top"
          /* full-height hero, except on short viewports (landscape phones, split
             screens) where it just wraps its content instead of overflowing */
          className="px-safe relative flex min-h-[100svh] flex-col items-center gap-[clamp(12px,4vw,32px)] pb-[clamp(32px,6vw,60px)] pt-[calc(var(--nav-h,68px)+clamp(18px,4vw,44px))] md:flex-row md:gap-0 [@media(max-height:560px)]:min-h-0 [@media(max-height:560px)]:pt-[calc(var(--nav-h,68px)+14px)] [@media(max-height:560px)]:pb-8"
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
            <p className="m-0 mb-[clamp(20px,3.4vw,34px)] max-w-[54ch] text-lead leading-[1.55] text-muted md:leading-[1.6]">
              From sleepy newborn cuddles to crawling, stretching and first little steps, Lumi9 baby diapers are
              designed to move comfortably with your growing baby — soft cotton-like comfort, quick moisture
              absorption, breathable protection and a flexible fit for playtime, naps and nighttime rest.
            </p>
            <div className="mb-[clamp(22px,4vw,40px)] flex flex-wrap gap-3">
              <Link href="/shop" className="btn btn-dark max-[520px]:w-full">
                Shop Baby Diapers →
              </Link>
              <Link href="#sizes" className="btn btn-ghost max-[520px]:w-full">
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
            {/* Warm, not sage: the glow now matches the video's own #f1e2d2
                backdrop, so the clip's rectangle dissolves into the hero
                instead of sitting on it as a visible tile. */}
            <div
              className="absolute aspect-square w-[min(78vw,600px)] rounded-full md:w-[min(48vw,600px)]"
              style={{ background: "radial-gradient(circle, #f1e2d2 0%, rgba(241,226,210,0) 70%)" }}
              aria-hidden
            />
            <CursorScrubVideo
              src="/assets/lumi-scrub-v1.mp4"
              poster="/assets/lumi-scrub-v1-poster.jpg"
              label="Lumi, the Lumi9 avocado, waving hello"
              hint="Move your cursor"
              axis="horizontal"
              /* window, not component: the character answers the moment the
                 pointer moves anywhere in the hero, so the interaction is found
                 without having to hover the right rectangle to discover it. */
              trackingArea="window"
              smoothing={0.16}
              objectFit="cover"
              loom={0.05}
              feather
              className="relative z-2 h-[min(52svh,360px)] w-full min-[420px]:h-[min(56svh,440px)] md:h-[min(78svh,720px)] [@media(max-height:560px)]:h-[min(70svh,260px)]"
            />
          </div>

        </header>

        {/* CLAIM STRIP — what the product is for, before the first scroll */}
        <FeatureStrip />

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
        {/* The marquee's hard bottom edge is the one place the page reads as a
            stack of bands. The scallop turns that seam into a deliberate trim. */}
        <Scallop color="var(--color-midnight)" radius={13} />

        <WhyLumi9 />

        {/* The moss band is the one place two large colour fields meet twice in
            a row, and a straight rule on both sides is what makes it read as a
            slab dropped between two pages. WaveEdge rather than Scallop here:
            a bump row at this scale competes with the layer cards, whereas one
            slow curve just softens the seam.

            Both edges are moss, not paper — the fill has to be the colour that
            is INTRUDING. Above the band the moss rises into the paper; below it
            the same shape is flipped so the moss dips back down. Filling with
            paper instead would paint paper onto a paper body and show nothing. */}
        <WaveEdge color="var(--color-moss)" />
        <LayerStack />
        <WaveEdge color="var(--color-moss)" flip />

        <ProductRange />
        <SizeFinder />

        {/* BRAND STORY */}
        <section id="story" className="px-safe relative overflow-hidden bg-paper py-section-lg">
          <Parallax
            factor={0.2}
            className="absolute top-[10%] right-[6%] size-[clamp(80px,12vw,150px)] rounded-full bg-moss-tint opacity-60"
            aria-hidden
          />
          <div className="relative z-2 mx-auto grid w-full max-w-[var(--page-max)] grid-cols-1 items-center gap-block md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <Reveal className="relative">
              {/*
               * SQUARE, and no parallax overscan — both deliberate.
               *
               * Every /assets/features creative is 1500x1500 with its headline
               * set INTO the artwork ("Softness — That Runs Alongside Every
               * Adventure"). This box was aspect-5/6 wrapped in a drift layer
               * of h-[118%], which makes the effective frame 0.706 against a
               * 1:1 source: object-cover then scaled to height and threw away
               * ~21% off EACH side, cutting the headline in half. The crop
               * looked deliberate, so nothing about it read as broken.
               *
               * A drift needs overscan to avoid exposing an edge, and overscan
               * on a text-bearing image means cropping words. The image is
               * square and whole; the section still moves via the blob and the
               * 4.9-star card, which carry no copy and can be cropped freely.
               */}
              <div className="relative aspect-square w-full max-w-[560px] overflow-hidden rounded-media shadow-hero">
                <Image
                  src={FEATURE_IMAGES.softness.src}
                  alt={FEATURE_IMAGES.softness.alt}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 92vw, 560px"
                  className="object-cover"
                />
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
              <p className="m-0 mb-4.5 max-w-[62ch] text-body leading-[1.65] text-muted md:max-w-none">
                There is a particular kind of silence parents recognise. The room is finally quiet. Your baby has
                fallen asleep after a long day of feeding, playing, crawling and being carried from one loving pair of
                arms to another. And then you check the diaper.
              </p>
              <p className="m-0 mb-7 max-w-[62ch] text-body leading-[1.65] text-muted md:max-w-none">
                Those small questions are part of everyday parenting, and they are part of what shapes Lumi9 by Femi9 —
                soft everyday comfort, moisture-management technology, breathable materials and flexible protection in
                baby diapers made to support babies as they grow.
              </p>
              <Link href="/about" className="inline-flex items-center coarse:min-h-11 text-[15px] font-semibold text-moss-deep hover:text-midnight">
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
          <div className="relative z-2 mx-auto max-w-[var(--page-max)]">
            <Reveal className="mx-auto mb-[clamp(36px,5.5vw,66px)] max-w-[680px] text-center">
              <SectionHeading eyebrow="The Lumi9 difference">
                Designed for every <Em>little</Em> milestone.
              </SectionHeading>
            </Reveal>
            <div className="grid grid-cols-1 gap-[clamp(14px,2vw,24px)] sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_TILES.map((image) => (
                <Reveal key={image.src} className="overflow-hidden rounded-card shadow-lift">
                  {/* 1500x1500 is the real file size. It was declared 900x1200,
                      so the box reserved 3:4 and then collapsed to the square
                      the source actually is once it loaded - a layout shift on
                      every one of the six, and a wall that assembled itself
                      crookedly while you watched it. */}
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={1500}
                    height={1500}
                    sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 380px"
                    className="block h-auto w-full"
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FROM THE JOURNAL — three posts where the values bento stood.
            Those five cards restated claims the hero, the feature strip and the
            PDP accordion already make, and linked nowhere; see
            components/home/FeaturedJournal.tsx. */}
        <FeaturedJournal />

        {/* TESTIMONIALS — eight short reviews in a dense grid rather than three
            long quote cards; see components/home/Testimonials.tsx for why. */}
        <Testimonials />

        {/* SUBSCRIPTION CTA */}
        <section id="subscribe" className="px-safe py-[clamp(28px,4vw,48px)]">
          <Reveal className="relative mx-auto max-w-[var(--page-max)] overflow-hidden rounded-panel bg-midnight px-[clamp(22px,4vw,60px)] py-[clamp(40px,6vw,72px)]">
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
                <Link href="/subscription" className="btn btn-cream max-[520px]:w-full">
                  Start my box — save 20%
                </Link>
                <Link
                  href="#tech"
                  className="btn border-butter/35 text-butter hover:border-butter hover:text-butter max-[520px]:w-full"
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
