import { z } from "zod";
import { badRequest, created, handle, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import {
  createSubscription,
  listForUser,
  CadenceNotFoundError,
  VariantNotFoundError,
} from "@femi9/core/services/subscriptions";

/**
 * Subscriptions for the signed-in Lumi9 shopper.
 *   GET  → her subscriptions.
 *   POST → start one, from the box builder on /subscription.
 *
 * The service is brand-parameterised and Femi9 has used it since before this
 * storefront existed; Lumi9 simply had no route. So /subscription advertised
 * "You save 20% every delivery" and "Skip, pause or cancel anytime" behind a
 * `<Link href="/checkout">` that created no subscription, carried none of the
 * chosen size, pack or frequency, and applied no discount - the shopper landed
 * on checkout with whatever was already in her cart, at full price.
 *
 * The auth check runs BEFORE the body is read, so an unauthenticated POST is a
 * 401 that has created nothing; the box builder relies on that 401 to send a
 * guest to /login and back.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(99).default(1),
  // Cadence code as seeded for THIS brand: '2w' | '4w' | '6w'. Femi9's are
  // period-cycle shaped and live in its own schema; the service resolves the
  // code against the rows in the brand it was called for.
  cadenceCode: z.string().min(1).max(16),
});

export async function GET() {
  return handle(async () => {
    const u = await requireUser("lumi9");
    if (!u) return unauthorized();
    return ok({ subscriptions: await listForUser("lumi9", u.sub) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser("lumi9");
    if (!u) return unauthorized();

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Invalid subscription", parsed.error.flatten());

    try {
      const subscription = await createSubscription("lumi9", u.sub, parsed.data);
      return created({ subscription });
    } catch (err) {
      // An unknown cadence means the `Cadence` rows were never seeded into this
      // schema - a deploy problem, not a client one, but a 400 with the reason
      // is more use to whoever is looking than a 500 with none.
      if (err instanceof CadenceNotFoundError) return badRequest(err.message);
      if (err instanceof VariantNotFoundError) return badRequest(err.message);
      throw err;
    }
  });
}
