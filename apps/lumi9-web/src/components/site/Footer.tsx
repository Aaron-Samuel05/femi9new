import Image from "next/image";
import Link from "next/link";
import { BRAND } from "@/lib/content";
import { SOCIALS, SocialIcon } from "@/components/ui/Icon";
import { FooterMascot } from "@/components/three/FooterMascot";
import { NewsletterForm } from "@/components/site/NewsletterForm";
import { WaveEdge } from "@/components/ui/Scallop";

const SHOP_LINKS = [
  { label: "Cloud Soft diapers", href: "/shop" },
  { label: "Find your size", href: "/size-guide" },
  { label: "Subscription box", href: "/subscription" },
  { label: "Gifting", href: "/shop" },
];

const COMPANY_LINKS = [
  { label: "Our story", href: "/about" },
  { label: "Journal", href: "/journal" },
  { label: "Creator programme", href: "/affiliate" },
  { label: "Help centre", href: "/help" },
  { label: "Contact", href: "/contact" },
];

/**
 * Legal row.
 *
 * Terms and FAQ point at femi9.in, which is what lumi9.in itself does - the two
 * storefronts are one company and share one set of published policies, so
 * hosting a second copy here would mean two documents to keep in step and one
 * of them going stale. Privacy stays local because this app already ships that
 * page.
 *
 * NOTE FOR LAUNCH: Razorpay requires a merchant to publish Refund/Cancellation
 * and Shipping policies, and neither site has them at either domain today.
 * Those two rows want adding before payments go live.
 */
const LEGAL_LINKS: { label: string; href: string; external?: boolean }[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms & Conditions", href: "https://femi9.in/terms-and-conditions", external: true },
  { label: "FAQ", href: "https://femi9.in/faq", external: true },
];

function LinkColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="mb-[clamp(14px,2vw,22px)] text-[clamp(18px,2vw,22px)] font-bold text-butter">{title}</div>
      {/* On touch each link is already a 44px row, so the gap on top of it made
          the two columns ~110px taller than they read on a mouse. Drop it there
          and let the row height do the spacing. */}
      <div className="flex flex-col gap-[clamp(11px,1.4vw,15px)] text-[clamp(14px,1.2vw,15px)] coarse:gap-0">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            className="inline-flex items-center text-butter/85 transition-colors hover:text-butter coarse:min-h-11"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * The rim: Lumi waving over a wave, across the top of the footer.
 *
 * Ported from lumi9.in, which ends its page this way — `.lumi-footer-wave` with
 * `.footer-mascot` absolutely placed on it. Two things about that markup are
 * load-bearing and are kept here:
 *
 *   1. **The wave is drawn IN FRONT of Lumi**, not behind him (lumi9.in gives
 *      the svg `z-index:2` and the mascot `z-index:1`). The artwork is a bust —
 *      its 260x146 frame crops him mid-body, with only 6px of transparency below
 *      — so anything that puts him on top leaves that crop landing as a hard
 *      horizontal cut across a flat colour. Behind the wave, the cut is the
 *      thing the wave is covering, and he reads as peeking over it.
 *   2. **The whole strip is inert.** `aria-hidden` and no pointer events: it is
 *      a mascot, it links nowhere, and it sits directly above the footer's first
 *      real link.
 *
 * ── The two files ──────────────────────────────────────────────────────────
 * `footer-mascot.webp` is an 81-frame animated WebP and 1.1MB of it. That is
 * fine as a lazy, below-the-fold decoration and NOT fine to send to somebody who
 * has asked their OS for less motion — so the still frame is a separate file and
 * the choice is made by `<picture media>`, which downloads exactly one of them.
 * A `motion-reduce:hidden` class would not: both files would still be fetched,
 * and the 1.1MB one is the one that would be thrown away.
 *
 * That is also why this is a plain `<img>` inside `<picture>` rather than
 * `next/image` — art direction by media query is the one thing that component
 * cannot express, and the optimizer has nothing to add to an animated WebP
 * anyway (it would need `unoptimized` to avoid flattening it to a single frame).
 *
 * ── Why the wave is moss, over a footer whose left panel is cream ───────────
 * It has to be ONE colour: the wave is a single path across the full width, and
 * the row beneath it is butter for the first column and moss-deep for the other
 * two. Moss-deep is the colour of two thirds of that row and of the panel Lumi
 * actually stands over, so the odd one out is a thin moss lip along the top of
 * the cream contact panel — which reads as a rim wrapping the footer, and is the
 * reason this is a full-bleed strip rather than three per-column waves (those
 * would restart the curve at every column edge, and stack into three separate
 * waves the moment the grid collapses to one column below `lg`).
 */
function FooterRim() {
  return (
    <div
      aria-hidden
      className="relative isolate h-[clamp(62px,10vw,124px)] lg:col-span-3"
      // Named once and read twice: the wave's own height, and how far up it Lumi
      // stands. They cannot drift apart into a mascot floating above the curve.
      style={{ ["--wave-h" as string]: "clamp(24px, 3.2vw, 48px)" }}
    >
      <picture>
        <source media="(prefers-reduced-motion: reduce)" srcSet="/assets/footer-mascot-still.webp" />
        {/* A plain <img>, and `no-img-element` does not fire on one inside a
            <picture> — which is the rule agreeing that art direction is the case
            the component does not cover. */}
        <img
          src="/assets/footer-mascot.webp"
          alt=""
          width={260}
          height={146}
          loading="lazy"
          decoding="async"
          // Right of centre, as on lumi9.in — but over the LINKS panel, not the
          // 8% that would stack him directly above the 3D Lumi in the third
          // column. Below `lg` the footer is one column and there is nothing to
          // collide with, so the original 8% stands.
          className="absolute right-[8%] bottom-[calc(var(--wave-h)*0.55)] z-1 h-[clamp(34px,6vw,88px)] w-auto lg:right-[26%]"
        />
      </picture>
      {/* In front of Lumi, and the app's own divider rather than a second wave
          implementation — it is the same curve the homepage puts between its
          moss bands. */}
      <WaveEdge color="var(--color-moss-deep)" className="absolute inset-x-0 bottom-0 z-2" />
    </div>
  );
}

