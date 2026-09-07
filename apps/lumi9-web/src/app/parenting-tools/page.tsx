import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { BabyProfileCard } from "@/components/tools/BabyProfileCard";
import { ParentingDashboard } from "@/components/tools/ParentingDashboard";
import { ToolCard, type ToolIcon } from "@/components/tools/ToolCard";
import { Reveal } from "@/components/motion/Reveal";
import { Em, SectionHeading } from "@/components/ui/bits";
import { absoluteUrl, breadcrumbSchema, canonical, jsonLd, og } from "@/lib/seo";

const TITLE = "Parenting Tools | Diaper Planner, Growth & Vaccination Chart | Lumi9";
const DESCRIPTION =
  "Free parenting tools for Indian families: work out how many diapers you need and what they cost, when your baby sizes up, WHO growth percentiles, and the full vaccination schedule - from your baby's date of birth.";

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
  openGraph: og({ type: "website", url: absoluteUrl("/parenting-tools"), title: TITLE, description: DESCRIPTION }),
};

/**
 * `needs` is not a blurb - it is the answer to "why is this page empty?", given
 * before the tap rather than after it. It is also what makes four cards read as
 * four different things.
 */
const TOOLS: { href: string; title: string; blurb: string; icon: ToolIcon; needs: string }[] = [
  {
    href: "/parenting-tools/diaper-planner",
    title: "How many will you need?",
    blurb: "Diapers per day, the right pack, and what a month roughly costs.",
    icon: "planner",
    needs: "a birthday",
  },
  {
    href: "/parenting-tools/size-up",
    title: "When will they size up?",
    blurb: "From your baby's own weight, an estimate of when the next size fits.",
    icon: "sizeup",
    needs: "a birthday and a weight",
  },
  {
    href: "/parenting-tools/growth",
    title: "Growth percentiles",
    blurb: "Where your baby sits on the WHO weight and height charts.",
    icon: "growth",
    needs: "a birthday, girl/boy and a measurement",
  },
  {
    href: "/parenting-tools/vaccination",
    title: "Vaccination schedule",
    blurb: "Every dose on the government schedule, dated from the birthday.",
    icon: "vaccine",
    needs: "a birthday",
  },
  {
    href: "/parenting-tools/sleep",
    title: "Naps & bedtime",
    blurb: "How long they can stay awake, and what that makes of today.",
    icon: "sleep",
    needs: "a birthday",
  },
  {
    href: "/parenting-tools/first-year-cost",
    title: "A year in diapers",
    blurb: "What year one costs at real prices, size by size.",
    icon: "cost",
    needs: "nothing at all",
  },
  {
    href: "/parenting-tools/first-foods",
    title: "First foods",
    blurb: "Ragi, kambu and pasi paruppu - what to start, when, and how.",
    icon: "food",
    needs: "a birthday",
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

      {/* Left-aligned and asymmetric, like every other section on this site.
          It used to be a centred title over a centred paragraph over a centred
          form, which is the one layout that tells a reader nothing about what
          matters most. */}
      <header className="px-safe mx-auto max-w-[var(--page-max)] pt-[clamp(44px,6vw,80px)] pb-[clamp(26px,3.4vw,44px)]">
        <div className="eyebrow mb-4">Free parenting tools</div>
        <h1 className="m-0 max-w-[18ch] font-display text-[clamp(30px,8.2vw,62px)] font-normal leading-[1.03] md:text-[clamp(36px,4.8vw,62px)]">
          Parenting tools that <Em>know your baby</Em>
        </h1>
        <p className="m-0 mt-5 max-w-[64ch] text-lead leading-[1.55] text-muted">
          Tell us their birthday and whether they&apos;re a girl or a boy. That is everything the
          tools need - how many diapers a day and what a year of them costs, when the next size
          will fit, how long they can stay awake, when to start ragi and kambu, where they sit on
          the WHO growth charts, and every dose on the government vaccination schedule.
        </p>
      </header>

      <div className="px-safe gap-stack mx-auto flex max-w-[var(--page-max)] flex-col pb-section">
        <Reveal>
          <BabyProfileCard />
        </Reveal>

        <Reveal>
          <ParentingDashboard />
        </Reveal>

        <Reveal>
          <div>
            <SectionHeading eyebrow="Your toolkit" size="sm" className="mb-5">
              Seven tools, <Em>one set of answers.</Em>
            </SectionHeading>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.map((tool) => (
                <ToolCard key={tool.href} {...tool} />
              ))}
            </div>
            <p className="mt-5 text-sm text-muted">
              Every tool works without a profile too - you just type the numbers in yourself.
            </p>
          </div>
        </Reveal>
      </div>
    </PageShell>
  );
}
