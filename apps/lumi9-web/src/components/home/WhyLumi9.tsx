import { Reveal } from "@/components/motion/Reveal";
import { Em, SectionHeading } from "@/components/ui/bits";
import { USPS } from "@/lib/content";

/**
 * "Why Lumi9" as an editorial index rather than a card grid.
 *
 * The heading keeps its own column and pins while the six claims scroll past
 * it, each led by its index numeral and a hairline. Deliberately no cards, no
 * icon tiles and no fills — the type and the rules carry the section, so it
 * reads as a considered list instead of six interchangeable tiles.
 */
export function WhyLumi9() {
  return (
    <section id="why" className="px-safe bg-paper py-section">
      <div className="mx-auto grid max-w-[var(--page-max)] grid-cols-1 gap-block lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        {/* pins alongside the list from lg up, clearing the fixed nav */}
        <Reveal className="lg:sticky lg:top-[calc(var(--nav-h,68px)+clamp(24px,4vw,56px))] lg:self-start">
          <SectionHeading eyebrow="Why Lumi9">
            Comfort and protection should come <Em>standard.</Em>
          </SectionHeading>
          <p className="m-0 mt-5 max-w-[46ch] text-body leading-[1.65] text-muted">
            Every little stretch, crawl, nap and nighttime cuddle deserves comfort you can count on. Lumi9 baby
            diapers bring together soft everyday care, fast moisture management, breathable materials and
            all-around protection to support your baby through every little move.
          </p>
        </Reveal>

        <ol className="m-0 list-none p-0">
          {USPS.map((usp, i) => (
            <Reveal
              as="li"
              key={usp.title}
              className="grid grid-cols-[auto_1fr] gap-x-[clamp(14px,2vw,28px)] last:[&>div]:pb-0"
            >
              {/* index is decorative — the list order already conveys it */}
              <span
                aria-hidden
                className="w-[clamp(30px,3.6vw,48px)] pt-[clamp(16px,2.2vw,24px)] font-display text-[clamp(20px,2.2vw,28px)] leading-none tabular-nums text-moss-soft"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="border-t border-moss-tint pt-[clamp(16px,2.2vw,24px)] pb-[clamp(22px,3vw,34px)]">
                <h3 className="m-0 mb-2.5 text-[clamp(17px,1.7vw,21px)] font-bold">{usp.title}</h3>
                <p className="m-0 max-w-[48ch] text-[clamp(14px,1.2vw,16px)] leading-[1.65] text-muted">
                  {usp.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
