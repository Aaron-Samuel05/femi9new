import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { Parallax } from "@/components/motion/Parallax";
import { BoxBuilder } from "@/components/subscription/BoxBuilder";
import { Em } from "@/components/ui/bits";
import { Icon } from "@/components/ui/Icon";
import { FEATURE_IMAGES, SUBSCRIPTION_BENEFITS, SUBSCRIPTION_STEPS } from "@/lib/content";
import { absoluteUrl, canonical, SITE_NAME } from "@/lib/seo";

const TITLE = "Baby Diaper Subscription | Monthly Diaper Delivery | Lumi9";
const DESCRIPTION =
  "Never run out of baby diapers again. Set up recurring Lumi9 diaper delivery, move from NB through XL as your baby grows, and manage or skip upcoming boxes.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby diaper subscription", "monthly baby diaper delivery", "baby diapers online",
    "baby diaper pants combo pack", "jumbo pack diapers", "Lumi9 baby diapers",
  ],
  alternates: canonical("/subscription"),
  openGraph: { type: "website", url: absoluteUrl("/subscription"), siteName: SITE_NAME, title: TITLE, description: DESCRIPTION },
};

const SUBSCRIPTION_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

export default function SubscriptionPage() {
  return (
    <PageShell links={SUBSCRIPTION_LINKS} cta="shop">
      {/* HERO */}
      <header
        className="px-safe relative overflow-hidden pt-[clamp(48px,7vw,96px)] pb-[clamp(44px,6vw,80px)]"
        style={{ background: "radial-gradient(120% 90% at 80% 10%, #eef1e0 0%, #f7f5ea 60%)" }}
      >
        <Parallax
          factor={0.22}
          pointerScale={40}
          className="absolute top-[20%] left-[8%] size-[clamp(70px,10vw,120px)] rounded-full bg-butter opacity-50"
          aria-hidden
        />
        <div className="relative z-2 mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-block md:grid-cols-[1.1fr_1fr]">
          <div>
            <div className="eyebrow mb-4.5">The Lumi9 subscription</div>
            <h1 className="m-0 mb-5.5 font-display text-[clamp(32px,8.6vw,72px)] md:text-[clamp(38px,5vw,72px)] font-normal leading-none">
              Never run out at <Em>2am</Em> again.
            </h1>
            <p className="m-0 mb-8 max-w-[50ch] text-lead leading-[1.6] text-muted">
              A monthly box that grows with your baby. Auto size-up, save 20%, skip or cancel anytime.
            </p>
            <Link href="#build" className="btn btn-dark font-bold">
              Build my box
            </Link>
          </div>
          <Parallax
            factor={0.08}
            pointerScale={40}
            className="relative aspect-4/3 overflow-hidden rounded-media bg-shell shadow-deep sm:aspect-square"
          >
            <Image
              src={FEATURE_IMAGES.happinessWrapped.src}
              alt="Lumi9 subscription box"
              fill
              priority
              sizes="(max-width: 768px) 92vw, 520px"
              className="object-cover"
            />
          </Parallax>
        </div>
      </header>

      {/* HOW IT WORKS */}
      <section className="px-safe py-section">
        <div className="mx-auto max-w-[1180px]">
          <h2 className="m-0 mb-[clamp(32px,4.6vw,56px)] text-center font-display text-[clamp(26px,7vw,50px)] font-normal md:text-[clamp(30px,4vw,50px)]">
            How it works
          </h2>
          <div className="grid grid-cols-1 gap-[clamp(16px,2vw,24px)] sm:grid-cols-3">
            {SUBSCRIPTION_STEPS.map((step) => (
              <div key={step.n} className="p-5 text-center">
                <div className="mx-auto mb-5 flex size-[clamp(52px,5vw,64px)] items-center justify-center rounded-full bg-moss-tint font-display text-[clamp(21px,2.4vw,26px)] text-moss-deep">
                  {step.n}
                </div>
                <h3 className="m-0 mb-2.5 text-[clamp(17px,1.8vw,20px)] font-bold">{step.title}</h3>
                <p className="mx-auto m-0 max-w-[34ch] text-[clamp(14px,1.3vw,15px)] leading-[1.6] text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <BoxBuilder />

      {/* BENEFITS */}
      <section className="px-safe pb-section">
        <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-[clamp(12px,1.6vw,20px)] min-[420px]:grid-cols-2 lg:grid-cols-4">
          {SUBSCRIPTION_BENEFITS.map((benefit) => (
            <div key={benefit.title} className="rounded-card border border-moss-tint bg-canvas p-card text-center">
              <div className="mx-auto mb-4.5 flex size-13 items-center justify-center rounded-[14px] bg-moss-tint text-moss-deep">
                <Icon name={benefit.icon} size={24} strokeWidth={1.7} />
              </div>
              <h3 className="m-0 mb-2 text-[clamp(15px,1.4vw,16px)] font-bold">{benefit.title}</h3>
              <p className="m-0 text-[clamp(13px,1.2vw,14px)] leading-[1.55] text-muted">{benefit.body}</p>
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
