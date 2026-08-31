import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handle, ok } from "@femi9/core/api";
import { GUEST_COOKIE, getGuestToken, newGuestToken } from "@/lib/session";
import { EMPTY_CART, UnknownVariantError, addItem, getCart } from "@femi9/core/services/cart";

/**
 * Lumi9's cart. The service is brand-parameterised, so these handlers are a
 * thin wrapper that pins the brand and owns the cookie - the pricing, stock
 * checks and zone resolution are the same code Femi9 runs.
 */

export const dynamic = "force-dynamic";

const ONE_YEAR = 60 * 60 * 24 * 365;

const AddSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().positive().max(99).default(1),
});

/** GET /api/cart - the current guest cart (empty when the visitor has no token). */
export async function GET() {
  return handle(async () => {
    const token = await getGuestToken();
    if (!token) return ok(EMPTY_CART);
    return ok(await getCart("lumi9", token));
  });
}

/** POST /api/cart - add an item; mints and sets the guest cookie on first use. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const raw = await req.json().catch(() => null);
    const parsed = AddSchema.safeParse(raw);
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

    const existing = await getGuestToken();
    const token = existing ?? newGuestToken();

    try {
      const cart = await addItem("lumi9", token, parsed.data.variantId, parsed.data.qty);
      const res = ok(cart);
      if (!existing) {
        res.cookies.set(GUEST_COOKIE, token, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: ONE_YEAR,
        });
      }
      return res;
    } catch (err) {
      // A variant that is not sellable is a bad request, not a 500.
      if (err instanceof UnknownVariantError) return badRequest("Unknown variant");
      throw err;
    }
  });
}
