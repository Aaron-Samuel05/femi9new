import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { HelpTopics } from "@/components/help/HelpTopics";
import { faqs } from "@/lib/content";
import { storefrontNumbers } from "@/lib/settings.server";
import { absoluteUrl, breadcrumbSchema, canonical, faqSchema, jsonLd, og } from "@/lib/seo";

const TITLE = "Help Centre | Lumi9 Baby Diapers";
const DESCRIPTION =
  "Answers on baby diaper sizing, subscriptions, delivery, returns and product safety - everything parents ask us about Lumi9 Cloud Soft diapers.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/help"),
  openGraph: og({ type: "website", url: absoluteUrl("/help"), title: TITLE, description: DESCRIPTION }),
};


export default async function HelpPage() {
  // Two of these answers quote the console's numbers. Built ONCE here and used
  // for both the JSON-LD and the accordion, so a crawler and a reader can never
  // be shown different shipping terms.
  const items = faqs(await storefrontNumbers());

  return (
    <PageShell links={NAV_LINKS}>
      {/* Every answer below is in the server-rendered HTML - the accordion hides
          collapsed panels with the `hidden` attribute rather than unmounting
          them - so this FAQPage node describes content a crawler can actually
          find on the page. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqSchema(items))} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Help centre", path: "/help" },
          ]),
        )}
      />
      <header className="px-safe mx-auto max-w-[720px] pt-[clamp(44px,6vw,80px)] pb-10 text-center">
        <div className="eyebrow mb-4">Help centre</div>
        <h1 className="m-0 mb-3.5 font-display text-[clamp(29px,7.8vw,60px)] md:text-[clamp(34px,4.6vw,60px)] font-normal leading-[1.02]">
          Questions, answered.
        </h1>
        <p className="m-0 text-body text-muted">Everything about sizing, subscriptions, shipping and safety.</p>
      </header>

      <HelpTopics items={items} />

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
