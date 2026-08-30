import { z } from "zod";
import { badRequest, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { deleteAddress, updateAddress } from "@femi9/core/services/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Field rules mirror the POST schema exactly, so the same inline errors render
 * whether the shopper is adding an address or editing one. Every message is
 * written for a person to read — `details.fieldErrors` is what the form binds.
 */
const PatchSchema = z.object({
  label: z.string().trim().min(1, "Give this address a label").max(40).optional(),
  name: z.string().trim().min(2, "Enter the recipient name").max(120).optional(),
  line: z.string().trim().min(3, "Enter the flat, street and area").max(300).optional(),
  city: z.string().trim().min(2, "Enter the city").max(120).optional(),
  state: z.string().trim().max(120).optional(),
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

/** Ownership is enforced by the SERVICE — `updateAddress` scopes its `where` to
 *  the user id, so a guessed address id belonging to somebody else is a 404
 *  here rather than an edit there. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("lumi9");
    if (!user) return unauthorized();
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Check the address fields.", parsed.error.flatten());
    const address = await updateAddress("lumi9", user.sub, (await ctx.params).id, parsed.data);
    if (!address) return notFound("Address not found");
    return ok({ ok: true });
  });
}

/**
 * DELETE always succeeds for an address the shopper owns.
 *
 * `Address.archivedAt` is why: an order references the address it shipped to
 * forever, so a row that any order points at is ARCHIVED rather than removed
 * (every account read already filters `archivedAt IS NULL`) and the rest are
 * hard-deleted. Both are a 200 — the distinction is the service's business, not
 * something a shopper should have to understand to tidy her address book.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser("lumi9");
    if (!user) return unauthorized();
    const result = await deleteAddress("lumi9", user.sub, (await ctx.params).id);
    if (result === "missing") return notFound("Address not found");
    return ok({ ok: true });
  });
}
