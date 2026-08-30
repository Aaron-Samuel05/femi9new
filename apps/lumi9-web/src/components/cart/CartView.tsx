"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { QtyStepper } from "@/components/ui/QtyStepper";
import { CheckoutCta } from "@/components/cart/CheckoutCta";
import { Icon } from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { useQuote } from "@/lib/quote";
import { inr, shippingLabel } from "@/lib/catalog";

/**
 * The promo box, now connected to the coupon system that was already there.
 *
 * It used to answer EVERY code with a hardcoded "isn't a valid code right now"
 * and call nothing — while the console has had a full coupons section, and
 * `placeOrder` has had the redemption logic, since before this storefront
 * existed. Every campaign code the team created was unredeemable, and the one
 * screen that would have shown it said so in a sentence that was true by
 * construction rather than by checking.
 *
 * Submitting hands the code to the quote provider, which asks the server what
 * it is worth against THIS basket and this shopper. The code then rides through
 * to /api/checkout, where it is re-validated and its use atomically claimed.
 */
function PromoField() {
  const { quote, loading, coupon, applyCoupon } = useQuote();
  const [code, setCode] = useState("");

  const applied = quote?.couponCode;
  const error = quote?.couponError;

  return (
    <form
      className="mb-5.5"
      onSubmit={(event) => {
        event.preventDefault();
        applyCoupon(code);
      }}
    >
      <div className="flex rounded-pill border border-moss-tint bg-paper p-1.25 pl-4.5">
        <label htmlFor="promo" className="sr-only">
          Promo code
        </label>
        <input
          id="promo"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Promo code"
          className="min-w-0 flex-1 border-none bg-transparent text-[max(16px,0.95rem)] text-midnight outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="chip shrink-0 cursor-pointer border-transparent bg-moss-tint font-bold text-midnight hover:bg-moss-soft disabled:opacity-60"
        >
          {loading ? "Checking…" : "Apply"}
        </button>
      </div>
      {applied && (
        <p className="m-0 mt-2 text-xs text-moss-deep">
          “{applied}” applied — {inr(quote!.discount)} off.{" "}
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={() => {
              setCode("");
              applyCoupon("");
            }}
          >
            Remove
          </button>
        </p>
      )}
      {/* Only shown once a code has actually been submitted and refused. */}
      {!applied && coupon && error && <p className="m-0 mt-2 text-xs text-muted">{error}</p>}
    </form>
  );
}

export function CartView() {
  const { lines, count, subtotal, increment, decrement, remove, ready } = useCart();
  // Shipping and total come from the server — the same calculation that will
  // price the order — rather than from a threshold hardcoded in this bundle.
  const { quote } = useQuote();

  return (
    <section className="px-safe mx-auto max-w-[1180px] pt-[clamp(32px,4.4vw,56px)] pb-section">
      <h1 className="m-0 mb-2 font-display text-[clamp(28px,8vw,52px)] md:text-[clamp(32px,4vw,52px)] font-normal">Your cart</h1>
      <p className="m-0 mb-10 text-base text-muted">
        {ready ? count : 0} {count === 1 ? "item" : "items"} · free delivery on orders over ₹999
      </p>

      {!ready ? (
        <div className="h-40 animate-pulse rounded-3xl bg-canvas" aria-hidden />
      ) : lines.length === 0 ? (
        <div className="panel px-[clamp(16px,3vw,24px)] py-[clamp(48px,8vw,80px)] text-center">
          <div className="mb-3 font-display text-[26px]">Your cart is empty</div>
          <p className="m-0 mb-6.5 text-base text-muted">Let&apos;s find the perfect fit for your little one.</p>
          <Link href="/shop" className="btn btn-dark font-bold">
            Shop Cloud Soft
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] lg:grid-cols-[1fr_minmax(300px,380px)]">
          <div className="flex flex-col gap-4">
            {lines.map((line) => (
              <div
                key={line.key}
                className="flex flex-col gap-[clamp(12px,2vw,20px)] rounded-card border border-moss-tint bg-canvas p-[clamp(12px,1.6vw,18px)] min-[420px]:flex-row"
              >
                <div className="relative size-[clamp(76px,11vw,104px)] shrink-0 overflow-hidden rounded-chip bg-shell">
                  <Image src={line.image} alt={`Cloud Soft ${line.name}`} fill sizes="104px" className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col gap-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="text-[clamp(15px,1.5vw,17px)] font-bold">Cloud Soft — {line.name}</div>
                      <div className="mt-0.75 text-[13px] text-muted">
                        {line.count} pants · fits {line.fits}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(line.key)}
                      className="-mr-1 inline-flex h-fit cursor-pointer items-center coarse:min-h-11 px-1 text-[13px] text-muted hover:text-midnight"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                    <QtyStepper
                      qty={line.qty}
                      size="sm"
                      label={`Quantity for Cloud Soft ${line.name}`}
                      onChange={(next) => (next > line.qty ? increment(line.key) : decrement(line.key))}
                    />
                    <div className="font-display text-[clamp(18px,2vw,22px)] text-midnight">{inr(line.lineTotal)}</div>
                  </div>
                </div>
              </div>
            ))}
            <Link href="/shop" className="mt-1.5 inline-flex items-center coarse:min-h-11 text-[15px] font-semibold text-moss-deep hover:text-midnight">
              ← Continue shopping
            </Link>
          </div>

          <div className="panel p-card lg:sticky lg:top-24">
            <h2 className="m-0 mb-5.5 font-display text-2xl font-normal">Order summary</h2>
            <div className="mb-5 flex flex-col gap-3.5 text-[15px]">
              <div className="flex justify-between">
                <span className="text-muted">Subtotal</span>
                <span className="font-semibold">{inr(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Shipping</span>
                <span className="font-semibold text-moss-deep">
                  {quote ? shippingLabel(quote.shipping) : "Calculating…"}
                </span>
              </div>
              {/* Only rendered when there IS one. The row used to be permanent
                  and permanently "₹0", which is a line item for a discount this
                  storefront cannot yet apply. */}
              {quote && quote.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted">Discount</span>
                  <span className="font-semibold text-moss-deep">−{inr(quote.discount)}</span>
                </div>
              )}
            </div>

            <PromoField />

            <div className="mb-5.5 flex items-baseline justify-between border-t border-moss-tint pt-4.5">
              <span className="text-[17px] font-bold">Total</span>
              <span className="font-display text-[clamp(24px,2.8vw,30px)] text-midnight">
                {quote ? inr(quote.total) : inr(subtotal)}
              </span>
            </div>

            <CheckoutCta className="btn btn-dark w-full font-bold" />
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <Icon name="lock" size={14} strokeWidth={1.6} /> Secure checkout · easy 30-day returns
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
