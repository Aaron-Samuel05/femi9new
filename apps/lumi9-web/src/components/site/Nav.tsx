"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
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

/** Secondary destinations that only earn a slot inside the mobile sheet. */
const MENU_EXTRAS: NavLink[] = [
  { label: "Size guide", href: "/size-guide" },
  { label: "Subscription", href: "/subscription" },
  { label: "Help", href: "/help" },
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

function CartLink({ strong = false, compact = false }: { strong?: boolean; compact?: boolean }) {
  const { count, ready } = useCart();

  return (
    <Link
      href="/cart"
      className={`flex shrink-0 items-center gap-[7px] text-[clamp(13px,1.1vw,14px)] coarse:min-h-11 ${
        strong ? "font-bold text-moss-deep" : "font-semibold text-midnight hover:text-moss-deep"
      }`}
      aria-label={`Cart, ${ready ? count : 0} items`}
    >
      <Icon name="cart" size={compact ? 22 : 19} strokeWidth={1.6} />
      {/* Beside the burger the word is redundant — the icon and the count badge
          carry it, and the row has to stay one line at 320px. */}
      <span className={compact ? "sr-only" : "max-[359px]:sr-only"}>Cart</span>
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
 * Below `md` the links collapse behind a burger into a slide-down sheet, so the
 * bar stays ONE ~64px row at every width. It used to wrap them onto a second,
 * horizontally-scrolling line: 118px of permanently-fixed chrome on an 844px
 * phone, with the last link half off-screen and nothing to say it scrolled.
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
  const [open, setOpen] = useState(false);
  const menuId = useId();
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

  // A route change has to close the sheet — including navigations the sheet did
  // not start (the cart icon, browser back). Adjusted during render rather than
  // in an effect: an effect would paint the new route with the menu still over
  // it for a frame, and `react-hooks/set-state-in-effect` rejects it outright.
  // Same-page hash links (#tech, #sizes) never change `pathname`, so those close
  // in the click handler instead.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  /**
   * While the sheet is open: Escape dismisses it, and the page behind stops
   * scrolling. Without the lock a flick on the backdrop scrolls the page under
   * the sheet, which — anchored to a fixed bar — then appears to float over
   * moving content.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Anything wider than the bar shows the links inline, so a phone rotated into
  // landscape (or a resized window) must not keep an orphaned overlay.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const chrome = isHome
    ? scrolled || open
      ? "bg-paper/90 backdrop-blur-[14px] shadow-[0_1px_0_rgb(39_44_5_/_0.08)] md:py-3"
      : "bg-transparent md:py-[18px]"
    : "bg-paper/90 backdrop-blur-[14px] shadow-[0_1px_0_rgb(39_44_5_/_0.08)] md:py-4";

  const isActive = (href: string) => href === pathname || (href !== "/" && pathname.startsWith(`${href}/`));

  // Everything the burger reveals: the bar's own links, then the destinations
  // that never fit in it. Deduped, so a page whose list already names one
  // (SUPPORT_LINKS carries /help) doesn't show it twice.
  const menuLinks = [...links, ...MENU_EXTRAS.filter((extra) => !links.some((link) => link.href === extra.href))];

  const bar = (
    <nav
      ref={ref}
      className={`px-safe z-100 flex items-center justify-between gap-x-3 py-2.5 transition-[background-color,box-shadow,padding] duration-400 ease-out ${chrome} ${
        isHome ? "fixed inset-x-0 top-0" : "sticky top-0"
      }`}
    >
      <Logo />

      {/* Desktop link row */}
      <div className="hidden items-center gap-[clamp(18px,2.5vw,36px)] text-[clamp(13px,1.15vw,15px)] font-medium md:flex">
        {links.map((link) => {
          const active = isActive(link.href);
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

      <div className="flex shrink-0 items-center gap-[clamp(10px,1.4vw,16px)]">
        {/* On a phone the bar is always [logo][cart][burger]: the burger already
            carries the shop CTA, so `cta` only decides the DESKTOP right-hand
            side. Under the old rule every `cta="shop"` page — subscription,
            journal, help, about, login — left a shopper with items in the
            basket no way to reach it without going back to the home page. */}
        {cta !== "none" && (
          <span className="md:hidden">
            <CartLink strong={pathname === "/cart"} compact />
          </span>
        )}
        {(cta === "cart" || cta === "both") && (
          <span className="max-md:hidden">
            <CartLink strong={pathname === "/cart"} />
          </span>
        )}
        {(cta === "shop" || cta === "both") && (
          <Link href="/shop" className="btn btn-dark btn-sm whitespace-nowrap max-md:hidden">
            Shop now
          </Link>
        )}

        {/* Burger — the only route to the nav below md, so it is a full 44px target. */}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close menu" : "Open menu"}
          className="-mr-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-midnight transition-colors hover:bg-midnight/6 md:hidden"
        >
          <Icon name={open ? "close" : "menu"} size={22} strokeWidth={1.8} />
        </button>
      </div>

      {/* Slide-down sheet. `inert` while closed so its links stay out of the tab
          order and the accessibility tree — a hidden panel a keyboard can still
          walk into is worse than no panel at all. */}
      <div
        id={menuId}
        inert={!open}
        className={`absolute inset-x-0 top-full border-b border-moss-tint bg-paper shadow-[0_18px_30px_-24px_rgb(39_44_5_/_0.45)] transition-[opacity,transform] duration-300 ease-[var(--ease-reveal)] md:hidden ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        <div className="px-safe flex max-h-[min(70svh,540px)] flex-col overflow-y-auto py-1">
          {menuLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center border-b border-moss-tint/60 text-[16px] ${
                  active ? "font-bold text-moss-deep" : "font-medium text-midnight"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/shop" onClick={() => setOpen(false)} className="btn btn-dark my-3 w-full">
            Shop baby diapers →
          </Link>
        </div>
      </div>

    </nav>
  );

  return (
    <>
      {bar}
      {/* Scrim — a tap anywhere off the sheet dismisses it. A SIBLING of the bar,
          not a child: inside the nav its negative z-index put it behind that
          element's backdrop root and it never painted at all. z-90 sits under
          the bar (z-100) and over the page. */}
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-x-0 top-[var(--nav-h,64px)] bottom-0 z-90 cursor-default bg-midnight/35 md:hidden"
        />
      )}
    </>
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
