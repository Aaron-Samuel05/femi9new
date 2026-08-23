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
import { EXPRESS_SHIPPING_FEE, inr, shippingLabel, standardShipping } from "@/lib/catalog";

type Delivery = "standard" | "express";

const DELIVERY_OPTIONS: { key: Delivery; name: string; eta: string; fee: number }[] = [
  { key: "standard", name: "Standard delivery", eta: "3–5 business days", fee: 0 },
  { key: "express", name: "Express delivery", eta: "1–2 business days", fee: EXPRESS_SHIPPING_FEE },
];

const PAYMENT_METHODS = ["Card", "UPI", "Cash on delivery"] as const;



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
  const [delivery, setDelivery] = useState<Delivery>("standard");
  const [payment, setPayment] = useState<(typeof PAYMENT_METHODS)[number]>("Card");
  const [firstName, setFirstName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const shipping = delivery === "express" ? EXPRESS_SHIPPING_FEE : standardShipping(subtotal);
  const total = subtotal + shipping;
  const isEmpty = ready && lines.length === 0;

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

        <Fieldset step={3} title="Delivery">
          <div className="flex flex-col gap-3" role="radiogroup" aria-label="Delivery method">
            {DELIVERY_OPTIONS.map((option) => {
              const selected = option.key === delivery;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setDelivery(option.key)}
                  className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-chip border-[1.5px] px-[clamp(14px,1.8vw,20px)] py-[clamp(13px,1.6vw,18px)] text-left transition-colors ${
                    selected ? "border-moss-deep bg-moss-tint" : "border-moss-tint hover:border-moss-soft"
                  }`}
                >
                  <span className="flex items-center gap-3.5">
                    <span
                      aria-hidden
                      className={`inline-flex size-4.5 shrink-0 rounded-full border-2 ${
                        selected ? "border-moss-deep bg-moss-deep/25" : "border-[#c7cdb4]"
                      }`}
                    />
                    <span>
                      <span className="block text-[15px] font-bold text-midnight">{option.name}</span>
                      <span className="text-[13px] text-muted">{option.eta}</span>
                    </span>
                  </span>
                  <span className="text-[15px] font-bold text-midnight">
                    {option.fee === 0 ? "Free" : inr(option.fee)}
                  </span>
                </button>
              );
            })}
          </div>
        </Fieldset>

        <Fieldset step={4} title="Payment">
          <div className="mb-4 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Payment method">
            {PAYMENT_METHODS.map((method) => {
              const selected = method === payment;
              return (
                <button
                  key={method}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setPayment(method)}
                  className={`min-h-11 cursor-pointer rounded-chip border-[1.5px] px-[clamp(14px,1.8vw,20px)] py-3 text-sm font-semibold transition-colors ${
                    selected
                      ? "border-midnight bg-midnight text-butter"
                      : "border-moss-tint text-midnight hover:border-moss-soft"
                  }`}
                >
                  {method}
                </button>
              );
            })}
          </div>

          {payment === "Card" && (
            <div className="grid grid-cols-1 gap-[clamp(10px,1.4vw,14px)] min-[420px]:grid-cols-2">
              <input
                aria-label="Card number"
                placeholder="Card number"
                inputMode="numeric"
                autoComplete="cc-number"
                className="field min-[420px]:col-span-2"
              />
              <input aria-label="Expiry date" placeholder="MM / YY" autoComplete="cc-exp" className="field" />
              <input aria-label="Security code" placeholder="CVC" autoComplete="cc-csc" className="field" />
            </div>
          )}
          {payment === "UPI" && (
            <input aria-label="UPI ID" placeholder="yourname@upi" className="field" />
          )}
          {payment === "Cash on delivery" && (
            <p className="m-0 rounded-[14px] bg-moss-tint px-5 py-4 text-sm text-midnight">
              Pay the courier when your box arrives. Available on orders under ₹5,000.
            </p>
          )}
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
          <div className="flex justify-between">
            <span className="text-muted">Delivery</span>
            <span className="font-semibold text-moss-deep">{shippingLabel(shipping)}</span>
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
          {submitting ? "Placing order…" : `Place order · ${inr(total)}`}
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
