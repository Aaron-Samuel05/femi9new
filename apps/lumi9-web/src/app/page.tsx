import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Nav, NAV_LINKS } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { LayerStack } from "@/components/home/LayerStack";
import { ProductRange } from "@/components/home/ProductRange";
import { SizeFinder } from "@/components/home/SizeFinder";
import { WhyLumi9 } from "@/components/home/WhyLumi9";
import { HeroStage } from "@/components/home/HeroStage";
import { FeatureStrip } from "@/components/home/FeatureStrip";
import { Testimonials } from "@/components/home/Testimonials";
import { Moments } from "@/components/home/Moments";
import { FeaturedJournal } from "@/components/home/FeaturedJournal";
import { Scallop, WaveEdge } from "@/components/ui/Scallop";
import { Em, SectionHeading } from "@/components/ui/bits";
import { FEATURE_IMAGES, MARQUEE_ITEMS } from "@/lib/content";
import { loadCatalog } from "@/lib/catalog.server";
import { MASCOT_URL } from "@/lib/mascot";
import { absoluteUrl, canonical, jsonLd, SITE_URL, og } from "@/lib/seo";

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
  openGraph: og({ type: "website", url: SITE_URL, title: HOME_TITLE, description: HOME_DESCRIPTION }),
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION },
};

/**
 * The size run as an ItemList.
 *
 * Read from the DATABASE, like everything else the console owns.
 *
 * It used to be built from the `SIZES` array in `@/lib/catalog` - the seed's
 * input - on the argument that a navigational hint must not make the homepage
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
      name: `Lumi9 Cloud Soft ${size.name} baby diapers - ${size.fits}`,
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
  // `subscribeSavePct` rides along on the payload this page already loads, so
  // the CTA quotes the console's discount at no extra cost. It used to read
  // "save 20%" from a literal while a renewal was discounted by the console's
  // 15 - the same disagreement /subscription had in its hero.
  const { sizes, subscribeSavePct } = await loadCatalog();
  return (
    <>
      {/* useGLTF can only request the model after the bundle loads and hydrates -
          about a second of dead time. Preloading starts it and its decoder while
          the JS is still downloading. The URL comes from the shared constant, not
          a literal: it carries a cache-busting version suffix, and a preload
          pointing at the previous one warms the wrong bytes. */}
      <link rel="preload" href={MASCOT_URL} as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/draco/draco_wasm_wrapper.js" as="fetch" crossOrigin="anonymous" />
      <link rel="preload" href="/draco/draco_decoder.wasm" as="fetch" crossOrigin="anonymous" />

      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(sizeListSchema(sizes))} />

      <Nav variant="home" links={NAV_LINKS} />

      <main>
        {/* HERO - three offers behind one centred mascot. See HeroStage. */}
        <HeroStage />

        {/* CLAIM STRIP - what the product is for, before the first scroll */}
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

            Both edges are moss, not paper - the fill has to be the colour that
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
          <div className="relative z-2 mx-auto grid w-full max-w-[var(--page-max)] grid-cols-1 items-center gap-stack md:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
            <Reveal className="relative">
              {/*
               * SQUARE, and no parallax overscan - both deliberate.
               *
               * Every /assets/features creative is 1500x1500 with its headline
               * set INTO the artwork ("Softness - That Runs Alongside Every
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
                Those small questions are part of everyday parenting, and they are part of what shapes Lumi9 by Femi9 -
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
        <section id="features" className="px-safe relative overflow-hidden bg-moss-tint py-[clamp(28px,3.6vw,52px)]">
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
          <div className="relative z-2 mx-auto grid max-w-[var(--page-max)] grid-cols-1 items-center gap-stack lg:grid-cols-[minmax(260px,1fr)_auto]">
            <Reveal className="mx-auto mb-[clamp(16px,2.2vw,30px)] max-w-[680px] text-center lg:mx-0 lg:mb-0 lg:text-left">
              <SectionHeading eyebrow="The Lumi9 difference">
                Designed for every <Em>little</Em> milestone.
              </SectionHeading>
            </Reveal>
            {/*
                Three across, two rows, sized from the VIEWPORT HEIGHT - and
                the heading sits BESIDE it rather than above.
                The creatives are 1:1 and must not be cropped, since the
                headline is baked into the artwork, so two rows of squares are
                as tall as two thirds of the grid is wide. Sized from the width
                the band ran 1312px against a ~720px viewport. Sized from the
                height with the heading still stacked on top, the heading ate
                ~200px of the budget and the tiles fell to 203px, stranding
                ~440px of margin each side.
                Moving the heading into its own column hands the whole height to
                the grid: the tiles come back up and the row spans the page
                again. Above roughly a 1030px-tall viewport this stops binding
                and --page-max takes over.
                --nav-h is in the budget because the nav is FIXED: it floats over
                the top of whatever is scrolled under it, so the screen a
                reader actually has is 100svh minus the bar. Two rows means a
                pixel off the tile costs two off the section, hence the 1.5x.
                Scoped to lg because that is where the two-column layout lives.
                Unscoped, a landscape phone (844x390) resolves the calc to
                ~241px and shrinks the wall to a ribbon on a wide screen. */}
              <div className="mx-auto grid w-full lg:max-w-[min(var(--page-max),calc(150svh_-_1.5_*_var(--nav-h,68px)_-_176px))] grid-cols-1 gap-[clamp(10px,1.4vw,20px)] sm:grid-cols-2 lg:grid-cols-3">
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
                    sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 500px"
                    className="block h-auto w-full"
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FROM THE JOURNAL - three posts where the values bento stood.
            Those five cards restated claims the hero, the feature strip and the
            PDP accordion already make, and linked nowhere; see
            components/home/FeaturedJournal.tsx. */}
        <FeaturedJournal />

        {/* MOMENTS - the brand's own Instagram clips and stills, on Femi9's
            centre-focused video rail. Directly under the journal on purpose:
            the two sections are the page's only unhurried stretch, and a reader
            who has just been offered three articles is the one most likely to
            keep watching. See components/home/Moments.tsx. */}
        <Moments />

        {/* TESTIMONIALS - eight short reviews in a dense grid rather than three
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
                  Start my box - save {subscribeSavePct}%
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
