"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { useCart, inr } from "@/lib/cart";
import { useCartUI } from "@/lib/cart-ui";
import { useQuote } from "@/lib/quote";

/**
 * The bag, as a slide-over.
 *
 * Adding to the cart used to be silent. The line went to the server, the badge
 * in the nav ticked over, and that was the whole acknowledgement — on the PDP
 * and in the size finder there was not even that, because those controls sit
 * far from the nav. A shopper pressed "Add to cart" and the page did not visibly
 * move, so the reasonable next action was to press it again.
 *
 * This is Femi9's `CartDrawer` on Lumi9's tokens, and its accessibility
 * behaviour is copied deliberately rather than re-derived:
 *
 *  - **`inert` while closed**, not just `aria-hidden`. A closed drawer still has
 *    a dozen controls in the DOM; `aria-hidden` alone leaves every one of them
 *    in the tab order, announced as nothing, off-screen.
 *  - **Tab is contained.** `aria-modal="true"` is a promise that focus cannot
 *    leave, and nothing enforces it for you.
 *  - **The scroll lock pins the body on coarse pointers.** iOS Safari does not
 *    honour `body{overflow:hidden}`: once the panel hits its scroll end the
 *    gesture chains through to the page behind it, and closing the drawer
 *    leaves the shopper somewhere else entirely. Only `position:fixed` holds
 *    there, and it is restricted to coarse pointers because that is where the
 *    bug is.
 *
 * Totals are the SERVER's, through `useQuote()` — including the free-shipping
 * threshold. There is no arithmetic in this file, on purpose: the meter used to
 * be the last place a hardcoded ₹999 could hide.
 */
