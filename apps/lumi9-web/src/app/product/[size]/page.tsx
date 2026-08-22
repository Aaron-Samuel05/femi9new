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
import { SIZES, getSize, inr } from "@/lib/catalog";

const FEATURE_BAND = [
  { image: FEATURE_IMAGES.wetnessLock, factor: 0.06, offset: false },
  { image: FEATURE_IMAGES.softness, factor: 0.16, offset: true },
  { image: FEATURE_IMAGES.softAsCotton, factor: 0.1, offset: false },
];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: size.size.toLowerCase() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ size: string }>;
}): Promise<Metadata> {
  const { size: slug } = await params;
  const size = getSize(slug);
  if (!size) return { title: "Product not found" };

  return {
    title: `Cloud Soft Diaper Pants — ${size.name}`,
    description: `Ultra-soft, chemical-free Cloud Soft pants for ${size.fits}. 5-layer protection, up to 12 hours of dryness. From ${inr(
      Math.min(...size.packs.map((pack) => pack.price)),
    )}.`,
  };
}

export default async function ProductPage({ params }: { params: Promise<{ size: string }> }) {
  const { size: slug } = await params;
  const size = getSize(slug);
  if (!size) notFound();

  return (
    <PageShell links={HOME_LINKS} cta="cart">
      <section className="px-safe mx-auto max-w-[1240px] pt-8.5 pb-section">
        <nav aria-label="Breadcrumb" className="mb-6.5 text-[clamp(12px,1.1vw,13px)] text-muted">
          <Link href="/" className="text-muted hover:text-midnight">
            Home
          </Link>
          <span className="px-2">/</span>
          <Link href="/shop" className="text-muted hover:text-midnight">
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
