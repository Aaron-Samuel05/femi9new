import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { BabyProfileCard } from "@/components/tools/BabyProfileCard";
import { Reveal } from "@/components/motion/Reveal";
import { breadcrumbSchema, jsonLd } from "@/lib/seo";

/**
 * The scaffold every single-tool page shares: back link to the hub, title, the
 * baby profile (so the tool has data the moment you arrive - it is the same
 * on-device profile the hub reads), then the tool itself.
 */
export function ToolPageFrame({
  title,
  subtitle,
  crumb,
  path,
  children,
}: {
  title: string;
  subtitle: string;
  crumb: string;
  path: string;
  children: ReactNode;
}) {
  return (
    <PageShell links={NAV_LINKS}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Parenting tools", path: "/parenting-tools" },
            { name: crumb, path },
          ]),
        )}
      />

      <header className="px-safe mx-auto max-w-[720px] pt-[clamp(32px,5vw,64px)] pb-8">
        <Link
          href="/parenting-tools"
          /* 20px tall on a phone, and it is the only way back out of a tool
             page - the coarse box gives it a thumb-sized target without
             changing how it looks with a mouse. */
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss-deep coarse:min-h-11"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
          Parenting tools
        </Link>
        <h1 className="m-0 mt-4 mb-3 font-display text-[clamp(28px,6.4vw,48px)] font-normal leading-[1.05]">
          {title}
        </h1>
        <p className="m-0 text-lead text-muted">{subtitle}</p>
      </header>

      <div className="px-safe gap-block mx-auto flex max-w-[900px] flex-col pb-section">
        <Reveal>
          <BabyProfileCard />
        </Reveal>
        <Reveal>{children}</Reveal>
      </div>
    </PageShell>
  );
}
