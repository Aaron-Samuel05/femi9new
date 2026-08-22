/**
 * The single line-icon set used across Lumi9. 1.7–1.8px strokes on a 24px grid,
 * inheriting `currentColor` so callers control the colour with text utilities.
 */

const PATHS = {
  leaf: ["M4 20c0-8 6-14 16-16-1 10-6 16-16 16z", "M4 20c4-6 8-9 13-11"],
  drop: ["M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z", "M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"],
  wind: ["M3 8h9a2.5 2.5 0 1 0-2.5-2.5", "M3 12h13a2.5 2.5 0 1 1-2.5 2.5", "M3 16h7"],
  heart: ["M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11z"],
  shield: ["M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z", "M9 12l2 2 4-4"],
  tag: ["M4 12l8-8h6a1 1 0 0 1 1 1v6l-8 8a1 1 0 0 1-1.4 0l-5.6-5.6a1 1 0 0 1 0-1.4z", "M15.5 8.5h.01"],
  clock: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 8v4l3 2"],
  mail: ["M4 6h16v12H4z", "M4 7l8 6 8-6"],
  phone: ["M5 4h4l2 5-3 2a12 12 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"],
  chat: ["M4 5h16v11H9l-5 4z"],
  pin: ["M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z", "M12 10a2 2 0 1 0 0 .01"],
  save: ["M12 3v14", "M6 11l6 6 6-6", "M5 21h14"],
  grow: ["M4 12a8 8 0 0 1 14-5M20 12a8 8 0 0 1-14 5", "M18 4v3h-3M6 20v-3h3"],
  pause: ["M9 5v14M15 5v14"],
  truck: ["M3 6h11v9H3zM14 9h4l3 3v3h-7", "M7 18a1.5 1.5 0 1 0 .01 0M17 18a1.5 1.5 0 1 0 .01 0"],
  grid: ["M4 13h7V4H4zM13 20h7V4h-7zM4 20h7v-4H4z"],
  list: ["M4 6h16M4 12h16M4 18h10"],
  cart: ["M4 5h2l2.2 9.4a1.5 1.5 0 0 0 1.5 1.1h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H7", "M10 19.5a1 1 0 1 0 .01 0M17 19.5a1 1 0 1 0 .01 0"],
  lock: ["M6 11h12v9H6z", "M9 11V8a3 3 0 0 1 6 0v3"],
  check: ["M5 13l4 4L19 7"],
  arrowLeft: ["M19 12H5", "M11 6l-5 6 5 6"],
  logout: ["M14 5H6v14h8", "M17 9l3 3-3 3M20 12h-8"],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  strokeWidth = 1.8,
  className,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: "0 0 auto" }}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export const SOCIALS = [
  { name: "Instagram", href: "https://instagram.com/lumi9official" },
  { name: "Facebook", href: "https://facebook.com/lumi9official" },
  { name: "YouTube", href: "https://youtube.com/@lumi9official" },
  { name: "LinkedIn", href: "https://linkedin.com/company/lumi9" },
  { name: "WhatsApp", href: "https://wa.me/919042916499" },
] as const;

export type SocialName = (typeof SOCIALS)[number]["name"];

export function SocialIcon({ name }: { name: SocialName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: "false" as const,
  };

  switch (name) {
    case "Instagram":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </svg>
      );
    case "Facebook":
      return (
        <svg {...common}>
          <path d="M14 8h2V5h-2a3 3 0 0 0-3 3v2H9v3h2v6h3v-6h2l1-3h-3V8a1 1 0 0 1 1-1z" />
        </svg>
      );
    case "YouTube":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="3" />
          <path d="M11 9.5l4 2.5-4 2.5z" fill="currentColor" />
        </svg>
      );
    case "LinkedIn":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4M11 11v6" />
        </svg>
      );
    case "WhatsApp":
      return (
        <svg {...common}>
          <path d="M4 20l1.3-4A8 8 0 1 1 8 18.7L4 20z" />
          <path
            d="M9 9c0 3 2.5 5.5 5.5 5.5.6 0 1-.6 1-1l-1.4-1-1 .8c-1-.5-1.9-1.4-2.4-2.4l.8-1L10.5 8c-.4 0-1 .4-1 1z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      );
  }
}

export function Stars({ className = "text-gold" }: { className?: string }) {
  return (
    <div className={`text-[17px] tracking-[2px] ${className}`} aria-label="5 out of 5 stars">
      ★★★★★
    </div>
  );
}
