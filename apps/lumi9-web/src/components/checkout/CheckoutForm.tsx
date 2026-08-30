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

/** Wraps one input so a server-side rejection renders against it rather than as
 *  a nameless banner at the top of a nine-field form. */
function FieldError({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {children}
      {error && (
        <span className="text-[12px] text-[#b4232c]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

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

/**
 * What the server already knows about a signed-in shopper. Every field is
 * optional: a guest gets an empty form, and so does a signed-in shopper whose
 * account has nothing saved yet.
 */
export interface CheckoutPrefill {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  line?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/**
 * Split a stored full name into the two boxes this form asks for.
 *
 * The LAST word is the surname and everything before it is the first name —
 * not the reverse. "Priya Ramachandran Iyer" is a person with a two-word given
 * name far more often than a two-word surname, and either way she can correct
 * it; the point is that she is correcting a field rather than filling an empty
 * one. A single-word name leaves the surname blank rather than duplicating it.
 */
function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}

export function CheckoutForm({
  prefill,
}: {
  prefill?: CheckoutPrefill;
}) {
  const router = useRouter();
  const { lines, subtotal, ready } = useCart();
  // The same quote the cart showed, from the same provider — including any
  // coupon the shopper applied there. Nothing on this screen computes a total.
  const { quote } = useQuote();
  const prefilled = splitName(prefill?.name);
  const [firstName, setFirstName] = useState(prefilled.first);
  const [city, setCity] = useState(prefill?.city ?? "");
  /*
   * Phone and pincode are CONTROLLED and digit-only.
   *
   * This is the whole "Invalid request" bug. The server takes `/^\d{10}$/` and
   * `/^\d{6}$/`, and the form sent whatever was typed — so "+91 98842 30571"
   * and "641 001", which is how most people write both, were rejected. The
   * shopper then saw a single opaque banner reading "Invalid request" over a
   * form with no field marked, having done nothing wrong.
   *
   * Stripping as she types is the fix Femi9's checkout has always had
   * (`onDigits` there). Filtering at the input beats validating on submit: the
   * field cannot hold a value the server will refuse, so there is no error to
   * report and nothing to explain.
   */
  const [phone, setPhone] = useState(prefill?.phone ?? "");
  const [pincode, setPincode] = useState(prefill?.pincode ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Server-side field errors, bound beside the input that caused them. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
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
    setFieldErrors({});
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
        | {
            orderNo?: string;
            token?: string;
            payment?: PaymentIntent;
            error?: string;
            details?: { fieldErrors?: Record<string, string[]> };
          }
        | null;

      if (!res.ok || !body?.orderNo || !body.token) {
        /*
         * The route answers a schema failure with `details.fieldErrors` naming
         * the exact field and why. The form used to drop that on the floor and
         * render `body.error` alone — which for a rejected field is the string
         * "Invalid request", printed above a form with nothing marked and no
         * way to tell which of nine inputs to look at.
         *
         * Bind the field errors where they belong, and only fall back to the
         * banner for failures that are genuinely about the order rather than a
         * field: an empty bag, a spent coupon, a line that went out of stock.
         */
        const fields = body?.details?.fieldErrors;
        if (fields && Object.keys(fields).length > 0) {
          setFieldErrors(fields);
          setFormError("Check the highlighted fields and try again.");
        } else {
          setFormError(body?.error ?? "We could not place your order. Please try again.");
        }
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

        {/* The "already have an account? sign in" line that stood here is gone
            with the guest path: /checkout is behind the guard now, so everyone
            who reaches this form is already signed in and the offer would be
            addressed to nobody. */}

        <Fieldset step={1} title="Contact">
          <label htmlFor="email" className="sr-only">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="Email address"
            className="field"
            autoComplete="email"
            defaultValue={prefill?.email ?? ""}
          />
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
            <input
              name="lastName"
              aria-label="Last name"
              placeholder="Last name"
              required
              autoComplete="family-name"
              className="field"
              defaultValue={prefilled.last}
            />
            <input
              name="line" aria-label="Address"
              placeholder="Address"
              required
              autoComplete="address-line1"
              className="field min-[420px]:col-span-2"
              defaultValue={prefill?.line ?? ""}
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
            <input
              name="state"
              aria-label="State"
              placeholder="State"
              required
              autoComplete="address-level1"
              className="field"
              defaultValue={prefill?.state ?? ""}
            />
            <FieldError error={fieldErrors.pincode?.[0]}>
              <input
                name="pincode" aria-label="PIN code"
                placeholder="PIN code"
                required
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                className="field w-full"
                value={pincode}
                onChange={(event) => setPincode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </FieldError>
            <FieldError error={fieldErrors.phone?.[0]}>
              <input
                name="phone"
                aria-label="Phone"
                placeholder="Phone"
                required
                inputMode="tel"
                autoComplete="tel"
                maxLength={10}
                className="field w-full"
                value={phone}
                /* Keeps the LAST ten digits, so a pasted "+91 98842 30571"
                   lands as "9884230571" rather than being truncated to the
                   country code. */
                onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(-10))}
              />
            </FieldError>
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
