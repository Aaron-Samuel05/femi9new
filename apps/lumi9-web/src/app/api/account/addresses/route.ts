import { z } from "zod";
import { badRequest, created, handle, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { createAddress, listAddresses } from "@femi9/core/services/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/account/addresses - the signed-in shopper's saved address book.
 *
 * What the subscription box builder asks before it lets her pay: a mandate
 * with no delivery address on file is a recurring charge for a box that has
 * nowhere to ship. It does not need the rest of the account dashboard, so it
 * reads this rather than `getAccountData`.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser("lumi9");
    if (!user) return unauthorized();
    const addresses = await listAddresses("lumi9", user.sub);
    return ok({ addresses });
  });
}

/**
 * POST /api/account/addresses - save a delivery address.
 *
 * The account page listed addresses and offered no way to add, edit or remove
 * one; the only writer was checkout, which mints a fresh row per order. So the
 * book filled up with near-identical cards a shopper could look at and nothing
 * else, and correcting a wrong pincode meant retyping the whole address at the
 * next checkout.
 *
 * Every message here is written for a person, because the form renders them
 * inline from `details.fieldErrors` rather than throwing six answers away and
 * showing one generic sentence. `label` carries the shopper's own choice -
 * Home / Work / Other, or free text - not a hardcoded one.
 */
/*
 * A saved address is a DELIVERABLE address.
 *
 * `state` and `pincode` were optional here and blank was explicitly allowed
 * (`.or(z.literal(""))`). That address book is what prefills checkout, and
 * checkout now requires both — so a half-saved card would fill the form with a
 * gap the shopper has to notice and fix at the moment she is trying to pay,
 * having already "saved" the address once. One rule, in both places.
 */
const AddressSchema = z.object({
  label: z.string().trim().min(1, "Give this address a label").max(40),
  name: z.string().trim().min(2, "Enter the recipient name").max(120),
  line: z.string().trim().min(3, "Enter the flat, street and area").max(300),
  city: z.string().trim().min(2, "Enter the city").max(120),
  state: z.string().trim().min(2, "Enter the state").max(120),
  pincode: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
  phone: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "Enter a 10-digit mobile number")
    .optional()
    .or(z.literal("")),
  isPrimary: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser("lumi9");
    if (!user) return unauthorized();
    const parsed = AddressSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Check the address fields.", parsed.error.flatten());
    const address = await createAddress("lumi9", user.sub, parsed.data);
    return created({ id: address.id });
  });
}
