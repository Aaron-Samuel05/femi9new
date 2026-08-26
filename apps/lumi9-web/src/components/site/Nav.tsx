"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { Icon } from "@/components/ui/Icon";

export type NavLink = { label: string; href: string };

export const PRIMARY_LINKS: NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "Technology", href: "/#tech" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

export const HOME_LINKS: NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "Technology", href: "/#tech" },
  { label: "Find your size", href: "/#sizes" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

export const SUPPORT_LINKS: NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Help", href: "/help" },
  { label: "Contact", href: "/contact" },
];

/**
 * Publishes the nav's real height as `--nav-h` so pages that sit under a fixed
 * nav (the home hero) can offset by the exact amount at any width, instead of
 * guessing a value per breakpoint.
 */
function useMeasuredNavHeight(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        "--nav-h",
        `${Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)}px`,
      );
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--nav-h");
    };
  }, [enabled]);

  return ref;
}

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center coarse:min-h-11" aria-label="Lumi9 home">
      <Image
        src="/assets/logo-midnight.png"
        alt="Lumi9"
        width={106}
        height={48}
        priority
        /* 28px on the smallest phones → 34px at the design width */
        className="block h-[clamp(28px,4.2vw,34px)] w-auto shrink-0"
      />
    </Link>
  );
}

function CartLink({ strong = false }: { strong?: boolean }) {
  const { count, ready } = useCart();

  return (
    <Link
      href="/cart"
      className={`flex shrink-0 items-center gap-[7px] text-[clamp(13px,1.1vw,14px)] coarse:min-h-11 ${
        strong ? "font-bold text-moss-deep" : "font-semibold text-midnight hover:text-moss-deep"
      }`}
      aria-label={`Cart, ${ready ? count : 0} items`}
    >
      <Icon name="cart" size={19} strokeWidth={1.6} />
      <span className="max-[359px]:sr-only">Cart</span>
      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-xs font-bold text-midnight">
        {ready ? count : 0}
      </span>
    </Link>
  );
}

/**
 * Sticky site nav. `variant="home"` starts transparent over the hero and picks up
 * the blurred paper background after 30px of scroll.
 *
 * Below `md` the link list becomes a single horizontally scrollable row under the
 * logo + CTA row, so the bar stays two rows tall at every width instead of
 * stacking into three or squeezing the CTA off-screen.
 */
export function Nav({
  links = PRIMARY_LINKS,
  variant = "solid",
  cta = "shop",
}: {
  links?: NavLink[];
  variant?: "solid" | "home";
  cta?: "shop" | "cart" | "both" | "none";
}) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const isHome = variant === "home";
  // Measured on every variant, not just home: --nav-h is what the global
  // scroll-padding-top in globals.css offsets anchor landings by, and the
  // sticky nav on the inner pages is exactly as tall as the fixed one.
  const ref = useMeasuredNavHeight(true);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHome]);

  const chrome = isHome
    ? scrolled
      ? "bg-paper/85 backdrop-blur-[14px] shadow-[0_1px_0_rgb(39_44_5_/_0.08)] md:py-3"
      : "bg-transparent md:py-[18px]"
    : "bg-paper/85 backdrop-blur-[14px] shadow-[0_1px_0_rgb(39_44_5_/_0.08)] md:py-4";

  return (
    <nav
      ref={ref}
      className={`px-safe z-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5 transition-[background-color,box-shadow,padding] duration-400 ease-out ${chrome} ${
        isHome ? "fixed inset-x-0 top-0" : "sticky top-0"
      }`}
    >
      <Logo />

      <div
        className="
          scroll-row items-center gap-4 text-[clamp(13px,1.15vw,15px)] font-medium
          max-md:order-3 max-md:-mx-[var(--spacing-gutter)] max-md:w-[calc(100%+2*var(--spacing-gutter))]
          max-md:px-[var(--spacing-gutter)] max-md:pb-0.5
          md:gap-[clamp(18px,2.5vw,36px)]
        "
      >
        {links.map((link) => {
          const active = link.href === pathname || (link.href !== "/" && pathname.startsWith(`${link.href}/`));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex items-center coarse:min-h-11 ${
                active ? "font-bold text-moss-deep" : "text-midnight hover:text-moss-deep"
              }`}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {cta !== "none" && (
        <div className="flex shrink-0 items-center gap-[clamp(10px,1.4vw,16px)] max-md:order-2">
          {(cta === "cart" || cta === "both") && <CartLink strong={pathname === "/cart"} />}
          {(cta === "shop" || cta === "both") && (
            <Link href="/shop" className="btn btn-dark btn-sm whitespace-nowrap max-[400px]:hidden">
              Shop now
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}

/** Checkout chrome: logo, back-to-cart, secure badge. */
export function CheckoutNav() {
  return (
    <nav className="px-safe flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-moss-tint py-3.5">
      <Logo />
      <Link
        href="/cart"
        className="order-3 inline-flex items-center text-[clamp(13px,1.1vw,14px)] font-semibold text-muted hover:text-midnight coarse:min-h-11 max-sm:w-full sm:order-none"
      >
        ← Back to cart
      </Link>
      <div className="order-2 flex shrink-0 items-center gap-[7px] text-[13px] text-muted sm:order-none">
        <Icon name="lock" size={15} strokeWidth={1.6} /> Secure checkout
      </div>
    </nav>
  );
}

/** Confirmation chrome: centred logo only. */
export function MinimalNav() {
  return (
    <nav className="px-safe flex items-center justify-center border-b border-moss-tint py-3.5">
      <Logo />
    </nav>
  );
}
