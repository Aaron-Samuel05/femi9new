"use client";

import { useId, useState } from "react";
import { useQuote } from "@/lib/quote";
import { inr } from "@/lib/catalog";

/**
 * The promo box, connected to the coupon system that was already there.
 *
 * It used to answer EVERY code with a hardcoded "isn't a valid code right now"
 * and call nothing - while the console has had a full coupons section, and
 * `placeOrder` has had the redemption logic, since before this storefront
 * existed. Every campaign code the team created was unredeemable, and the one
 * screen that would have shown it said so in a sentence that was true by
 * construction rather than by checking.
 *
 * Submitting hands the code to the quote provider, which asks the server what
 * it is worth against THIS basket and this shopper. The code then rides through
 * to /api/checkout, where it is re-validated and its use atomically claimed.
 *
 * ── Why this is a component and not JSX in the cart ─────────────────────────
 * It lived inside CartView, which meant /cart was the ONLY place a code could
 * be entered. A shopper who reached /checkout with a code in hand - from an
 * email, an influencer, the banner on the home page - had to navigate BACK to
 * the cart to use it, and nothing on that screen said so. The discount row and
 * the `couponCode` the checkout form submits were both already wired up; only
 * the input was missing. QuoteProvider is mounted in the ROOT layout, so
 * `applyCoupon` was already in scope on every screen this renders on.
 *
 * ── Why this is a <div> and not a <form> ────────────────────────────────────
 * Because the checkout summary lives INSIDE the checkout's own <form>, and a
 * nested <form> is not something HTML has. The parser drops the inner tag
 * outright, which would leave an "Apply" button that is `type="submit"` for the
 * OUTER form - so applying a coupon would place the order. The same applies to
 * pressing Enter in the input, which is why that key is intercepted here rather
 * than left to the browser's implicit submission. The cart does not need any of
 * this; checkout cannot work without it, and one component that is safe in both
 * places beats a prop that has to be remembered at the second call site.
 */
export function PromoField({ className = "" }: { className?: string }) {
  const { quote, loading, coupon, applyCoupon } = useQuote();
  const [code, setCode] = useState("");
  // Two screens render this now, and the cart drawer sits over both of them. A
  // hardcoded id would be a duplicate the moment any two coexist, which
  // silently breaks the label association for anyone on a screen reader.
  const inputId = useId();

  const applied = quote?.couponCode;
  const error = quote?.couponError;

  const submit = () => {
    if (loading) return;
    applyCoupon(code);
  };

  return (
    <div
      // The line items carry their own "Remove" button, so the promo box needs
      // a handle of its own for anything driving this page.
      data-testid="promo-form"
      className={className}
    >
      <div className="flex rounded-pill border border-moss-tint bg-paper p-1.25 pl-4.5">
        <label htmlFor={inputId} className="sr-only">
          Promo code
        </label>
        <input
          id={inputId}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // Without this the keypress reaches the checkout form and places
            // the order. Applying a coupon is what Enter means in this box.
            event.preventDefault();
            submit();
          }}
          placeholder="Promo code"
          className="min-w-0 flex-1 border-none bg-transparent text-[max(16px,0.95rem)] text-midnight outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="chip shrink-0 cursor-pointer border-transparent bg-moss-tint font-bold text-midnight hover:bg-moss-soft disabled:opacity-60"
        >
          {loading ? "Checking…" : "Apply"}
        </button>
      </div>
      {applied && (
        <p className="m-0 mt-2 text-xs text-moss-deep">
          “{applied}” applied - {inr(quote!.discount)} off.{" "}
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
    </div>
  );
}
