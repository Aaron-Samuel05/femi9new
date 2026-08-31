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
 *
 * The two width caps below are load-bearing, and both fix the same artifact.
 * This is the only home section that is TEXT in both columns — its neighbours
 * pair copy with an image or a widget — so it is the only one where the full
 * --page-max (1600px) is far wider than the content wants. At a 1536 viewport
 * the grid ran 1440px while two readable measures need ~1150, and the surplus
 * landed entirely on the right: the hairline rule carried on for 262px after
 * its sentence had stopped. Widening the columns is not the fix (that buys a
 * 85ch line); the fix is to stop the section growing past what the copy fills.
 *
 * The cap on the rule's own <div> rather than on the <p> inside it is the
 * second half. A measure on the paragraph leaves the BORDER spanning the whole
 * column, which is exactly the dead hairline — and below `lg`, where the grid
 * collapses to one wide column, that gap reached 422px. Capping the bordered
 * element instead means the rule can never outrun the words under it.
 */
export function WhyLumi9() {
  return (
    <section id="why" className="px-safe bg-paper py-section">
      <div className="mx-auto grid w-full max-w-[var(--page-max)] grid-cols-1 gap-block lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* pins alongside the list from lg up, clearing the fixed nav */}
        <Reveal className="lg:sticky lg:top-[calc(var(--nav-h,68px)+clamp(24px,4vw,56px))] lg:self-start">
          <SectionHeading eyebrow="Why Lumi9">
            Comfort and protection should come <Em>standard.</Em>
          </SectionHeading>
          <p className="m-0 mt-5 max-w-[46ch] text-body leading-[1.65] text-muted lg:max-w-none">
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
              <div className="max-w-[52ch] border-t border-moss-tint pt-[clamp(16px,2.2vw,24px)] pb-[clamp(22px,3vw,34px)] lg:max-w-none">
                <h3 className="m-0 mb-2.5 text-[clamp(17px,1.7vw,21px)] font-bold">{usp.title}</h3>
                <p className="m-0 text-[clamp(14px,1.2vw,16px)] leading-[1.65] text-muted">
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
