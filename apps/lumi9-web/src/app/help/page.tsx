import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { HelpTopics } from "@/components/help/HelpTopics";

export const metadata: Metadata = {
  title: "Help centre",
  description: "Everything about sizing, subscriptions, shipping and safety.",
};

const HELP_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

export default function HelpPage() {
  return (
    <PageShell links={HELP_LINKS} cta="shop">
      <header className="px-safe mx-auto max-w-[720px] pt-[clamp(44px,6vw,80px)] pb-10 text-center">
        <div className="eyebrow mb-4">Help centre</div>
        <h1 className="m-0 mb-3.5 font-display text-[clamp(29px,7.8vw,60px)] md:text-[clamp(34px,4.6vw,60px)] font-normal leading-[1.02]">
          Questions, answered.
        </h1>
        <p className="m-0 text-body text-muted">Everything about sizing, subscriptions, shipping and safety.</p>
      </header>

      <HelpTopics />

      <section className="px-safe mx-auto max-w-[820px] pb-section">
        <div className="rounded-card bg-butter p-card-lg text-center">
          <h2 className="m-0 mb-2.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal">Still need a hand?</h2>
          <p className="m-0 mb-5.5 text-[clamp(14px,1.4vw,16px)] text-midnight opacity-80">
            Our care team replies within a few hours, every day.
          </p>
          <Link href="/contact" className="btn btn-dark font-bold">
            Contact us
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
