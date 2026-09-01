import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { AffiliatePanel } from "@/components/affiliate/AffiliatePanel";
import { Em } from "@/components/ui/bits";
import { Icon, type IconName } from "@/components/ui/Icon";
import { absoluteUrl, canonical, SITE_NAME } from "@/lib/seo";

const TITLE = "Lumi9 Creator Programme | Earn With Every Referral";
const DESCRIPTION =
  "Parenting creators earn 10% of every order placed through their Lumi9 link. Apply in a minute; we review each application by hand.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: canonical("/affiliate"),
  openGraph: {
    type: "website",
    url: absoluteUrl("/affiliate"),
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * The Lumi9 creator programme.
 *
 * Lumi9's creators are its own: an application here writes to the `lumi9`
 * schema, a code approved here works only on Lumi9 links, and a Femi9 creator
 * has no account on this page. The two programmes share a service and share
 * nothing else - see the note in `src/app/a/[code]/route.ts`.
 *
 * The interactive half is a client component; everything a search engine needs
 * is server-rendered around it.
 */

/** 10% of order subtotal - the rate `attributeOrder` actually pays. Kept in
 *  sync with COMMISSION_RATE in @femi9/core/services/affiliate: a marketing
 *  page quoting a rate the code does not pay is how a creator ends up disputing
 *  her first payout. */
const COMMISSION_PCT = 10;

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "user",
    title: "Apply",
    body: "Tell us who you are and where you post. We read every application and reply by email.",
  },
  {
    icon: "tag",
    title: "Get your link",
    body: "Approved creators get a code and a personal link. Share it wherever you already talk about your baby.",
  },
  {
    icon: "save",
    title: "Earn",
    body: `Every order placed through your link pays you ${COMMISSION_PCT}% of its value. Clicks and earnings update as they happen.`,
  },
];

export default function AffiliatePage() {
  return (
    <PageShell links={NAV_LINKS}>
      <section className="page-wrap grid grid-cols-1 items-start gap-block pt-[clamp(40px,5.5vw,72px)] pb-section md:grid-cols-2">
        <div>
          <div className="eyebrow mb-4">Creator programme</div>
          <h1 className="m-0 mb-5 font-display text-[clamp(29px,7.8vw,58px)] md:text-[clamp(34px,4.4vw,58px)] font-normal leading-[1.02]">
            Share what you already <Em>love</Em>.
          </h1>
          <p className="m-0 mb-10 max-w-[44ch] text-body leading-[1.6] text-muted">
            If you write about parenting, you are already recommending things. The Lumi9
            creator programme pays you {COMMISSION_PCT}% of every order placed through
            your link - tracked properly, paid on real numbers.
          </p>

          <ol className="m-0 flex list-none flex-col gap-[clamp(14px,1.8vw,22px)] p-0">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-moss-tint text-moss-deep">
                  <Icon name={step.icon} size={22} strokeWidth={1.7} />
                </span>
                <span>
                  <span className="block text-[15px] font-bold text-midnight">
                    {i + 1}. {step.title}
                  </span>
                  <span className="text-[clamp(13px,1.2vw,14px)] leading-[1.6] text-muted">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <AffiliatePanel />
      </section>
    </PageShell>
  );
}
