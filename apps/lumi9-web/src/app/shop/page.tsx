import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { Em } from "@/components/ui/bits";
import { absoluteUrl, canonical, og } from "@/lib/seo";
import { storefrontNumbers } from "@/lib/settings.server";
import { inr } from "@/lib/catalog";

const TITLE = "Buy Baby Diapers Online | Lumi9 Cloud Soft NB to XL";
const description = (freeShipThreshold: number) =>
  `Shop Lumi9 baby diapers and diaper pants online - newborn tape diapers up to 5 kg through to XL pants for 12-17 kg. Soft, breathable, leak-protected comfort. Free delivery over ${inr(freeShipThreshold)}.`;

/**
 * `generateMetadata`, not a static object, because the description quotes the
 * free-shipping threshold — a number the console owns and a promise a shopper
 * reads in the search result before she ever reaches the page. It cost a
 * literal ₹999 here that no console change could move. The read is deduped with
 * the page's own by `storefrontNumbers`, so this is one query, not two.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { freeShipThreshold } = await storefrontNumbers();
  const DESCRIPTION = description(freeShipThreshold);
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    keywords: [
      "baby diapers online", "buy baby diapers online India", "diaper pants for baby",
      "best baby diapers in India", "baby diaper pants price", "premium baby diapers",
      "newborn baby diapers", "Lumi9 baby diaper pants",
    ],
    alternates: canonical("/shop"),
    openGraph: og({ type: "website", url: absoluteUrl("/shop"), title: TITLE, description: DESCRIPTION }),
  };
}

export default async function ShopPage() {
  const { freeShipThreshold } = await storefrontNumbers();

  return (
    <PageShell links={NAV_LINKS}>
      <header className="page-wrap pt-[clamp(36px,5vw,64px)] pb-8.5">
        <div className="eyebrow mb-3.5">Shop Cloud Soft</div>
        <h1 className="m-0 mb-3 font-display text-[clamp(30px,8vw,60px)] md:text-[clamp(34px,4.6vw,60px)] font-normal leading-[1.02]">
          One diaper. <Em>Every</Em> stage.
        </h1>
        <p className="m-0 max-w-[56ch] text-body text-muted">
          Chemical-free, cloud-soft pants and tapes - from newborn to toddler. Free delivery over{" "}
          {inr(freeShipThreshold)}.
        </p>
      </header>

      <ShopBrowser />
    </PageShell>
  );
}
