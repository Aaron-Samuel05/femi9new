import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { BRAND, LEGAL_SECTIONS, LEGAL_UPDATED } from "@/lib/content";
import { canonical } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy & Terms",
  description: "How Lumi9 collects, uses and protects your data, plus our terms of sale.",
  alternates: canonical("/privacy"),
};

export default function PrivacyPage() {
  return (
    <PageShell links={NAV_LINKS}>
      <header className="px-safe mx-auto max-w-[900px] pt-[clamp(40px,6vw,70px)] pb-7.5">
        <div className="eyebrow mb-3.5">Legal</div>
        <h1 className="m-0 mb-2.5 font-display text-[clamp(28px,7.4vw,56px)] md:text-[clamp(34px,4.4vw,56px)] font-normal">Privacy &amp; Terms</h1>
        <p className="m-0 text-base text-muted">{LEGAL_UPDATED}</p>
      </header>

      <section className="px-safe mx-auto grid max-w-[900px] grid-cols-1 items-start gap-block pt-5 pb-section md:grid-cols-[minmax(160px,220px)_1fr]">
        <nav aria-label="On this page" className="scroll-row gap-x-4 gap-y-2.5 max-md:-mx-[var(--spacing-gutter)] max-md:px-[var(--spacing-gutter)] max-md:pb-2 md:sticky md:top-24 md:flex-col">
          {LEGAL_SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="inline-flex items-center coarse:min-h-11 text-sm whitespace-nowrap text-muted hover:text-midnight">
              {section.title}
            </a>
          ))}
        </nav>

        <div>
          {LEGAL_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="mb-[clamp(28px,4vw,40px)]">
              <h2 className="m-0 mb-3.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal tracking-[-0.01em]">{section.title}</h2>
              <p className="m-0 text-[clamp(14px,1.4vw,16px)] leading-[1.75] text-muted">{section.body}</p>
            </section>
          ))}

          <div className="rounded-card bg-butter px-[clamp(18px,2.6vw,32px)] py-[clamp(20px,2.4vw,28px)]">
            <p className="m-0 text-[15px] leading-[1.6] text-midnight">
              Questions about your data? Email{" "}
              <Link href="/contact" className="font-bold text-moss-deep">
                {BRAND.email}
              </Link>{" "}
              and our team will respond within 48 hours.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
