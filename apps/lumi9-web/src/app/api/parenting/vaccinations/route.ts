import { z } from "zod";
import { badRequest, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { listVaccinations, setVaccination } from "@femi9/core/services/parenting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which doses this parent has marked given or skipped.
 *
 * GET returns the set; PUT sets or clears ONE dose. Signed-in only, for the same
 * reason the profile route is: a guest's ticks stay on their device.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SetSchema = z.object({
  /**
   * The dose CODE ("penta-1"), never a database id. It is the key the schedule
   * seed upserts on, so re-seeding a corrected schedule leaves this parent's
   * record pointing at the dose they actually ticked.
   */
  code: z.string().trim().min(1).max(64),
  /**
   * `null` DELETES the record.
   *
   * Un-ticking a box ticked by mistake must remove the claim rather than store a
   * third state meaning "actually no" — a list where nothing can be taken back
   * is one nobody trusts enough to use. It is a PUT and not a DELETE because the
   * addressed thing is the dose's state, and "set it to nothing" is the same
   * write as "set it to given".
   */
  status: z.enum(["given", "skipped"]).nullable(),
  givenOn: z.string().regex(ISO_DATE).nullish(),
});

export async function GET() {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();
    return ok({ vaccinations: await listVaccinations("lumi9", session.sub) });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const parsed = SetSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Invalid request.", parsed.error.flatten());

    const result = await setVaccination("lumi9", session.sub, {
      code: parsed.data.code,
      status: parsed.data.status,
      givenOn: parsed.data.givenOn ?? null,
    });

    if (result.status === "no-profile") {
      // Not a 404: the request is fine and the shopper is real, they just have
      // no baby yet. The client treats it as "save the profile first" rather
      // than as a broken tick.
      return badRequest("Add your baby's details first.", undefined, { code: "no_profile" });
    }
    // A code that is not on the published schedule — a stale tab holding a dose
    // the console has since withdrawn, or a hand-made request.
    if (result.status === "no-dose") return notFound("No such dose.");

    return ok({ ok: true });
  });
}
