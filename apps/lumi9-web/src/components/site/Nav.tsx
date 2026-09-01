"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useCart } from "@/lib/cart";
import { useCartUI } from "@/lib/cart-ui";
import { firstNameOf, initialsOf, useSession } from "@/lib/auth-context";
import { Icon } from "@/components/ui/Icon";

export type NavLink = { label: string; href: string };

/*
 * ONE list. Not three, and certainly not the seven this started with.
 *
 * It was seven - PRIMARY, HOME, SUPPORT, ABOUT, HELP, SUBSCRIPTION and AUTH -
 * each declared in the page that used it and each a near-copy of the others.
 * That is why /parenting-tools appeared in the nav on exactly one page, and why
 * three of them still carried a static "Account" link after it was removed.
 * Collapsing seven to three did not fix the underlying problem, it only made it
 * rarer: the bar still CHANGED AS YOU BROWSED. Opening /parenting-tools swapped
 * "Technology" and "Find your size" out for "About", "Help" and "Contact", so
 * the destination a shopper had just been using vanished mid-session. A primary
 * nav that is stable everywhere is worth more than one tuned per page.
 *
 * Support destinations are not lost: About and Contact live in the footer, and
 * Size guide, Subscription and Help are in MENU_EXTRAS for the mobile sheet.
 *
 * The two hash links resolve against the home page from anywhere, so off-home
 * they read as "go home, then scroll" rather than dead-ending.
 *
 * "Account" is deliberately absent. It was a fixed label pointing at /account
 * whether or not anybody was signed in, so a signed-out shopper who tapped it
 * was bounced to /login by the guard with no explanation. The avatar in the bar
 * resolves the session and points at the right one of the two - a control that
 * adapts cannot be a constant in an array.
 */
export const NAV_LINKS: NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "Technology", href: "/#tech" },
  { label: "Find your size", href: "/#sizes" },
  { label: "Parenting", href: "/parenting-tools" },
  { label: "Journal", href: "/journal" },
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
        src="/assets/logo-midnight.webp"
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

/**
 * The bag control. A BUTTON that opens the drawer, not a link to /cart.
 *
 * /cart is still a real page - it owns the promo box and the roomier review
 * layout, and the drawer links to it - but "open the bag" should not cost a
 * navigation away from the product a shopper is looking at. That round trip is
 * what made adding a second size feel like starting over.
 *
 * On the /cart page itself the control links instead: opening a slide-over copy
 * of the page you are already reading is a dead end.
 */
