"use client";

import Image from "next/image";
import Link from "next/link";
import {
  loadRazorpayScript,
  postVerify,
  type PaymentIntent,
} from "@/lib/razorpay-client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useQuote } from "@/lib/quote";
import { inr, shippingLabel } from "@/lib/catalog";

function Fieldset({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-9.5 border-none p-0">
      <legend className="mb-4.5 text-[13px] font-bold tracking-[0.1em] text-moss-deep">
        {step} · {title.toUpperCase()}
      </legend>
      {children}
    </fieldset>
  );
}

export function CheckoutForm() {
  const router = useRouter();
  const { lines, subtotal, ready } = useCart();
  // The same quote the cart showed, from the same provider — including any
  // coupon the shopper applied there. Nothing on this screen computes a total.
  const { quote } = useQuote();
  const [firstName, setFirstName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const isEmpty = ready && lines.length === 0;
  const total = quote?.total ?? subtotal;

  /**
   * Place the order, then take payment.
   *
   * The server recomputes every total from the database, so nothing here sends
   * a price. Whatever happens to the payment, the shopper ends up on the order
   * page, which reads the true status — a verify hiccup shows "pending" rather
   * than a lie, and the webhook can still finalise it.
   */
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isEmpty || submitting) return;

    const data = new FormData(event.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    const line2 = get("line2");

    setSubmitting(true);
    setFormError(null);
    setNote(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: [get("firstName"), get("lastName")].filter(Boolean).join(" "),
          phone: get("phone"),
          email: get("email") || undefined,
          line: line2 ? `${get("line")}, ${line2}` : get("line"),
          city: get("city"),
          state: get("state") || undefined,
          pincode: get("pincode") || undefined,
          // The code the shopper applied in the cart. Sent, not assumed: the
          // service re-validates it and claims its use inside the order
          // transaction, so a code that was quoted but has since been spent
          // fails the placement rather than silently discounting nothing.
          couponCode: quote?.couponCode ?? undefined,
        }),
      });

      const body = (await res.json().catch(() => null)) as
        | { orderNo?: string; token?: string; payment?: PaymentIntent; error?: string }
        | null;

      if (!res.ok || !body?.orderNo || !body.token) {
        setFormError(body?.error ?? "We could not place your order. Please try again.");
        setSubmitting(false);
        return;
      }

      const { orderNo, token, payment } = body;
      const done = () => router.push(`/confirmation?order=${orderNo}&t=${token}`);

      // No live keys → no gateway to open. Simulate the capture and be honest
      // on screen that it is a test.
      if (!payment?.configured || !payment.razorpayOrderId) {
        setNote("Test mode — simulating payment…");
        await postVerify({ orderNo, mock: true });
        done();
        return;
      }

      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setFormError("We could not load the payment window. Check your connection and try again.");
        setSubmitting(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount * 100, // rupees → paise
        currency: "INR",
        name: "Lumi9",
        order_id: payment.razorpayOrderId,
        prefill: {
          name: [get("firstName"), get("lastName")].filter(Boolean).join(" "),
          email: get("email") || undefined,
          contact: get("phone"),
        },
        handler: (r) => {
          void postVerify({
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
            orderNo,
          }).finally(done);
        },
        modal: {
          // The cart was consumed when the pending order was created, so leaving
          // her on checkout would give her no valid retry path.
          ondismiss: done,
        },
      });
      rzp.open();
    } catch {
      setFormError("We could not reach the server. Please try again.");
      setSubmitting(false);
    }
  }

  if (isEmpty) {
    return (
      <section className="px-safe mx-auto max-w-[760px] py-section text-center">
        <h1 className="m-0 mb-3 font-display text-[clamp(26px,7vw,42px)] md:text-[clamp(28px,3.4vw,42px)] font-normal">Your cart is empty</h1>
        <p className="m-0 mb-7 text-base text-muted">Add a pack before checking out.</p>
        <Link href="/shop" className="btn btn-dark font-bold">
          Shop Cloud Soft
        </Link>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="px-safe mx-auto grid max-w-[1180px] grid-cols-1 items-start gap-block py-[clamp(28px,4vw,48px)] lg:grid-cols-[1fr_minmax(320px,400px)]"
    >
      <div>
        <h1 className="m-0 mb-8.5 font-display text-[clamp(26px,7vw,42px)] md:text-[clamp(28px,3.4vw,42px)] font-normal">Checkout</h1>

        <Fieldset step={1} title="Contact">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input id="email" name="email" type="email" required placeholder="Email address" className="field" autoComplete="email" />
        </Fieldset>

        <Fieldset step={2} title="Shipping address">
          <div className="grid grid-cols-1 gap-[clamp(10px,1.4vw,14px)] min-[420px]:grid-cols-2">
            <input
              name="firstName" aria-label="First name"
              placeholder="First name"
              required
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="field"
            />
            <input name="lastName" aria-label="Last name" placeholder="Last name" required autoComplete="family-name" className="field" />
            <input
              name="line" aria-label="Address"
              placeholder="Address"
              required
              autoComplete="address-line1"
              className="field min-[420px]:col-span-2"
            />
            <input
              name="line2" aria-label="Apartment, suite (optional)"
              placeholder="Apartment, suite (optional)"
              autoComplete="address-line2"
              className="field min-[420px]:col-span-2"
            />
            <input
              name="city" aria-label="City"
              placeholder="City"
              required
              autoComplete="address-level2"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="field"
            />
            <input name="state" aria-label="State" placeholder="State" required autoComplete="address-level1" className="field" />
            <input
              name="pincode" aria-label="PIN code"
              placeholder="PIN code"
              required
              inputMode="numeric"
              autoComplete="postal-code"
              className="field"
            />
            <input name="phone" aria-label="Phone" placeholder="Phone" required inputMode="tel" autoComplete="tel" className="field" />
          </div>
        </Fieldset>

        {/*
          One delivery option, because there is one. The "Express delivery ₹79"
          radio that stood here was never sent to /api/checkout and never
          reached an Order row: picking it added ₹79 to the total on screen and
          changed nothing about what was charged or how the parcel shipped.
          Standard is what the courier contract covers, and the server's own
          quote is what the row below reads.
        */}
        <Fieldset step={3} title="Delivery">
          <div className="rounded-chip border-[1.5px] border-moss-tint px-[clamp(14px,1.8vw,20px)] py-[clamp(13px,1.6vw,18px)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="block text-[15px] font-bold text-midnight">Standard delivery</span>
                <span className="text-[13px] text-muted">3–5 business days, across India</span>
              </span>
              <span className="text-[15px] font-bold text-midnight">
                {quote ? shippingLabel(quote.shipping) : "Calculated below"}
              </span>
            </div>
            {quote && quote.shipping > 0 && (
              <p className="m-0 mt-2 text-[13px] text-muted">
                Free on orders over {inr(quote.freeShipThreshold)}.
              </p>
            )}
          </div>
        </Fieldset>

        {/*
          Payment is taken by Razorpay, in Razorpay's own window.
          
          What stood here was a mock: three method chips whose selection was
          never read, and — under "Card" — a card number, expiry and CVC field
          with no `name`, never submitted anywhere and never used. They put a
          shopper's PAN and CVC into our DOM, on our origin, for nothing: the
          Razorpay modal opens straight afterwards and asks for the card again.
          Collecting those digits at all drags this origin into PCI-DSS scope,
          and a "Cash on delivery" chip advertised a settlement option that does
          not exist — selecting it still opened the gateway and demanded payment.
        */}
        <Fieldset step={4} title="Payment">
          <div className="rounded-[14px] bg-moss-tint px-5 py-4 text-sm text-midnight">
            <p className="m-0 mb-1.5 font-bold">Secure payment by Razorpay</p>
            <p className="m-0 text-muted">
              Card, UPI, net banking and wallets. Placing your order opens
              Razorpay&apos;s payment window — your card details are entered
              there and never touch Lumi9.
            </p>
          </div>
        </Fieldset>
      </div>

      {/* SUMMARY */}
      <aside className="panel p-card lg:sticky lg:top-8">
        <h2 className="m-0 mb-5.5 font-display text-[22px] font-normal">Order summary</h2>

        <div className="mb-5.5 flex flex-col gap-4">
          {lines.map((line) => (
            <div key={line.key} className="flex items-center gap-3.5">
              <div className="relative size-[clamp(52px,5vw,60px)] shrink-0 overflow-hidden rounded-chip bg-shell">
                <Image src={line.image} alt="" fill sizes="60px" className="object-cover" />
                <span className="absolute -top-1.5 -right-1.5 flex size-5.5 items-center justify-center rounded-full bg-midnight text-xs font-bold text-butter">
                  {line.qty}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold">Cloud Soft — {line.name}</div>
                <div className="text-xs text-muted">{line.count} pants</div>
              </div>
              <div className="text-sm font-bold">{inr(line.lineTotal)}</div>
            </div>
          ))}
        </div>

        <div className="mb-5 flex flex-col gap-3 border-t border-moss-tint pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold">{inr(subtotal)}</span>
          </div>
          {quote && quote.discount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted">
                Discount{quote.couponCode ? ` (${quote.couponCode})` : ""}
              </span>
              <span className="font-semibold text-moss-deep">−{inr(quote.discount)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted">Delivery</span>
            <span className="font-semibold text-moss-deep">
              {quote ? shippingLabel(quote.shipping) : "Calculating…"}
            </span>
          </div>
        </div>

        <div className="mb-6 flex items-baseline justify-between border-t border-moss-tint pt-4.5">
          <span className="text-base font-bold">Total</span>
          <span className="font-display text-[clamp(23px,2.6vw,28px)] text-midnight">{inr(total)}</span>
        </div>

        {formError && (
          <p className="m-0 mb-3 text-sm text-[#b4232c]" role="alert" aria-live="polite">
            {formError}
          </p>
        )}
        {note && (
          <p className="m-0 mb-3 text-sm text-muted" aria-live="polite">
            {note}
          </p>
        )}

        <button type="submit" className="btn btn-dark w-full font-bold" disabled={submitting}>
          {submitting ? "Placing order…" : quote ? `Place order · ${inr(total)}` : "Place order"}
        </button>
        <p className="m-0 mt-3.5 text-center text-xs leading-[1.5] text-muted">
          By placing your order you agree to Lumi9&apos;s{" "}
          <Link href="/privacy" className="text-moss-deep underline">
            terms
          </Link>
          . Chemical-free · Dermatologist tested.
        </p>
      </aside>
    </form>
  );
}
