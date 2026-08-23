"use client";

/**
 * Opening Razorpay Checkout from the browser.
 *
 * The gateway order is created SERVER-side (`/api/checkout`), which is what
 * makes the amount trustworthy — the widget is handed an order id and a
 * publishable key, never a price it could be talked into changing.
 *
 * Two paths, decided by whether the brand has live keys:
 *  - configured → load Checkout.js, open the modal, and POST the handles to
 *    /api/payments/verify so the signature is checked on the server.
 *  - not configured → there is no gateway, so POST `{ mock: true }` to simulate
 *    a capture. Mock mode is refused in production, so this cannot become a
 *    "pay nothing" path on a live site.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface PaymentIntent {
  razorpayOrderId: string | null;
  /** In RUPEES, matching Order.total. The widget wants paise, so it is ×100. */
  amount: number;
  keyId: string;
  configured: boolean;
}

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  handler?: (res: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayInstance {
  open: () => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

/** Inject Checkout.js once and resolve when the global is ready. False on any
 *  load failure, so the caller can say so rather than hang. */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      if (window.Razorpay) return resolve(true);
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/** POST the verify payload — live handles, or `{ mock: true }`. */
export async function postVerify(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return Boolean(res && res.ok);
}
