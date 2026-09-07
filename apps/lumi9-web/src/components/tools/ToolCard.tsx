import Link from "next/link";

export type ToolIcon = "planner" | "sizeup" | "growth" | "vaccine" | "sleep" | "cost" | "food";

/**
 * One tool, one card, one page. The parenting hub is a menu now: each card is
 * the whole tap target and opens the tool on its own route, so the page is
 * scannable instead of an endless scroll of stacked forms.
 *
 * `needs` is the one thing that distinguishes the four cards from each other,
 * and it is information rather than decoration: it is exactly why a tool can
 * open blank. A parent who filled in a birthday and nothing else can see, before
 * tapping, that the growth chart is going to want a weight - which is the
 * question the four identical cards used to leave them to discover inside.
 */
export function ToolCard({
  href,
  title,
  blurb,
  icon,
  needs,
}: {
  href: string;
  title: string;
  blurb: string;
  icon: ToolIcon;
  needs: string;
}) {
  return (
    <Link
      href={href}
      className="group panel p-card flex flex-col gap-3 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1 hover:border-moss-soft focus-visible:-translate-y-1"
    >
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-2xl bg-moss-tint/60 text-moss-deep transition-colors group-hover:bg-moss-tint"
      >
        <Glyph icon={icon} />
      </span>
      <div className="flex-1">
        <h3 className="m-0 font-display text-[clamp(18px,2.2vw,22px)] leading-snug text-midnight">
          {title}
        </h3>
        <p className="mt-1.5 mb-0 text-sm leading-relaxed text-muted">{blurb}</p>
      </div>
      <span className="border-t border-moss-tint pt-3 text-[13px] leading-[1.5] text-muted">
        Needs <b className="font-semibold text-midnight">{needs}</b>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-moss-deep">
        Open
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-transform duration-200 group-hover:translate-x-1"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}

function Glyph({ icon }: { icon: ToolIcon }) {
  const p = {
    width: 26,
    height: 26,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (icon) {
    case "planner":
      return (
        <svg {...p}>
          <rect x="4" y="3" width="16" height="18" rx="2.5" />
          <path d="M8 7h8M8 11h8M8 15h5" />
        </svg>
      );
    case "sizeup":
      return (
        <svg {...p}>
          <path d="M12 20V5M6 11l6-6 6 6" />
          <path d="M5 21h14" />
        </svg>
      );
    case "growth":
      return (
        <svg {...p}>
          <path d="M4 20V4M4 20h16" />
          <path d="M7 15l3.5-4 3 2.5L20 7" />
        </svg>
      );
    case "vaccine":
      return (
        <svg {...p}>
          <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "sleep":
      return (
        <svg {...p}>
          <path d="M20 14.5A8 8 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
        </svg>
      );
    case "cost":
      return (
        <svg {...p}>
          <path d="M7 5h10M7 9h10M15 5c0 4-3.2 5-6 5l7 9" />
        </svg>
      );
    case "food":
      return (
        <svg {...p}>
          <path d="M4 4v6a3 3 0 006 0V4M7 4v16" />
          <path d="M17 4c-1.7 1.3-2.5 3.2-2.5 5.5S15.3 13 17 14v6" />
        </svg>
      );
  }
}