/**
 * Three-panel brand footer: cream contact panel, patterned links panel, 3D mascot,
 * under a wave rim with Lumi on it.
 * Below `lg` it becomes one column; the mascot panel keeps a 16/10 frame there so
 * the canvas always has a sane ratio for the aspect-fit camera to work with.
 */
export function Footer() {
  return (
    <footer className="relative mt-10 grid grid-cols-1 overflow-hidden rounded-t-footer lg:min-h-[560px] lg:grid-cols-[minmax(220px,330px)_minmax(0,1fr)_minmax(220px,340px)]">
      <FooterRim />

      {/* Left - cream contact panel */}
      <div className="px-safe flex flex-col justify-center bg-butter py-[clamp(36px,6vw,64px)]">
        <Image
          src="/assets/logo-midnight.png"
          alt="Lumi9"
          width={115}
          height={52}
          className="mb-[clamp(18px,2.6vw,26px)] h-[clamp(40px,5.5vw,52px)] w-auto self-start object-contain"
        />
        <p className="mb-[clamp(20px,3vw,30px)] max-w-[26ch] font-display text-[clamp(17px,1.6vw,19px)] leading-[1.45] text-midnight">
          {BRAND.tagline}
        </p>
        <div className="flex flex-col gap-2 text-[clamp(13px,1.15vw,14px)] text-midnight">
          <a
            href={`mailto:${BRAND.email}`}
            className="inline-flex items-center text-midnight opacity-85 hover:opacity-100 coarse:min-h-11"
          >
            {BRAND.email}
          </a>
          <a
            href={`tel:${BRAND.phone.replace(/\s/g, "")}`}
            className="inline-flex items-center text-midnight opacity-85 hover:opacity-100 coarse:min-h-11"
          >
            {BRAND.phone}
          </a>
          <span className="mt-1 leading-[1.5] opacity-70">
            {BRAND.addressLines[0]}
            <br />
            {BRAND.addressLines[1]}
          </span>
        </div>
      </div>

      {/* Center - patterned links + newsletter + socials */}
      <div className="blob-pattern px-safe bg-moss-deep py-[clamp(40px,5.5vw,60px)]">
        <div className="mb-[clamp(28px,4vw,44px)] grid grid-cols-2 gap-[clamp(16px,2.4vw,24px)] sm:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
          <LinkColumn title="Shop" links={SHOP_LINKS} />
          <LinkColumn title="Company" links={COMPANY_LINKS} />
        </div>

        <p className="mb-[18px] max-w-[46ch] text-[clamp(15px,1.4vw,17px)] leading-[1.5] text-butter">
          Parenting tips + early access to drops.
        </p>
        <NewsletterForm />

        <div className="mb-3.5 text-[clamp(14px,1.2vw,15px)] font-bold text-butter">Follow us</div>
        <div className="flex flex-wrap gap-[clamp(8px,1.2vw,12px)]">
          {SOCIALS.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={social.name}
              className="flex size-11 items-center justify-center rounded-full border-[1.5px] border-butter/40 text-butter transition-colors hover:border-butter hover:bg-butter/15"
            >
              <SocialIcon name={social.name} />
            </a>
          ))}
        </div>
      </div>

      {/* Right - mascot on brand pattern */}
      {/* Height is set directly rather than via aspect-ratio: an aspect-ratio box
          with a capped height derives its *width* from the ratio, so the panel
          stopped stretching across the stacked row and let the page background
          show through beside it. */}
      <div className="blob-pattern relative w-full bg-moss-deep max-lg:h-[clamp(210px,32vw,300px)] lg:min-h-[320px]">
        <FooterMascot />
      </div>

      {/* Bottom bar */}
      <div className="px-safe flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-midnight py-4 text-[clamp(12px,1vw,13px)] text-butter/75 lg:col-span-3">
        <span>{BRAND.copyright}</span>
        <span className="max-sm:order-3 max-sm:w-full">{BRAND.legalLine}</span>
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {LEGAL_LINKS.map((l) =>
            l.external ? (
              <a
                key={l.label}
                href={l.href}
                // These live on the Femi9 domain, which is the same company but a
                // different origin - so the tab gets `noopener` and the label
                // gets a marker, rather than silently handing the visitor to
                // another site mid-checkout-decision with no warning.
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 whitespace-nowrap text-butter/75 hover:text-butter coarse:min-h-11"
              >
                {l.label}
                <svg aria-hidden="true" viewBox="0 0 12 12" className="size-2.5 opacity-60">
                  <path
                    d="M4 2h6v6M10 2L2.5 9.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="sr-only">(opens on femi9.in)</span>
              </a>
            ) : (
              <Link
                key={l.label}
                href={l.href}
                className="inline-flex items-center whitespace-nowrap text-butter/75 hover:text-butter coarse:min-h-11"
              >
                {l.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
