import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { BabyProfileCard } from "@/components/tools/BabyProfileCard";
import { DiaperPlanner } from "@/components/tools/DiaperPlanner";
import { GrowthPercentile } from "@/components/tools/GrowthPercentile";
import { ImmunisationSchedule } from "@/components/tools/ImmunisationSchedule";
import { SizeUpPredictor } from "@/components/tools/SizeUpPredictor";
import { Reveal } from "@/components/motion/Reveal";
import { absoluteUrl, breadcrumbSchema, canonical, jsonLd, SITE_NAME } from "@/lib/seo";

const TITLE = "Parenting Tools | Diaper Planner, Growth & Vaccination Chart | Lumi9";
const DESCRIPTION =
  "Free parenting tools for Indian families: work out how many diapers you need and what they cost, when your baby sizes up, and WHO growth percentiles — from your baby's date of birth.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby growth percentile calculator",
    "how many diapers per day",
    "diaper cost calculator india",
    "when to change diaper size",
    "baby weight percentile",
  ],
  alternates: canonical("/parenting-tools"),
  openGraph: {
    type: "website",
    url: absoluteUrl("/parenting-tools"),
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
};

const TOOLS = [
  { href: "#planner", label: "How many will you need?" },
  { href: "#size-up", label: "When will they size up?" },
  { href: "#growth", label: "Growth percentiles" },
  { href: "#immunisation", label: "Vaccination schedule" },
];

export default function ParentingToolsPage() {
  return (
    <PageShell links={NAV_LINKS}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Parenting tools", path: "/parenting-tools" },
          ]),
        )}
      />

      <header className="px-safe mx-auto max-w-[720px] pt-[clamp(44px,6vw,80px)] pb-8 text-center">
        <h1 className="m-0 mb-3.5 font-display text-[clamp(29px,7.8vw,60px)] font-normal leading-[1.02] md:text-[clamp(34px,4.6vw,60px)]">
          Parenting tools
        </h1>
        <p className="m-0 text-lead text-muted">
          A few small tools for the nappy years. Fill in your baby once and they all just work —
          everything stays on your device.
        </p>
        <nav className="mt-6 flex flex-wrap justify-center gap-2" aria-label="Tools on this page">
          {TOOLS.map((tool) => (
            <a
              key={tool.href}
              href={tool.href}
              className="inline-flex items-center rounded-pill border border-moss-tint px-4 py-2 text-sm font-semibold text-moss-deep coarse:min-h-11"
            >
              {tool.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="px-safe gap-block mx-auto flex max-w-[900px] flex-col pb-section">
        <Reveal>
          <BabyProfileCard />
        </Reveal>
        <Reveal>
          <DiaperPlanner />
        </Reveal>
        <Reveal>
          <SizeUpPredictor />
        </Reveal>
        <Reveal>
          <GrowthPercentile />
        </Reveal>
        <Reveal>
          <ImmunisationSchedule />
        </Reveal>
      </div>
    </PageShell>
  );
}
