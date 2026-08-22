import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { PRIMARY_LINKS } from "@/components/site/Nav";
import { ShopBrowser } from "@/components/shop/ShopBrowser";
import { Em } from "@/components/ui/bits";

export const metadata: Metadata = {
  title: "Shop Cloud Soft",
  description:
    "Chemical-free, cloud-soft pants and tapes — from newborn to toddler. Free delivery over ₹999.",
};

export default function ShopPage() {
  return (
    <PageShell links={PRIMARY_LINKS} cta="cart">
      <header className="px-safe mx-auto max-w-[1240px] pt-[clamp(36px,5vw,64px)] pb-8.5">
        <div className="eyebrow mb-3.5">Shop Cloud Soft</div>
        <h1 className="m-0 mb-3 font-display text-[clamp(30px,8vw,60px)] md:text-[clamp(34px,4.6vw,60px)] font-normal leading-[1.02]">
          One diaper. <Em>Every</Em> stage.
        </h1>
        <p className="m-0 max-w-[56ch] text-body text-muted">
          Chemical-free, cloud-soft pants and tapes — from newborn to toddler. Free delivery over ₹999.
        </p>
      </header>

      <ShopBrowser />
    </PageShell>
  );
}
