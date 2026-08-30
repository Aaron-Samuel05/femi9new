import type { OrderConfirmation } from "@femi9/core/services/checkout";

/**
 * What an order's status means to the shopper looking at it.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The confirmation page said "Order confirmed", "Thank you! 🥑", "Your Cloud
 * Soft order is on its way" and "A confirmation is in your inbox" — all four
 * hardcoded, none of them reading `order.status`. Cancelling the Razorpay modal
 * calls `ondismiss: done`, which navigates to that page with the order still
 * `pending`, so dismissing a payment produced a celebration for an order nobody
 * had paid for and no email was ever sent about. Meanwhile /order/[orderNo]
 * read the real status and said "Awaiting payment confirmation", so the site
 * contradicted itself about money on two pages one click apart.
 *
 * One mapping now, used by both, so they cannot drift again.
 *
 * ── The `pending` case is not an error ──────────────────────────────────────
 * It genuinely means "no money has been taken yet", and it covers three
 * different situations that look identical from here: she dismissed the modal,
 * the payment failed, or it succeeded and the webhook has not landed yet. The
 * copy has to be true of all three, which is why it says the order is held and
 * asks her to complete payment rather than announcing a failure — the last of
 * the three resolves itself within seconds and telling her it failed would be
 * its own lie.
 */

export type OrderStatus = OrderConfirmation["status"];

export interface StatusPresentation {
  /** Is this a state worth celebrating? Drives the tick, the confetti copy. */
  settled: boolean;
  /** True only while money is still outstanding — shows the retry path. */
  awaitingPayment: boolean;
  /** The badge, and the headline on the order page. */
  label: string;
  /** The eyebrow above the confirmation headline. */
  eyebrow: string;
  headline: (firstName: string) => string;
  body: string;
  /** Neutral when nothing has gone right yet; green once it has. */
  tone: "good" | "waiting" | "bad";
}

const PRESENTATION: Record<OrderStatus, StatusPresentation> = {
  pending: {
    settled: false,
    awaitingPayment: true,
    label: "Awaiting payment",
    eyebrow: "Payment not completed",
    headline: (n) => `${n}, your order is held`,
    body:
      "We have saved your order but no payment has reached us yet. Complete it below and we will start packing. " +
      "If you have just paid, this updates on its own within a minute.",
    tone: "waiting",
  },
  paid: {
    settled: true,
    awaitingPayment: false,
    label: "Payment received",
    eyebrow: "Order confirmed",
    headline: (n) => `Thank you, ${n}! 🥑`,
    body: "Your Cloud Soft order is on its way. A confirmation is in your inbox.",
    tone: "good",
  },
  processing: {
    settled: true,
    awaitingPayment: false,
    label: "Being packed",
    eyebrow: "Order confirmed",
    headline: (n) => `Thank you, ${n}! 🥑`,
    body: "We are packing your Cloud Soft order now. Tracking follows as soon as it ships.",
    tone: "good",
  },
  shipped: {
    settled: true,
    awaitingPayment: false,
    label: "On its way",
    eyebrow: "Order shipped",
    headline: (n) => `It is on its way, ${n}!`,
    body: "Your Cloud Soft order has left our Erode facility. Tracking is in your inbox.",
    tone: "good",
  },
  delivered: {
    settled: true,
    awaitingPayment: false,
    label: "Delivered",
    eyebrow: "Order delivered",
    headline: (n) => `Delivered, ${n} 🥑`,
    body: "Your Cloud Soft order has arrived. We hope it is a happy day.",
    tone: "good",
  },
  cancelled: {
    settled: false,
    awaitingPayment: false,
    label: "Cancelled",
    eyebrow: "Order cancelled",
    headline: (n) => `${n}, this order was cancelled`,
    body:
      "Nothing has been charged and nothing is being sent. If this is a surprise, get in touch with the order " +
      "number and we will look into it.",
    tone: "bad",
  },
  refunded: {
    settled: false,
    awaitingPayment: false,
    label: "Refunded",
    eyebrow: "Order refunded",
    headline: (n) => `${n}, this order was refunded`,
    body: "The amount is on its way back to the account you paid from — banks usually take 5-7 working days.",
    tone: "bad",
  },
};

export function presentStatus(status: OrderStatus): StatusPresentation {
  // A status the enum gains later must not render an empty page. Falling back
  // to `pending` is the safe direction: it claims nothing has been paid, which
  // is the assumption that cannot mislead somebody into thinking a parcel is
  // coming.
  return PRESENTATION[status] ?? PRESENTATION.pending;
}
