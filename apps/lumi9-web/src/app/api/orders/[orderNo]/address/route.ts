import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import {
  AddressEditClosedError,
  getOrderAddressEditState,
  updateOrderAddress,
} from "@femi9/core/services/order-address";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/orders/[orderNo]/address — the customer's one-time address correction.
 *
 *   GET   → whether the window is open, and why not when it is closed.
 *   PATCH → save a new address onto the order and close the window.
 *
 * ── Sign-in, not the order token ────────────────────────────────────────────
 * `/order/[orderNo]` authorises EITHER a capability token in `?t=` or a
 * session. Reading an order that way is fine — the token is unguessable and is
 * what lets a confirmation link work. Writing is different: a link gets
 * forwarded, pasted into a chat, left in a shared inbox, and whoever holds it
 * would be able to redirect a paid parcel. So this route takes the session and
 * nothing else, and the service scopes every query by `userId` on top of that.
 *
 * ── Why the address rules are the strict ones ───────────────────────────────
 * The same fields checkout now requires. A correction that could save a blank
 * pincode would reintroduce, on the repair path, the exact defect the checkout
 * schema was tightened to stop.
 */
const AddressSchema = z.object({
  name: z.string().trim().min(1, "Please enter the recipient's name").max(120),
  line: z.string().trim().min(1, "Please enter your address").max(300),
  city: z.string().trim().min(1, "Please enter your city").max(120),
  state: z.string().trim().min(1, "Please enter your state").max(120),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
  phone: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().regex(/^\d{10}$/, "Enter a valid 10-digit mobile number").optional(),
    )
    .optional(),
  label: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(40).optional(),
  ),
});

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ orderNo: string }> },
) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized("Please sign in.");

    const { orderNo } = await props.params;
    const state = await getOrderAddressEditState("lumi9", orderNo, session.sub);
    // Not hers, or no such order — the same answer either way, so an order
    // number that is not the customer's tells her nothing about whether it
    // exists.
    if (!state) return notFound("Order not found");
    return ok(state);
  });
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ orderNo: string }> },
) {
  // One grant is one save, so this is not a spam surface — but an unthrottled
  // write that opens a transaction per call is worth a limit regardless.
  const rl = await rateLimit("l9:order-address:" + clientIp(req), 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized("Please sign in.");

    const { orderNo } = await props.params;
    const raw = await req.json().catch(() => null);
    const parsed = AddressSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Please fix the errors below", parsed.error.flatten());

    try {
      const result = await updateOrderAddress("lumi9", orderNo, session.sub, parsed.data);
      if (!result) return notFound("Order not found");
      return ok(result);
    } catch (err) {
      if (err instanceof AddressEditClosedError) {
        // 409, not 400: nothing she typed is wrong — the window shut. The
        // message already says which of the three reasons it was.
        return Response.json({ error: err.message, reason: err.reason }, { status: 409 });
      }
      throw err;
    }
  });
}
