import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { Em } from "@/components/ui/bits";
import { absoluteUrl, canonical, SITE_NAME } from "@/lib/seo";

const TITLE = "Buy Baby Diapers Online | Lumi9 Cloud Soft NB to XL";
const DESCRIPTION =
  "Shop Lumi9 baby diapers and diaper pants online - newborn tape diapers up to 5 kg through to XL pants for 12-17 kg. Soft, breathable, leak-protected comfort. Free delivery over ₹999.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "baby diapers online", "buy baby diapers online India", "diaper pants for baby",
    "best baby diapers in India", "baby diaper pants price", "premium baby diapers",
    "newborn baby diapers", "Lumi9 baby diaper pants",
  ],
  alternates: canonical("/shop"),
  openGraph: { type: "website", url: absoluteUrl("/shop"), siteName: SITE_NAME, title: TITLE, description: DESCRIPTION },
};

export default function ShopPage() {
  return (
    <PageShell links={NAV_LINKS}>
      <header className="page-wrap pt-[clamp(36px,5vw,64px)] pb-8.5">
        <div className="eyebrow mb-3.5">Shop Cloud Soft</div>
        <h1 className="m-0 mb-3 font-display text-[clamp(30px,8vw,60px)] md:text-[clamp(34px,4.6vw,60px)] font-normal leading-[1.02]">
          One diaper. <Em>Every</Em> stage.
        </h1>
        <p className="m-0 max-w-[56ch] text-body text-muted">
          Chemical-free, cloud-soft pants and tapes - from newborn to toddler. Free delivery over ₹999.
        </p>
      </header>

      <ShopBrowser />
    </PageShell>
  );
}
