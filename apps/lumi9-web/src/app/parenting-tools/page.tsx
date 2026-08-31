import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { BabyProfileCard } from "@/components/tools/BabyProfileCard";
import { ParentingDashboard } from "@/components/tools/ParentingDashboard";
import { ToolCard, type ToolIcon } from "@/components/tools/ToolCard";
import { Reveal } from "@/components/motion/Reveal";
import { absoluteUrl, breadcrumbSchema, canonical, jsonLd, SITE_NAME } from "@/lib/seo";

const TITLE = "Parenting Tools | Diaper Planner, Growth & Vaccination Chart | Lumi9";
const DESCRIPTION =
  "Free parenting tools for Indian families: work out how many diapers you need and what they cost, when your baby sizes up, WHO growth percentiles, and the full vaccination schedule — from your baby's date of birth.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby growth percentile calculator",
    "how many diapers per day",
    "diaper cost calculator india",
    "when to change diaper size",
    "baby vaccination schedule india",
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

const TOOLS: { href: string; title: string; blurb: string; icon: ToolIcon }[] = [
  {
    href: "/parenting-tools/diaper-planner",
    title: "How many will you need?",
    blurb: "Diapers per day, the right pack, and what a month roughly costs.",
    icon: "planner",
  },
  {
    href: "/parenting-tools/size-up",
    title: "When will they size up?",
    blurb: "From your baby's weight, an estimate of when the next size fits.",
    icon: "sizeup",
  },
  {
    href: "/parenting-tools/growth",
    title: "Growth percentiles",
    blurb: "Where your baby sits on the WHO weight and height charts.",
    icon: "growth",
  },
  {
    href: "/parenting-tools/vaccination",
    title: "Vaccination schedule",
    blurb: "Every dose on the government schedule, dated from the birthday.",
    icon: "vaccine",
  },
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
          A few small tools for the nappy years. Tell us about your baby once and every tool just
          works — the details stay on your device. Add an email and we&apos;ll send a care &amp;
          vaccination plan too.
        </p>
      </header>

      <div className="px-safe gap-block mx-auto flex max-w-[900px] flex-col pb-section">
        <Reveal>
          <BabyProfileCard />
        </Reveal>

        <Reveal>
          <ParentingDashboard />
        </Reveal>

        <Reveal>
          <div>
            <h2 className="m-0 mb-4 font-display text-[clamp(20px,2.6vw,28px)] font-normal leading-tight">
              Your toolkit
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {TOOLS.map((tool) => (
                <ToolCard key={tool.href} {...tool} />
              ))}
            </div>
            <p className="mt-4 text-sm text-muted">More tools are on the way.</p>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
