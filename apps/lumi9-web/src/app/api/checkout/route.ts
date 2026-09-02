import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { badRequest, created, handle, serviceUnavailable } from "@femi9/core/api";
import { getSession } from "@femi9/core/auth";
import { getGuestToken } from "@/lib/session";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { orderToken } from "@femi9/core/order-token";
import {
  EmptyCartError,
  InvalidCouponError,
  OutOfStockError,
  couponCookieName,
  placeOrder,
} from "@femi9/core/services/checkout";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";

/**
 * POST /api/checkout - turn the guest's cart into a pending order.
 *
 * Money is never taken from the body: `placeOrder` recomputes every total from
 * the database, so a tampered payload cannot buy anything cheaply. Only the
 * shipping and customer fields are validated here.
 *
 * Domain failures map to precise statuses so the form can say the right thing
 * inline rather than "something went wrong".
 *
 * The coupon falls back to the `lumi9_coupon` cookie when the body carries
 * none. The form normally sends the code the quote resolved, so this is the
 * belt to that braces - but it is the belt on the MONEY path, and the failure
 * it covers is the one that actually happened: a shopper who applied a coupon
 * and then reloaded checkout had it silently dropped from the payload and paid
 * full price. Neither source is trusted; `placeOrder` re-validates whichever
 * arrives and claims it atomically.
 */

// Empty optional text fields arrive as '' from the form; normalise to undefined
// so `.optional()` does not reject a blank the shopper simply left empty.
const blankToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const CheckoutSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  phone: z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number"),
  email: z.preprocess(blankToUndef, z.string().trim().email("Enter a valid email").optional()),
  line: z.string().trim().min(1, "Please enter your address").max(300),
  city: z.string().trim().min(1, "Please enter your city").max(120),
  state: z.preprocess(blankToUndef, z.string().trim().max(120).optional()),
  pincode: z.preprocess(
    blankToUndef,
    z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode").optional(),
  ),
  couponCode: z.preprocess(blankToUndef, z.string().trim().max(40).optional()),
  addressLabel: z.preprocess(blankToUndef, z.string().trim().max(40).optional()),
});

/** 409 helper - api.ts has no conflict envelope, so build it inline. */
function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 });
}

export async function POST(req: NextRequest) {
  // Throttle order placement per client IP, to blunt spam and double-submits.
  const rl = await rateLimit("l9:checkout:" + clientIp(req), 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  return handle(async () => {
    // No guest cookie means no cart was ever created - treat as empty.
    const token = await getGuestToken();
    if (!token) return badRequest("Your bag is empty.");

    /*
     * Sign-in is REQUIRED here, not merely preferred.
     *
     * `proxy.ts` guards `/checkout` and its comment explains the decision at
     * length: "Lumi9 requires an account instead, so every order has a real
     * identity behind it from the first request rather than one
     * reverse-engineered from the phone number typed into the form."
     *
     * That matcher covers the PAGE. It never covered this route, so the whole
     * gate was one `fetch` away from irrelevant — a POST straight here placed a
     * real order, with a real order number and a real payment intent, from no
     * account at all. Verified against a running server before this line
     * existed: `201 {"orderNo":"LM-00001"}` with no session cookie.
     *
     * And the guest path is not merely "an order without a user". `placeOrder`
     * identifies the buyer by the PHONE in the request body and adopts an
     * existing customer row that matches it — writing the submitted name onto
     * that account. So an unauthenticated caller who knows a shopper's mobile
     * number could put an order on her account and rename her.
     *
     * 401 rather than a redirect: this is an API, and the form that calls it
     * handles the status. The shared service is untouched — `placeOrder`'s
     * guest path stays valid for Femi9, which deliberately allows guest
     * checkout.
     */
    const session = await getSession("lumi9");
    if (!session) {
      return NextResponse.json(
        { error: "Please sign in to place your order.", code: "auth_required" },
        { status: 401 },
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = CheckoutSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

    try {
      // A signed-in shopper's order belongs to HER account. Without passing the
      // session, the service would identify the buyer by the phone typed into
      // the form, and a magic-link customer would collect a second User row per
      // order while her order history stayed empty.
      const cookieName = couponCookieName("lumi9");
      const couponCode =
        parsed.data.couponCode ?? req.cookies.get(cookieName)?.value?.trim().slice(0, 40) ?? undefined;

      const result = await placeOrder(
        "lumi9",
        token,
        { ...parsed.data, couponCode },
        // Non-null: the 401 above is what guarantees it.
        session.sub,
      );
      // An unguessable capability token, so the confirmation page can authorise
      // a guest without exposing anyone's details to orderNo guessing.
      const res = created({ ...result, token: orderToken(result.orderNo) });
      // The basket this coupon belonged to is now an order. Leaving the cookie
      // would quietly re-apply it to whatever she puts in her bag next.
      res.cookies.delete(cookieName);
      return res;
    } catch (err) {
      if (err instanceof EmptyCartError) return badRequest(err.message);
      if (err instanceof InvalidCouponError) return badRequest(err.message);
      if (err instanceof OutOfStockError) return conflict(err.message);
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("Online payment is temporarily unavailable.");
      }
      throw err; // unexpected → handle() turns it into a 500
    }
  });
}
