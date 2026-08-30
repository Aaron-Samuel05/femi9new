import type { Metadata } from "next";
import Image from "next/image";
import { PageShell } from "@/components/site/PageShell";
import { SUPPORT_LINKS } from "@/components/site/Nav";
import { Reveal } from "@/components/motion/Reveal";
import { SizeMatcher } from "@/components/size-guide/SizeMatcher";
import { Em, NumberedCard } from "@/components/ui/bits";
import { FEATURE_IMAGES, FIT_TIPS } from "@/lib/content";
import { loadCatalog } from "@/lib/catalog.server";
import { absoluteUrl, canonical, SITE_NAME } from "@/lib/seo";

const TITLE = "Baby Diaper Size Chart | Find the Right Diaper Size | Lumi9";
const DESCRIPTION =
  "Always go by weight, not age. Use the Lumi9 baby diaper size chart — NB up to 5 kg, S 4–8 kg, M 7–12 kg, L 9–14 kg, XL 12–17 kg — and learn when to switch diaper size.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "diaper size chart for babies", "how to choose right diaper size", "newborn diaper size",
    "when to switch diaper size", "baby diaper size guide", "diapers for 7-12 kg baby",
    "diapers for 4-8 kg baby", "diapers for 9-14 kg baby", "diapers for 12-17 kg baby",
  ],
  alternates: canonical("/size-guide"),
  openGraph: { type: "website", url: absoluteUrl("/size-guide"), siteName: SITE_NAME, title: TITLE, description: DESCRIPTION },
};

export default async function SizeGuidePage() {
  const { sizes } = await loadCatalog();
  return (
    <PageShell links={SUPPORT_LINKS}>
      <header className="px-safe mx-auto max-w-[720px] pt-[clamp(44px,6vw,80px)] pb-10 text-center">
        <div className="eyebrow mb-4">Size guide</div>
        <h1 className="m-0 mb-3.5 font-display text-[clamp(29px,7.8vw,60px)] md:text-[clamp(34px,4.6vw,60px)] font-normal leading-[1.02]">
          The perfect fit, <Em>in one tap.</Em>
        </h1>
        <p className="m-0 text-body text-muted">
          Always go by weight, not age. Tap your baby&apos;s weight to see the match.
        </p>
      </header>

      <SizeMatcher />

      {/* CHART IMAGE */}
      <section className="px-safe pb-section">
        <Reveal className="mx-auto max-w-[900px] overflow-hidden rounded-media shadow-hero">
          <Image
            src={FEATURE_IMAGES.perfectFit.src}
            alt={FEATURE_IMAGES.perfectFit.alt}
            width={1600}
            height={1000}
            sizes="(max-width: 900px) 92vw, 900px"
            className="block h-auto w-full"
          />
        </Reveal>
      </section>

      {/* TABLE — a real table on tablet+, and one card per size on phones, so
          nothing has to scroll sideways or shrink below a readable size */}
      <section className="px-safe pb-section">
        <div className="mx-auto max-w-[900px]">
          <table className="hidden w-full border-collapse overflow-hidden rounded-card border border-moss-tint bg-canvas text-left sm:table">
            <thead>
              <tr className="bg-midnight text-sm font-bold text-butter">
                <th scope="col" className="px-[clamp(14px,2vw,24px)] py-4 font-bold">
                  Size
                </th>
                <th scope="col" className="px-[clamp(14px,2vw,24px)] py-4 font-bold">
                  Baby weight
                </th>
                <th scope="col" className="px-[clamp(14px,2vw,24px)] py-4 font-bold">
                  Available packs
                </th>
              </tr>
            </thead>
            <tbody className="text-[clamp(14px,1.3vw,15px)]">
              {sizes.map((size) => (
                <tr key={size.size} className="border-t border-moss-tint">
                  <th scope="row" className="px-[clamp(14px,2vw,24px)] py-4 font-bold text-moss-deep">
                    {size.size}
                  </th>
                  <td className="px-[clamp(14px,2vw,24px)] py-4 text-midnight">{size.range}</td>
                  <td className="px-[clamp(14px,2vw,24px)] py-4 text-muted">
                    {size.packs.map((pack) => pack.count).join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="m-0 flex list-none flex-col gap-3 p-0 sm:hidden">
            {sizes.map((size) => (
              <li key={size.size} className="panel flex items-center gap-4 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-chip bg-moss-tint font-display text-lg font-bold text-moss-deep">
                  {size.size}
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-bold text-midnight">{size.range}</span>
                  <span className="block text-[13px] text-muted">
                    Packs of {size.packs.map((pack) => pack.count).join(" / ")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FIT TIPS */}
      <section className="px-safe pb-section">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="m-0 mb-[clamp(28px,4vw,44px)] text-center font-display text-[clamp(24px,6.6vw,44px)] font-normal md:text-[clamp(28px,3.4vw,44px)]">
            How to check the fit
          </h2>
          <div className="grid grid-cols-1 gap-[clamp(14px,1.8vw,22px)] sm:grid-cols-2 lg:grid-cols-3">
            {FIT_TIPS.map((tip) => (
              <Reveal key={tip.n} className="overflow-hidden rounded-card border border-moss-tint">
                <NumberedCard n={tip.n} title={tip.title} body={tip.body} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
