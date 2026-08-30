import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handle, notFound, ok, serviceUnavailable } from "@femi9/core/api";
import { getSession } from "@femi9/core/auth";
import { dbFor } from "@femi9/db";
import { verifyOrderToken } from "@femi9/core/order-token";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { ProviderConfigurationError } from "@femi9/core/runtime-mode";
import {
  OrderNotFoundError,
  OrderNotPayableError,
  PaymentAmountMismatchError,
  PaymentIntentMissingError,
  pendingPaymentIntent,
} from "@femi9/core/services/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().optional().default("") });

/**
 * POST /api/orders/[orderNo]/payment-intent — reopen the gateway on an order
 * that was placed but never paid for.
 *
 * Dismissing the Razorpay modal leaves a `pending` order behind, and the cart
 * was consumed when that order was created — so without this she has an order
 * she cannot pay for and a basket she cannot rebuild. Femi9 has had this route
 * since its retry button was written; Lumi9 had the confirmation page claim the
 * order was confirmed instead, which is why nobody noticed the gap.
 *
 * Authorised exactly as the order page is: the unguessable `?t=` capability
 * token (how a GUEST gets back to her own order) OR a session that owns it.
 * Both failures answer 404 rather than 403, so this cannot be used to discover
 * which order numbers exist.
 *
 * It creates nothing. `pendingPaymentIntent` returns the intent already
 * recorded against the order and refuses if the amount has drifted from the
 * order total — a retry must never open the gateway for a different number than
 * the one the order says.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  const hit = await rateLimit(`l9:payment-retry:${clientIp(req)}`, 10, 60_000);
  if (!hit.ok) return tooManyRequests(hit.retryAfterSec);

  return handle(async () => {
    const { orderNo } = await params;
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return badRequest("Invalid request");

    const order = await dbFor("lumi9").order.findUnique({
      where: { orderNo },
      select: { userId: true },
    });
    if (!order) return notFound();

    let authorized = verifyOrderToken(orderNo, parsed.data.token);
    if (!authorized && order.userId) {
      const session = await getSession("lumi9");
      authorized = session?.sub === order.userId;
    }
    if (!authorized) return notFound();

    try {
      return ok({ payment: await pendingPaymentIntent("lumi9", orderNo) });
    } catch (err) {
      if (err instanceof OrderNotFoundError) return notFound();
      if (
        err instanceof OrderNotPayableError ||
        err instanceof PaymentIntentMissingError ||
        err instanceof PaymentAmountMismatchError
      ) {
        return badRequest(err.message);
      }
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable("Online payment is temporarily unavailable.");
      }
      throw err;
    }
  });
}
