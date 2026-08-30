import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/site/PageShell";
import { HOME_LINKS } from "@/components/site/Nav";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { Em, QuoteCard, SectionHeading } from "@/components/ui/bits";
import { ProductBuyBox } from "@/components/pdp/ProductBuyBox";
import { FEATURE_IMAGES, PDP_REVIEWS } from "@/lib/content";
import { inr, packImage, type SizeCode } from "@/lib/catalog";
import { absoluteUrl, breadcrumbSchema, canonical, jsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";
import { loadCatalog } from "@/lib/catalog.server";

const FEATURE_BAND = [
  { image: FEATURE_IMAGES.wetnessLock, factor: 0.06, offset: false },
  { image: FEATURE_IMAGES.softness, factor: 0.16, offset: true },
  { image: FEATURE_IMAGES.softAsCotton, factor: 0.1, offset: false },
];

/**
 * No build-time prerendering: which sizes exist is a database question, and the
 * build has no database. Pages render on demand instead, so a size added in the
 * console is live immediately rather than on the next deploy.
 */

/** One size by its URL segment, case-insensitively. */
async function findSize(slug: string) {
  const { sizes } = await loadCatalog();
  return sizes.find((entry) => entry.size === slug.toUpperCase());
}

/**
 * Per-size titles and keyword sets, allocated from the keyword research rather
 * than repeated across every page. Each size page owns its own weight-range and
 * size-code terms; putting the whole 179-phrase set on all five would have them
 * competing with each other for the same queries.
 *
 * Keyed by SizeCode and looked up with a fallback, so a size added in the
 * console still renders — it simply falls back to generic copy until its terms
 * are added here.
 */
const SEO_TITLES: Partial<Record<SizeCode, string>> = {
  NB: "Newborn Baby Diapers | NB Tape Diapers Up to 5 kg",
  S: "Small Baby Diaper Pants | S Size Diapers 4–8 kg",
  M: "Medium Baby Diaper Pants | M Size Diapers 7–12 kg",
  L: "Large Baby Diaper Pants | L Size Diapers 9–14 kg",
  XL: "XL Baby Diaper Pants | Extra Large Diapers 12–17 kg",
};

const SEO_KEYWORDS: Partial<Record<SizeCode, string[]>> = {
  NB: [
    "newborn diapers", "newborn baby diapers", "NB diapers", "diapers for newborn baby",
    "newborn tape diapers", "best diapers for newborn baby India", "diapers for babies up to 5 kg",
    "soft baby diapers for newborns", "newborn diaper size", "leak proof newborn diapers",
    "breathable newborn diapers", "diapers for 0 to 3 months baby",
  ],
  S: [
    "small size baby diapers", "S size baby diapers", "baby diaper pants small size",
    "diapers for 4-8 kg baby", "soft flexible baby diaper pants",
    "breathable baby diapers for 4-8 kg babies", "diapers for growing baby",
  ],
  M: [
    "medium size baby diapers", "M size baby diapers", "baby diaper pants medium size",
    "diapers for 7-12 kg baby", "best medium size diapers for active babies",
    "diapers for crawling baby", "soft breathable diaper pants for babies",
    "baby diaper pants with leak protection",
  ],
  L: [
    "large size baby diapers", "L size baby diapers", "baby diaper pants large size",
    "diapers for 9-14 kg baby", "baby diapers with wetness indicator",
    "large size diapers for active babies", "diapers for walking baby",
  ],
  XL: [
    "XL size baby diapers", "extra large baby diapers", "XL baby diaper pants",
    "diapers for 12-17 kg baby", "diapers for active toddler",
    "baby diapers with double leakage barrier", "XL baby diaper pants with 360 protection",
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ size: string }>;
}): Promise<Metadata> {
  const { size: slug } = await params;
  const size = await findSize(slug);
  if (!size) return { title: "Product not found" };

  const from = inr(Math.min(...size.packs.map((pack) => pack.price)));
  const title = SEO_TITLES[size.size] ?? `Cloud Soft Baby Diapers — ${size.name} | ${size.fits}`;
  const description = `Lumi9 Cloud Soft ${size.name.toLowerCase()} baby diapers for ${size.fits} — soft cotton-like top sheet, Advanced SAP Core, breathable backsheet, Double Leakage Barrier, 360° protection and a wetness indicator. From ${from}.`;

  return {
    title: { absolute: `${title} | Lumi9` },
    description,
    keywords: SEO_KEYWORDS[size.size] ?? ["baby diapers", "baby diaper pants"],
    alternates: canonical(`/product/${size.size.toLowerCase()}`),
    openGraph: {
      type: "website",
      url: absoluteUrl(`/product/${size.size.toLowerCase()}`),
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: absoluteUrl(packImage(size.size, size.packs[0].count)), alt: `Lumi9 Cloud Soft ${size.name} baby diapers, ${size.fits}` }],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ size: string }> }) {
  const { size: slug } = await params;
  const size = await findSize(slug);
  if (!size) notFound();

  const path = `/product/${size.size.toLowerCase()}`;
  const prices = size.packs.map((pack) => pack.price);

  /**
   * One Product with an AggregateOffer over the pack tiers, rather than one
   * Product per tier. A shopper searching "M size baby diapers" is looking for
   * the diaper, not the 24-count SKU, and five near-identical Product nodes
   * pointing at the same URL read as duplicates to a validator.
   *
   * `availability` follows real stock: claiming InStock for a tier nobody can
   * buy is the kind of mismatch that gets merchant results suppressed.
   */
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${absoluteUrl(path)}#product`,
    name: `Lumi9 Cloud Soft Baby ${size.size === "NB" ? "Diapers" : "Diaper Pants"} — ${size.name}`,
    description: `Lumi9 Cloud Soft baby diapers for ${size.fits}. Aloe Vera-infused cotton-like top sheet, Advanced SAP Core, ADL layer, breathable backsheet, Double Leakage Barrier, 360° protection, soft stretch waistband and a wetness indicator.`,
    sku: `LUMI9-${size.size}`,
    url: absoluteUrl(path),
    image: size.packs.map((pack) => absoluteUrl(packImage(size.size, pack.count))),
    brand: { "@type": "Brand", name: "Lumi9" },
    manufacturer: { "@id": `${SITE_URL}/#organization` },
    category: "Baby & Toddler > Diapering > Baby Diapers",
    audience: { "@type": "PeopleAudience", suggestedMinAge: 0, name: `Babies ${size.fits}` },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Weight range", value: size.fits },
      { "@type": "PropertyValue", name: "Size", value: size.size },
      { "@type": "PropertyValue", name: "Style", value: size.size === "NB" ? "Tape diaper" : "Pant style" },
    ],
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: size.packs.length,
      availability: size.packs.some((pack) => pack.stock > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      url: absoluteUrl(path),
      seller: { "@id": `${SITE_URL}/#organization` },
    },
  };

  return (
    <PageShell links={HOME_LINKS}>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(productSchema)} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Shop", path: "/shop" },
            { name: `Cloud Soft — ${size.name}`, path },
          ]),
        )}
      />
      <section className="px-safe mx-auto max-w-[1240px] pt-8.5 pb-section">
        <nav aria-label="Breadcrumb" className="mb-6.5 text-[clamp(12px,1.1vw,13px)] text-muted">
          <Link href="/" className="inline-flex items-center text-muted coarse:min-h-11 hover:text-midnight">
            Home
          </Link>
          <span className="px-2">/</span>
          <Link href="/shop" className="inline-flex items-center text-muted coarse:min-h-11 hover:text-midnight">
            Shop
          </Link>
          <span className="px-2">/</span>
          <span className="text-midnight">Cloud Soft — {size.name}</span>
        </nav>

        <ProductBuyBox size={size} />
      </section>

      {/* FEATURE BAND */}
      <section className="px-safe relative overflow-hidden bg-moss-tint py-section">
        <Parallax
          factor={0.14}
          pointerScale={40}
          className="absolute top-[12%] -left-7.5 size-[clamp(100px,14vw,180px)] rounded-full bg-butter/50"
          aria-hidden
        />
        <div className="relative z-2 mx-auto max-w-[1240px]">
          <Reveal className="mx-auto mb-[clamp(32px,5vw,60px)] max-w-[640px] text-center">
            <SectionHeading eyebrow="Why it works" size="sm">
              Comfort, engineered in <Em>layers.</Em>
            </SectionHeading>
          </Reveal>
          <div className="grid grid-cols-1 items-start gap-[clamp(14px,2vw,24px)] sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_BAND.map(({ image, factor, offset }) => (
              <Parallax key={image.src} factor={factor} pointerScale={40} className={offset ? "lg:mt-12" : ""}>
                <Reveal className="overflow-hidden rounded-card shadow-lift">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    width={900}
                    height={1200}
                    sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 380px"
                    className="block h-auto w-full"
                  />
                </Reveal>
              </Parallax>
            ))}
          </div>
        </div>
      </section>

      {/* SIZE CHART */}
      <section className="px-safe bg-paper py-section">
        <div className="mx-auto max-w-[900px] text-center">
          <Reveal className="eyebrow mb-4">Find the right fit</Reveal>
          <Reveal as="h2" className="m-0 mb-[clamp(24px,4vw,40px)] font-display text-[clamp(26px,7vw,48px)] font-normal md:text-[clamp(30px,4vw,48px)]">
            A size for every stage
          </Reveal>
          <Reveal className="overflow-hidden rounded-media shadow-hero">
            <Image
              src={FEATURE_IMAGES.perfectFit.src}
              alt={FEATURE_IMAGES.perfectFit.alt}
              width={1600}
              height={1000}
              sizes="(max-width: 900px) 92vw, 900px"
              className="block h-auto w-full"
            />
          </Reveal>
        </div>
      </section>

      {/* REVIEWS */}
      <section className="px-safe bg-canvas py-section">
        <div className="mx-auto max-w-[1180px]">
          <Reveal className="eyebrow mb-[clamp(26px,4vw,44px)] text-center">Loved by 40,000+ families</Reveal>
          <div className="grid grid-cols-1 gap-[clamp(14px,1.8vw,22px)] sm:grid-cols-2 lg:grid-cols-3">
            {PDP_REVIEWS.map((review) => (
              <Reveal key={review.name}>
                <QuoteCard {...review} surface="bg-paper" quoteSize="text-[clamp(16px,1.5vw,19px)]" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
