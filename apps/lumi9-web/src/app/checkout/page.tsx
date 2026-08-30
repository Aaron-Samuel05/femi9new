import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@femi9/core/auth";
import { dbFor } from "@femi9/db";
import { CheckoutNav } from "@/components/site/Nav";
import { CheckoutForm, type CheckoutPrefill } from "@/components/checkout/CheckoutForm";

// Reads the session cookie and this shopper's own rows, so it renders per
// request — never cached and served to somebody else's checkout.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Secure Lumi9 checkout.",
  robots: { index: false },
};

/**
 * What we already know about the signed-in shopper: her account details plus
 * her most recent (or default) saved address.
 *
 * Checkout used to ask a returning customer for her name, email, phone and full
 * street address on every single order — the same eight fields she had typed
 * the last time, beside an account page that was showing them back to her.
 *
 * A failure to resolve the prefill degrades to an empty form rather than an
 * error: it is a convenience, the form is the source of truth for what is
 * submitted, and `placeOrder` re-validates all of it regardless.
 */
async function resolvePrefill(userId: string): Promise<CheckoutPrefill | undefined> {
  const user = await dbFor("lumi9").user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      phone: true,
      addresses: {
        // Archived rows are the ones an order still references; they are history,
        // not a place to deliver to.
        where: { archivedAt: null },
        // `Address` carries no createdAt, but cuid() ids are timestamp-prefixed
        // and therefore sort in creation order — so this really is "her default,
        // else her newest".
        orderBy: [{ isPrimary: "desc" }, { id: "desc" }],
        take: 1,
        select: { name: true, line: true, city: true, state: true, pincode: true, phone: true },
      },
    },
  });
  if (!user) return undefined;

  const address = user.addresses[0];
  return {
    name: address?.name ?? user.name,
    phone: address?.phone ?? user.phone,
    email: user.email,
    line: address?.line,
    city: address?.city,
    state: address?.state,
    pincode: address?.pincode,
  };
}

/**
 * Checkout requires an account on this brand.
 *
 * `proxy.ts` already bounced an anonymous request, but this checks again: a
 * matcher is a routing rule and not an authorisation, and it cannot cover the
 * case of a cookie that expired between the guard and the render. Guarding
 * twice is the same rule the account surface follows.
 *
 * `next` carries the destination so signing in returns her here with a full
 * bag, rather than to a generic landing that makes her find the cart again.
 */
export default async function CheckoutPage() {
  const session = await getSession("lumi9");
  if (!session) redirect("/login?next=%2Fcheckout");

  // A prefill is a convenience; it must never be the reason checkout 500s.
  const prefill = await resolvePrefill(session.sub).catch(() => undefined);

  return (
    <>
      <CheckoutNav />
      <main>
        <CheckoutForm prefill={prefill} />
      </main>
    </>
  );
}