function CartButton() {
  const { count, ready } = useCart();
  const { openCart } = useCartUI();
  const pathname = usePathname();
  const onCartPage = pathname === "/cart";

  /*
   * Icon and count, in the same 44px slot as the avatar. The word "Cart" that
   * used to sit beside it is gone for the same reason the shopper's name is:
   * text of unpredictable width in a fixed row pushes everything around it, and
   * a bag icon with a number on it is not ambiguous.
   *
   * The badge is absolutely positioned so the button's box never changes - a
   * count going from 9 to 10 used to widen the control and shift the burger.
   * It renders only when there is something in the bag; a permanent "0" is a
   * notification badge announcing no notifications.
   */
  const inner = (
    <span
      className={`relative flex size-9 items-center justify-center rounded-full transition-colors ${
        onCartPage ? "bg-midnight text-butter" : "text-midnight hover:bg-midnight/6"
      }`}
    >
      <Icon name="cart" size={21} strokeWidth={1.6} />
      {ready && count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gold px-1 text-[11px] font-bold text-midnight">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );

  const shell = "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full";
  const label = `${onCartPage ? "Your bag" : "Open bag"}, ${ready ? count : 0} items`;

  // On /cart the slide-over would be a copy of the page already open, so the
  // control links instead of opening it.
  return onCartPage ? (
    <Link href="/cart" className={shell} aria-label={label}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={openCart} className={shell} aria-label={label}>
      {inner}
    </button>
  );
}

/**
 * The account entry point - the thing the site had no way to reach.
 *
 * /login and /account both existed and neither was linked from the bar: the
 * only route to either was typing the URL, or being bounced to /login by the
 * guard. The destination follows the session, exactly as Femi9's does, and an
 * unresolved or failed /api/auth/me leaves it pointing at /login - the harmless
 * wrong answer.
 */
function AccountLink() {
  const { user, ready } = useSession();
  const pathname = usePathname();
  const signedIn = ready && user !== null;
  const href = signedIn ? "/account" : "/login";
  const name = firstNameOf(user);
  const initials = initialsOf(user);
  const active = pathname === href;

  /*
   * An initials avatar, the WhatsApp convention - not the shopper's name in
   * text.
   *
   * A name is unbounded: "Lakshminarayanan" is 16 characters that push the
   * cart, the burger and the whole right-hand group around, and it changes
   * width the moment /api/auth/me resolves, which is half of what made this bar
   * feel like it was moving. Two letters in a fixed 36px circle cannot do
   * either - the slot is the same size signed in, signed out, and while the
   * session is still loading.
   *
   * The name has not gone anywhere; it is the accessible label, and the mobile
   * sheet still greets her by it.
   */
  return (
    <Link
      href={href}
      aria-label={signedIn ? (name ? `My account, signed in as ${name}` : "My account") : "Sign in"}
      aria-current={active ? "page" : undefined}
      className="flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        className={`flex size-9 items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
          signedIn
            ? active
              ? "bg-midnight text-butter"
              : "bg-moss-deep text-butter hover:bg-midnight"
            : "border-[1.5px] border-moss-tint text-midnight hover:border-moss-soft"
        }`}
      >
        {/* Signed in with nothing to spell - a link/OTP account before /welcome
            - falls back to the outline icon rather than an empty circle, which
            reads as an avatar that failed to load. */}
        {signedIn && initials ? initials : <Icon name="user" size={18} strokeWidth={1.7} />}
      </span>
    </Link>
  );
}

/** The signed-in / signed-out rows at the foot of the mobile sheet. */
function AccountSheetLinks({ onNavigate }: { onNavigate: () => void }) {
  const { user, ready, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const name = firstNameOf(user);

  const row =
    "flex min-h-12 items-center gap-3 border-b border-moss-tint/60 text-[16px] font-medium text-midnight";

  // Hold still until the session resolves: flashing "Sign in" at somebody who
  // is signed in, then swapping it for their name, reads as a logout.
  if (!ready) return <span className={`${row} text-muted`} aria-hidden />;

  if (!user) {
    return (
      <Link href="/login" onClick={onNavigate} className={row}>
        <Icon name="user" size={19} strokeWidth={1.7} />
        Sign in
      </Link>
    );
  }

  return (
    <>
      <Link href="/account" onClick={onNavigate} className={row}>
        <Icon name="user" size={19} strokeWidth={1.7} />
        {name ? `Hi, ${name}` : "My account"}
      </Link>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut();
        }}
        className={`${row} cursor-pointer text-left text-muted disabled:opacity-60`}
      >
        <Icon name="logout" size={19} strokeWidth={1.7} />
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </>
  );
}

/**
 * FIXED site nav - the same bar, in the same place, with the same surface, on
 * every route and at every scroll position.
 *
 * It used to be two bars. On the home page it was fixed and TRANSPARENT over the
 * hero, then swapped to blurred paper past 30px of scroll; everywhere else it was
 * `sticky` and always paper. So the chrome you were looking at depended on which
 * page you were on and how far down it you had scrolled - the bar changed under
 * the cursor mid-gesture, and a link's contrast changed with it. `variant` now
 * decides one thing only: whether the page pads itself under the bar (the home
 * hero does, by `--nav-h`) or gets the spacer below.
 *
 * Below `md` the links collapse behind a burger into a slide-down sheet, so the
 * bar stays ONE ~64px row at every width. It used to wrap them onto a second,
 * horizontally-scrolling line: 118px of permanently-fixed chrome on an 844px
 * phone, with the last link half off-screen and nothing to say it scrolled.
 */
export function Nav({
  links = NAV_LINKS,
  variant = "solid",
}: {
  links?: NavLink[];
  variant?: "solid" | "home";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const isHome = variant === "home";
  // Measured on every variant, not just home: --nav-h is what the global
  // scroll-padding-top in globals.css offsets anchor landings by, and the
  // sticky nav on the inner pages is exactly as tall as the fixed one.
  const ref = useMeasuredNavHeight(true);

  // A route change has to close the sheet - including navigations the sheet did
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
   * the sheet, which - anchored to a fixed bar - then appears to float over
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

  /*
   * NOTHING about the bar responds to scroll - not its height, not its surface.
   *
   * The height went first: the home bar used to transition its padding from 18px
   * to 12px past 30px of scroll, so the whole bar shrank under the cursor and
   * every link in it moved. That was also quietly wrong - `--nav-h` is published
   * by a ResizeObserver on this element and is what `scroll-padding-top` in
   * globals.css offsets every in-page anchor by, so a bar whose height depends on
   * scroll position gave a different answer depending on where you were standing
   * when you clicked, and a `#tech` landing missed by 6px.
   *
   * The surface follows it for the same reason. Paper-over-hero costs a shade of
   * the gradient at the very top of one page; a bar that is transparent until you
   * move and opaque after costs you the ability to trust what you are pointing at
   * - the link you read as dark-on-gradient is dark-on-paper by the time your
   * finger lands. One constant, everywhere.
   */
  const chrome = "bg-paper/90 backdrop-blur-[14px] shadow-[0_1px_0_rgb(39_44_5_/_0.08)]";

  const isActive = (href: string) => href === pathname || (href !== "/" && pathname.startsWith(`${href}/`));

  // Everything the burger reveals: the bar's own links, then the destinations
  // that never fit in it. Deduped, so a page whose list already names one
  // (NAV_LINKS has no /help) doesn't show it twice.
  const menuLinks = [...links, ...MENU_EXTRAS.filter((extra) => !links.some((link) => link.href === extra.href))];

  const bar = (
    <nav
      ref={ref}
      className={`fixed inset-x-0 top-0 z-100 ${chrome}`}
    >
      {/*
       * FULL WIDTH, gutter only - logo hard left, account and bag hard right.
       *
       * Not the centred content column. The hero underneath is `px-safe` with
       * no max-width, so "CloudSoft Baby Diapers" starts one gutter from the
       * viewport edge; a nav centred in a 1240 column put the logo a further
       * 48px inside that, which read as the bar being indented from the page
       * rather than framing it.
       *
       * So the two things that flank the page - this bar and the hero - share
       * the viewport's edges, and the reading column inside is centred within
       * them. Deliberate, and the reason a section's heading does not line up
       * with the logo above it.
       */}
      <div className="px-safe flex items-center justify-between gap-x-3 py-2.5 md:py-3.5">
        <Logo />

        {/* Desktop link row */}
        <div className="hidden items-center gap-[clamp(16px,2.2vw,32px)] text-[clamp(13px,1.15vw,15px)] font-medium md:flex">
          {links.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`inline-flex items-center whitespace-nowrap coarse:min-h-11 ${
                  active ? "font-bold text-moss-deep" : "text-midnight hover:text-moss-deep"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/*
         * Two controls, at every width: account, then bag.
         *
         * The "Shop now" button that used to sit here is gone. It was a fifth
         * competing target in a bar that already had a Shop LINK two inches to
         * its left, and being the only filled button on the page it outweighed
         * both the account and the cart - the two controls a returning shopper
         * actually comes to the bar for. Selling is what the page is for; the
         * bar is for navigation.
         *
         * Dropping it also removed the reason `cta` existed. That prop decided
         * which of four combinations the right-hand side showed, and every page
         * picked one by hand - which is how `cta="shop"` pages ended up with no
         * route to the basket at all.
         */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <AccountLink />
          <CartButton />

          {/* Burger - the only route to the nav below md, so a full 44px target. */}
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
      </div>

      {/* Slide-down sheet. `inert` while closed so its links stay out of the tab
          order and the accessibility tree - a hidden panel a keyboard can still
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
          {/* The session block. Signing out had no control anywhere in the
              storefront - /api/auth/logout existed with exactly one caller, on
              a page you had to already be signed in to reach. */}
          <AccountSheetLinks onNavigate={() => setOpen(false)} />
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
      {/*
       * The bar is out of flow on every route now, so every route that does not
       * deliberately sit UNDER it needs its height back. The home hero pads itself
       * by `--nav-h` (it wants the gradient to run the full viewport); everything
       * else gets this.
       *
       * The fallbacks are the bar's real closed heights - 44px of control plus
       * py-2.5 / md:py-3.5 - not a round guess, so the first paint is already
       * right and the measured `--nav-h` that lands a frame later changes nothing.
       */}
      {!isHome && <div aria-hidden className="h-[var(--nav-h,64px)] md:h-[var(--nav-h,72px)]" />}
      {/* Scrim - a tap anywhere off the sheet dismisses it. A SIBLING of the bar,
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
