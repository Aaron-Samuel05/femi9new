import type { Metadata } from "next";
import Image from "next/image";
import { PageShell } from "@/components/site/PageShell";
import { Parallax } from "@/components/motion/Parallax";
import { Reveal } from "@/components/motion/Reveal";
import { JournalGrid } from "@/components/journal/JournalGrid";
import { Em } from "@/components/ui/bits";
import { FEATURED_POST } from "@/lib/content";

export const metadata: Metadata = {
  title: "The Lumi9 Journal",
  description: "Gentle, practical parenting reads — from skin care and sleep to real talk about the newborn fog.",
};

const JOURNAL_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "Technology", href: "/#tech" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

export default function JournalPage() {
  return (
    <PageShell links={JOURNAL_LINKS} cta="shop">
      <header
        className="px-safe relative overflow-hidden pt-[clamp(48px,7vw,96px)] pb-[clamp(36px,5vw,64px)] text-center"
        style={{ background: "radial-gradient(120% 90% at 50% 0%, #eef1e0 0%, #f7f5ea 60%)" }}
      >
        <Parallax
          factor={0.2}
          pointerScale={40}
          className="absolute top-[20%] left-[8%] size-[clamp(70px,10vw,120px)] rounded-full bg-butter opacity-50"
          aria-hidden
        />
        <Parallax
          factor={0.3}
          pointerScale={40}
          className="absolute top-[30%] right-[10%] size-[clamp(42px,6.4vw,70px)] rounded-full bg-moss-soft opacity-40"
          aria-hidden
        />
        <div className="relative z-2 mx-auto max-w-[720px]">
          <div className="eyebrow mb-4.5">The Lumi9 Journal</div>
          <h1 className="m-0 mb-5 font-display text-[clamp(32px,8.4vw,72px)] md:text-[clamp(40px,5.4vw,72px)] font-normal leading-[1.02]">
            Notes for <Em>happy</Em> days.
          </h1>
          <p className="mx-auto m-0 max-w-[54ch] text-lead leading-[1.6] text-muted">
            Gentle, practical parenting reads — from skin care and sleep to real talk about the newborn fog.
          </p>
        </div>
      </header>

      {/* FEATURED */}
      <section className="px-safe pt-10 pb-[clamp(44px,6vw,80px)]">
        <Reveal className="mx-auto grid max-w-[1180px] grid-cols-1 overflow-hidden rounded-media border border-moss-tint bg-canvas shadow-hero md:grid-cols-[1.15fr_1fr]">
          <div className="relative aspect-3/2 overflow-hidden bg-shell md:aspect-16/11">
            <Image
              src={FEATURED_POST.image}
              alt={FEATURED_POST.imageAlt}
              fill
              priority
              sizes="(max-width: 768px) 94vw, 620px"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center p-card-lg">
            <div className="mb-4 text-xs font-bold tracking-[0.14em] text-moss-deep">{FEATURED_POST.kicker}</div>
            <h2 className="m-0 mb-4 font-display text-[clamp(21px,5.4vw,36px)] md:text-[clamp(26px,2.6vw,36px)] font-normal leading-[1.12] text-midnight">
              {FEATURED_POST.title}
            </h2>
            <p className="m-0 mb-6 text-[clamp(14px,1.4vw,16px)] leading-[1.6] text-muted">{FEATURED_POST.excerpt}</p>
            <div className="mb-5.5 text-sm text-muted">{FEATURED_POST.meta}</div>
            <span className="text-[15px] font-bold text-moss-deep">Read the story →</span>
          </div>
        </Reveal>
      </section>

      <JournalGrid />

      {/* NEWSLETTER */}
      <section className="px-safe pt-5 pb-section">
        <Reveal className="mx-auto max-w-[1180px] rounded-panel bg-midnight px-[clamp(20px,4vw,56px)] py-[clamp(40px,6vw,64px)] text-center">
          <div className="eyebrow mb-4 text-gold">Care in your inbox</div>
          <h2 className="m-0 mb-6.5 font-display text-[clamp(23px,6.4vw,44px)] font-normal leading-[1.05] text-butter md:text-[clamp(28px,3.6vw,44px)]">
            One gentle read a week. No spam, ever.
          </h2>
          <form
            className="mx-auto flex max-w-[440px] flex-col gap-2 rounded-panel border-[1.5px] border-butter/35 bg-butter/10 p-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:rounded-pill min-[420px]:pl-6"
            action="/journal"
          >
            <label htmlFor="journal-email" className="sr-only">
              Your email
            </label>
            <input
              id="journal-email"
              type="email"
              required
              placeholder="Your email"
              className="min-h-11 min-w-0 flex-1 border-none bg-transparent px-4 text-[max(16px,1rem)] text-butter placeholder:text-butter/60 outline-none min-[420px]:px-0"
            />
            <button type="submit" className="btn btn-cream shrink-0 text-[15px]">
              Join
            </button>
          </form>
        </Reveal>
      </section>
    </PageShell>
  );
}