export function CartDrawer() {
  const { lines, count, subtotal, increment, decrement, remove, ready } = useCart();
  const { open, closeCart } = useCartUI();
  const { quote } = useQuote();

  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const isEmpty = lines.length === 0;

  // Move focus into the panel on open so keyboard and screen-reader users land
  // on the drawer rather than being left behind it; restore it on close.
  useEffect(() => {
    if (open) {
      lastFocused.current = document.activeElement as HTMLElement | null;
      closeRef.current?.focus();
    } else if (lastFocused.current) {
      lastFocused.current.focus?.();
      lastFocused.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCart();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const inside = active instanceof Node && panel.contains(active);

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    const body = document.body;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width };

    body.style.overflow = "hidden";
    if (coarse) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
    }

    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = "";
      if (coarse) {
        body.style.position = previous.position;
        body.style.top = previous.top;
        body.style.width = previous.width;
        // Pinning the body scrolled the document to 0. Put her back.
        window.scrollTo(0, scrollY);
      }
    };
  }, [open, closeCart]);

  // Progress toward free delivery. `quote` is null until the first server
  // response lands, and the meter simply does not render until then — a bar
  // drawn against a guessed threshold is the bug this replaced.
  const threshold = quote?.freeShipThreshold ?? 0;
  const away = threshold - subtotal;
  const pct = threshold > 0 ? Math.min(100, Math.round((subtotal / threshold) * 100)) : 100;

  return (
    <>
      {/* Scrim. Always mounted so it can transition, click-through disabled
          while closed — a full-screen invisible overlay eats every click on the
          page behind it otherwise. */}
      <div
        onClick={closeCart}
        aria-hidden
        className={`fixed inset-0 z-110 bg-midnight/45 transition-opacity duration-300 ease-[var(--ease-reveal)] ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-120 flex w-[min(100vw,420px)] flex-col bg-paper shadow-[0_0_60px_-10px_rgb(39_44_5_/_0.45)] transition-transform duration-350 ease-[var(--ease-reveal)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* HEAD */}
        <div className="flex shrink-0 items-center justify-between gap-3 bg-moss-deep px-[clamp(16px,4vw,24px)] py-4.5 text-butter">
          <div className="flex items-center gap-2.5">
            <Icon name="bag" size={21} strokeWidth={1.7} />
            <h2 className="m-0 font-display text-[clamp(18px,2vw,21px)] font-normal">Your bag</h2>
            <span className="inline-flex h-5.5 min-w-5.5 items-center justify-center rounded-full bg-butter px-1.5 text-xs font-bold text-midnight">
              {ready ? count : 0}
            </span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeCart}
            aria-label="Close bag"
            className="-mr-1.5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-butter transition-colors hover:bg-butter/15"
          >
            <Icon name="close" size={20} strokeWidth={1.9} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-[clamp(16px,4vw,24px)] py-5">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="inline-flex size-16 items-center justify-center rounded-full bg-moss-tint text-moss-deep">
                <Icon name="bag" size={28} strokeWidth={1.6} />
              </span>
              <div>
                <h3 className="m-0 mb-1.5 font-display text-[21px] font-normal">Your bag is empty</h3>
                <p className="m-0 text-sm text-muted">Cloud Soft comfort is one tap away.</p>
              </div>
              <Link href="/shop" onClick={closeCart} className="btn btn-dark font-bold">
                Shop baby diapers
              </Link>
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
              {lines.map((line) => (
                <li
                  key={line.key}
                  className="flex gap-3.5 rounded-card border border-moss-tint bg-canvas p-3"
                >
                  <div className="relative size-[72px] shrink-0 overflow-hidden rounded-chip bg-shell">
                    <Image
                      src={line.image}
                      alt=""
                      fill
                      sizes="72px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-[15px] font-bold text-midnight">{line.name}</p>
                        <p className="m-0 text-xs text-muted">
                          {line.count} pcs · fits {line.fits}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(line.key)}
                        aria-label={`Remove ${line.name} from your bag`}
                        className="-mt-1 -mr-1 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-moss-tint hover:text-midnight"
                      >
                        <Icon name="close" size={15} strokeWidth={1.9} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <QtyStepper
                        qty={line.qty}
                        size="sm"
                        label={`Quantity for ${line.name}`}
                        onChange={(next) =>
                          next > line.qty ? increment(line.key) : decrement(line.key)
                        }
                      />
                      <span className="text-[15px] font-bold whitespace-nowrap">
                        {inr(line.lineTotal)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* FOOT */}
        {!isEmpty && (
          <div className="shrink-0 border-t border-moss-tint bg-canvas px-[clamp(16px,4vw,24px)] py-5">
            {quote && threshold > 0 && (
              <div className="mb-4">
                <p className="m-0 mb-2 text-[13px] text-muted">
                  {away > 0 ? (
                    <>
                      Add <b className="text-midnight">{inr(away)}</b> more for free delivery
                    </>
                  ) : (
                    <span className="font-semibold text-moss-deep">
                      You have unlocked free delivery
                    </span>
                  )}
                </p>
                <div className="h-1.5 overflow-hidden rounded-pill bg-moss-tint" role="presentation">
                  <span
                    className="block h-full rounded-pill bg-moss-deep transition-[width] duration-500 ease-[var(--ease-reveal)]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span className="font-bold">{inr(subtotal)}</span>
            </div>
            {quote && quote.discount > 0 && (
              <div className="mb-1 flex items-center justify-between text-sm text-moss-deep">
                <span>Discount{quote.couponCode ? ` · ${quote.couponCode}` : ""}</span>
                <span className="font-bold">−{inr(quote.discount)}</span>
              </div>
            )}
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-muted">Delivery</span>
              <span className="text-muted">
                {/* Never a number this bundle worked out — either the server's
                    figure, or an honest "at checkout" while it is unknown. */}
                {quote ? (quote.shipping === 0 ? "Free" : inr(quote.shipping)) : "Calculated at checkout"}
              </span>
            </div>

            <Link href="/checkout" onClick={closeCart} className="btn btn-dark w-full font-bold">
              Checkout{quote ? ` · ${inr(quote.total)}` : ""}
            </Link>
            <div className="mt-3 flex items-center justify-center gap-4 text-[13px]">
              <Link
                href="/cart"
                onClick={closeCart}
                className="font-semibold text-midnight underline underline-offset-2"
              >
                View bag
              </Link>
              <button
                type="button"
                onClick={closeCart}
                className="cursor-pointer text-muted underline underline-offset-2 hover:text-midnight"
              >
                Continue shopping
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
