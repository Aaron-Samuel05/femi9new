"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loadRazorpayScript, postVerify, type PaymentIntent } from "@/lib/razorpay-client";
import { inr } from "@/lib/catalog";

/**
 * "Complete payment" on an order that was placed but never paid for.
 *
 * Dismissing the Razorpay modal calls `ondismiss: done` in CheckoutForm, which
 * navigates here with the order still `pending` — and the cart was consumed
 * when that order was created, so re-adding the items is not a route back
 * either. Without this the shopper has an unpaid order, an empty basket and
 * nothing to press.
 *
 * It reopens the SAME intent rather than placing a second order:
 * `/api/orders/[orderNo]/payment-intent` returns the intent already recorded
 * against this one, and refuses if its amount has drifted from the order total.
 * Retrying can therefore never create a duplicate order or charge a different
 * number than the order says.
 *
 * After a capture it refreshes rather than redirecting: the page it is on is
 * already the right one, and `router.refresh()` re-runs the server component so
 * the status, the tick and the timeline all re-render from the database instead
 * of from what this component believes just happened.
 */
export function RetryPayment({
  orderNo,
  token,
  amount,
}: {
  orderNo: string;
  /** The capability token from `?t=`, so a guest can retry without a session. */
  token?: string;
  amount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/payment-intent`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token ?? "" }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        payment?: PaymentIntent;
        error?: string;
      };

      if (!res.ok || !body.payment) {
        setError(body.error ?? "We could not reopen this payment. Please get in touch.");
        return;
      }

      const payment = body.payment;

      // No live keys configured — simulate the capture and say so, the same way
      // checkout does, rather than opening a gateway that cannot exist.
      if (!payment.configured || !payment.razorpayOrderId) {
        setNote("Test mode — simulating payment…");
        await postVerify({ orderNo, mock: true });
        router.refresh();
        return;
      }

      const ready = await loadRazorpayScript();
      if (!ready || !window.Razorpay) {
        setError("We could not load the payment window. Check your connection and try again.");
        return;
      }

      const rzp = new window.Razorpay({
        key: payment.keyId,
        amount: payment.amount * 100, // rupees → paise
        currency: "INR",
        name: "Lumi9",
        order_id: payment.razorpayOrderId,
        handler: (r) => {
          void postVerify({
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
            orderNo,
            // Re-read the order either way. A verify that did not land still
            // leaves the webhook to finalise it, and the page must show what
            // the database says rather than what this handler hoped.
          }).finally(() => router.refresh());
        },
        // Dismissing again simply returns her to this page, unchanged and still
        // honest about the order being unpaid.
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch {
      setError("We could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => void retry()}
        disabled={busy}
        className="btn btn-dark font-bold disabled:cursor-wait"
      >
        {busy ? "Opening payment…" : `Complete payment · ${inr(amount)}`}
      </button>
      <p className="m-0 min-h-5 text-[13px]" role="status" aria-live="polite">
        {error ? (
          <span className="text-[#b4232c]">{error}</span>
        ) : note ? (
          <span className="text-muted">{note}</span>
        ) : (
          " "
        )}
      </p>
    </div>
  );
}
