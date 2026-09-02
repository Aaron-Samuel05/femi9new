import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { isConfigured, verifySubscriptionSignature } from "@femi9/core/razorpay";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { authorizationFor, confirmMandate } from "@femi9/core/services/subscriptions";

/**
 * Mandate authorisation for one Lumi9 box plan.
 *
 *   GET  → the `authorization` block again, so a plan the shopper abandoned
 *          mid-Checkout can be finished from her account instead of being
 *          re-created (which would leave her with two plans and two debits).
 *   POST → the SYNCHRONOUS return from Razorpay Checkout once her bank approved.
 *
 * Two mutually-exclusive POST modes, chosen by `isConfigured("lumi9")` and never
 * by the client - the same discipline as /api/payments/verify. The signed
 * payload for a MANDATE is `payment_id|subscription_id`, the reverse of a
 * one-off order's; @femi9/core/razorpay keeps the two verifiers apart precisely
 * so this cannot be got backwards.
 *
 * The webhook (`subscription.authenticated`) confirms the same mandate
 * independently, and both paths are idempotent: a shopper who closes the tab
 * before this call returns must still end up with a live plan.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LiveSchema = z.object({
  razorpay_subscription_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

const MockSchema = z.object({ mock: z.literal(true) });

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return handle(async () => {
    const u = await requireUser("lumi9");
    if (!u) return unauthorized();
    const authorization = await authorizationFor("lumi9", id, u.sub);
    if (!authorization) return notFound("Subscription not found");
    return ok({ authorization });
  });
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const hit = await rateLimit(`sub-authorize:${clientIp(req)}`, 10, 60_000);
  if (!hit.ok) return tooManyRequests(hit.retryAfterSec);

  return handle(async () => {
    const u = await requireUser("lumi9");
    if (!u) return unauthorized();

    // Ownership first, and it doubles as the lookup of the gateway id we are
    // allowed to confirm. Never trust the subscription id in the body: a caller
    // could otherwise post someone else's handles and activate their plan.
    const owned = await authorizationFor("lumi9", id, u.sub);
    if (!owned) return notFound("Subscription not found");

    const raw = await req.json().catch(() => null);

    if (isConfigured("lumi9")) {
      const parsed = LiveSchema.safeParse(raw);
      if (!parsed.success) {
        return badRequest("Invalid authorization payload", parsed.error.flatten());
      }
      const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = parsed.data;

      if (razorpay_subscription_id !== owned.razorpaySubscriptionId) {
        return badRequest("Authorization does not match this subscription");
      }
      const valid = verifySubscriptionSignature("lumi9", {
        subscriptionId: razorpay_subscription_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });
      if (!valid) return badRequest("Mandate signature verification failed");

      await confirmMandate("lumi9", razorpay_subscription_id, "authenticated");
      return ok({ ok: true, status: "active" });
    }

    const parsed = MockSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Invalid authorization payload");
    await confirmMandate("lumi9", owned.razorpaySubscriptionId, "authenticated");
    return ok({ ok: true, status: "active", mock: true });
  });
}
