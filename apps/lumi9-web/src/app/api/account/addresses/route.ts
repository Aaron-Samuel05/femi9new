import { z } from "zod";
import { badRequest, created, handle, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { createAddress } from "@femi9/core/services/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/account/addresses — save a delivery address.
 *
 * The account page listed addresses and offered no way to add, edit or remove
 * one; the only writer was checkout, which mints a fresh row per order. So the
 * book filled up with near-identical cards a shopper could look at and nothing
 * else, and correcting a wrong pincode meant retyping the whole address at the
 * next checkout.
 *
 * Every message here is written for a person, because the form renders them
 * inline from `details.fieldErrors` rather than throwing six answers away and
 * showing one generic sentence. `label` carries the shopper's own choice —
 * Home / Work / Other, or free text — not a hardcoded one.
 */
const AddressSchema = z.object({
  label: z.string().trim().min(1, "Give this address a label").max(40),
  name: z.string().trim().min(2, "Enter the recipient name").max(120),
  line: z.string().trim().min(3, "Enter the flat, street and area").max(300),
  city: z.string().trim().min(2, "Enter the city").max(120),
  state: z.string().trim().max(120).optional().default(""),
  pincode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a 6-digit pincode")
    .optional()
    .or(z.literal("")),
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
