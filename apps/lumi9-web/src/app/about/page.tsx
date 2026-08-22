import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { Em, NumberedCard } from "@/components/ui/bits";
import { ABOUT_STATS, ABOUT_VALUES, FEATURE_IMAGES } from "@/lib/content";

export const metadata: Metadata = {
  title: "Our story",
  description:
    "Lumi9 began with a simple refusal: parents shouldn't have to choose between diapers that are affordable and diapers that are safe.",
};

const ABOUT_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

export default function AboutPage() {
  return (
    <PageShell links={ABOUT_LINKS} cta="shop">
      <header
        className="px-safe relative overflow-hidden pt-[clamp(56px,8vw,110px)] pb-[clamp(44px,6vw,80px)] text-center"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, #eef1e0 0%, #f7f5ea 60%)" }}
      >
        <Parallax
          factor={0.22}
          pointerScale={40}
          className="absolute top-[18%] left-[10%] size-[clamp(64px,10vw,110px)] rounded-full bg-butter opacity-50"
          aria-hidden
        />
        <Parallax
          factor={0.3}
          pointerScale={40}
          className="absolute top-[26%] right-[12%] size-[clamp(40px,6vw,64px)] rounded-full bg-moss-soft opacity-40"
          aria-hidden
        />
        <div className="relative z-2 mx-auto max-w-[760px]">
          <div className="eyebrow mb-4.5">Our story</div>
          <h1 className="m-0 mb-5.5 font-display text-[clamp(31px,8.4vw,74px)] md:text-[clamp(38px,5.4vw,74px)] font-normal leading-[1.02]">
            Safe shouldn&apos;t cost <Em>a fortune.</Em>
          </h1>
          <p className="mx-auto m-0 max-w-[58ch] text-lead leading-[1.6] text-muted">
            Lumi9 began with a simple refusal: parents shouldn&apos;t have to choose between diapers that are affordable
            and diapers that are safe.
          </p>
        </div>
      </header>

      <section className="px-safe pt-5 pb-section">
        {/* the handoff's 16/8 crop slices this artwork's headline on a phone, so the
            frame steps up towards it as the viewport widens */}
        <Reveal className="relative mx-auto aspect-4/3 max-w-[1100px] overflow-hidden rounded-panel bg-shell shadow-deep sm:aspect-16/9 lg:aspect-16/8">
          <Image
            src={FEATURE_IMAGES.happinessWrapped.src}
            alt="A Lumi9 family"
            fill
            priority
            sizes="(max-width: 1100px) 94vw, 1100px"
            className="object-cover"
          />
        </Reveal>
      </section>

      <section className="px-safe pb-section">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6.5">
          <Reveal as="p" className="m-0 font-display text-[clamp(19px,2.4vw,30px)] leading-[1.4] text-midnight">
            Most diapers in India ask families to pick: cheap but full of questionable chemicals, or clean but priced out
            of reach.
          </Reveal>
          <Reveal as="p" className="m-0 text-body leading-[1.7] text-muted">
            We spent months testing samples, reading ingredient lists, and talking to parents and paediatricians. The
            goal was one honest product — soft, breathable, free from harsh chemicals — at a price that works for
            everyday families.
          </Reveal>
          <Reveal as="p" className="m-0 text-body leading-[1.7] text-muted">
            That product is Cloud Soft: a 5-layer system with an aloe-infused cotton top sheet, a fast-absorbing SAP
            core, and a breathable, biodegradable backsheet. No lotions. No fragrances. No compromise on either end.
          </Reveal>
        </div>
      </section>

      <section className="px-safe pb-section">
        <div className="mx-auto grid max-w-[1180px] grid-cols-2 gap-[clamp(10px,1.6vw,22px)] lg:grid-cols-4">
          {ABOUT_STATS.map((stat) => (
            <Reveal
              key={stat.label}
              className="rounded-card border border-moss-tint bg-canvas px-4 py-[clamp(24px,3.4vw,38px)] text-center"
            >
              <div className="mb-2.5 font-display text-[clamp(30px,4vw,44px)] leading-none text-moss-deep">{stat.value}</div>
              <div className="text-[clamp(12px,1.2vw,14px)] text-muted">{stat.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-safe pb-section">
        <div className="mx-auto max-w-[1180px]">
          <Reveal as="h2" className="m-0 mb-[clamp(32px,4.6vw,56px)] text-center font-display text-[clamp(26px,6.6vw,46px)] font-normal md:text-[clamp(30px,3.6vw,46px)]">
            What we stand for
          </Reveal>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-moss-tint bg-moss-tint sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            {ABOUT_VALUES.map((value) => (
              <Reveal key={value.n}>
                <NumberedCard n={value.n} title={value.title} body={value.body} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-safe pb-section">
        <Reveal className="mx-auto max-w-[1180px] rounded-panel bg-midnight px-[clamp(20px,4vw,60px)] py-[clamp(44px,6.5vw,72px)] text-center">
          <h2 className="m-0 mb-5 font-display text-[clamp(25px,6.6vw,50px)] font-normal leading-[1.05] text-butter md:text-[clamp(30px,4vw,50px)]">
            Join 40,000+ families who made the switch.
          </h2>
          <Link href="/shop" className="btn btn-cream mt-3">
            Shop Cloud Soft
          </Link>
        </Reveal>
      </section>
    </PageShell>
  );
}
