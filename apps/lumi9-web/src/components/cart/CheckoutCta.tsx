"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-context";

/**
 * The button that leaves the bag for the payment step.
 *
 * Checkout is behind the session guard on this brand, so a signed-out shopper
 * pressing this is going to /login either way. The question is only whether she
 * discovers that by being bounced there — a full navigation to /checkout, a
 * redirect, then a second page load — or whether the button says so up front.
 *
 * It says so. The label changes, and the link points straight at /login with
 * `next` already set, which removes the round trip and, more importantly,
 * removes the surprise: pressing "Checkout" and landing on a sign-in form reads
 * as a site that has forgotten you, where pressing "Sign in to check out" is a
 * step you chose.
 *
 * While the session is still resolving it points at /checkout and lets the
 * guard decide. That is the safe default in both directions — a signed-in
 * shopper is never sent to a sign-in form she does not need, and a signed-out
 * one is never let through, because the guard is the thing that actually
 * enforces this.
 */
export function CheckoutCta({
  className = "",
  /** Appended to the label when the total is known — "Checkout · ₹1,299". */
  amount,
  onNavigate,
}: {
  className?: string;
  amount?: string;
  onNavigate?: () => void;
}) {
  const { user, ready } = useSession();
  const signedOut = ready && user === null;

  return (
    <Link
      href={signedOut ? "/login?next=%2Fcheckout" : "/checkout"}
      onClick={onNavigate}
      className={className}
    >
      {signedOut ? "Sign in to check out" : `Checkout${amount ? ` · ${amount}` : ""}`}
    </Link>
  );
}
