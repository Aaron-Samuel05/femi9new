import type { ReactNode } from "react";

/** Eyebrow + display heading pair used at the top of most sections. */
export function SectionHeading({
  eyebrow,
  children,
  className = "",
  size = "md",
  as: Tag = "h2",
}: {
  eyebrow?: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
  as?: "h1" | "h2" | "h3";
}) {
  /* vw-driven on phones (so the line count stays sane at 320px) and
     design-accurate from `md` up */
  const scale = {
    sm: "text-[clamp(26px,7vw,46px)] md:text-[clamp(30px,3.6vw,46px)]",
    md: "text-[clamp(28px,7.6vw,56px)] md:text-[clamp(34px,4.4vw,56px)]",
    lg: "text-[clamp(32px,8.6vw,74px)] md:text-[clamp(38px,5.4vw,74px)]",
  }[size];

  return (
    <div className={className}>
      {eyebrow && <div className="eyebrow mb-4">{eyebrow}</div>}
      <Tag className={`m-0 font-display font-normal leading-[1.04] ${scale}`}>{children}</Tag>
    </div>
  );
}

/** Italic moss-deep emphasis used throughout the display headings. */
/**
 * The emphasised fragment inside a heading.
 *
 * Was `italic text-moss-deep`. An italicised word inside an otherwise-upright
 * heading is one of the most reliable generated-design tells — and it was never
 * how this brand actually writes a headline. @lumi9official sets the same
 * construction in a brush script against its sans on card after card: "A
 * Mother's" over "Love in Every Layer", "More Cuddles" over "Less Worries".
 *
 * Three details make the swap hold at every size:
 *   · `font-style: normal` is explicit. Caveat's slant is drawn in; letting a
 *     browser also shear it produces a doubled, wobbling oblique.
 *   · Script faces carry a smaller x-height than the sans they sit beside, so
 *     at matched font-size the emphasis looks SHRUNKEN. `1.12em` restores the
 *     optical match — it is a correction, not a size change.
 *   · The baseline shifts a touch because the two faces sit differently in
 *     their em box; `0.06em` puts the word back on the line of its neighbours.
 */
export function Em({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-script font-700 not-italic text-moss-deep"
      style={{ fontSize: "1.12em", lineHeight: 1, display: "inline-block", transform: "translateY(0.06em)" }}
    >
      {children}
    </span>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-moss-tint ${className}`} />;
}

/** 01 / 02 / 03 … numbered value or tip card. */
export function NumberedCard({
  n,
  title,
  body,
  className = "",
}: {
  n: string;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <div className={`bg-canvas p-card ${className}`}>
      <div className="mb-4 font-display text-[clamp(26px,3vw,34px)] text-moss-soft">{n}</div>
      <h3 className="m-0 mb-2 text-[clamp(16px,1.5vw,18px)] font-bold">{title}</h3>
      <p className="m-0 text-[clamp(13px,1.2vw,14px)] leading-[1.55] text-muted">{body}</p>
    </div>
  );
}

export function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-[clamp(24px,2.6vw,30px)] leading-none text-midnight">{value}</div>
      <div className="mt-1 text-[clamp(12px,1.1vw,13px)] text-muted">{label}</div>
    </div>
  );
}

/** Testimonial / review card. */
export function QuoteCard({
  quote,
  name,
  role,
  initial,
  surface = "bg-canvas",
  quoteSize = "text-quote",
}: {
  quote: string;
  name: string;
  role: string;
  initial: string;
  surface?: string;
  quoteSize?: string;
}) {
  return (
    <div className={`rounded-card border border-moss-tint p-card ${surface}`}>
      <div className="mb-4 text-[17px] tracking-[2px] text-gold" aria-label="Rated 5 out of 5">
        ★★★★★
      </div>
      <p className={`m-0 mb-[22px] font-display leading-[1.45] text-midnight ${quoteSize}`}>{quote}</p>
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-moss-tint font-bold text-moss-deep">
          {initial}
        </div>
        <div className="text-sm">
          <div className="font-bold">{name}</div>
          <div className="text-muted">{role}</div>
        </div>
      </div>
    </div>
  );
}
