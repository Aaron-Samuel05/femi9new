import { z } from "zod";
import { badRequest, handle, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import {
  // From the SERVICE, not from the client module beside the form: this is the
  // list the database enum can actually hold, and a route handler validating
  // against a copy is how a dropdown option ends up rejected at the API.
  BLOOD_GROUPS,
  deleteBaby,
  listBabies,
  saveBabyProfile,
} from "@femi9/core/services/parenting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in parent's children.
 *
 * GET / PUT / DELETE, and every one of them 401s without a session. There is
 * deliberately no guest path: a signed-out parent's children stay in
 * localStorage and never reach this route, which is what lets the card go on
 * promising that the details stay on the device for them.
 *
 * This is a child's date of birth, sex, weight and blood group.
 *
 * **A `babyId` in the body is untrusted, and that is new.** The account used to
 * hold exactly one baby — `BabyProfile.userId` was unique, so "this parent's
 * baby" was a lookup with nothing to enumerate and no id anywhere in the
 * request. Now that a parent has several, PUT and DELETE both carry an id, and
 * an id is a thing a client can invent. Neither route resolves one on its own:
 * the service filters on `{ id, userId }` together, so an id belonging to
 * another family matches no row and comes back as `not-found` — the same answer
 * an id that never existed gets, so the route never confirms that somebody
 * else's child is real.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The same shape the form enforces, restated here because a form is a
 * convenience and a route handler is the rule. Every bound is a real one:
 *
 * - `dob` cannot be in the future. Every tool on the page dates from it, and a
 *   future birthday produces a negative age that silently walks off the front
 *   of the WHO tables.
 * - `weightKg` / `heightCm` are capped at values no baby reaches, because the
 *   percentile maths takes a `Math.pow` of them and a fat-fingered 700 is not
 *   worth a `NaN` on the page.
 * - `gestationalWeeks` is 22-42: below 22 is not a survivable birth and above 42
 *   is not a birth anyone records, so anything outside is a typo, and this one
 *   changes which age the growth chart is read at.
 */
const ProfileSchema = z.object({
  /* Absent adds a child; present edits one. Validated only for SHAPE here —
     whether this account owns it is the service's filter to answer, not a
     check this handler could forget to make. */
  id: z.string().min(1).max(64).nullish(),
  name: z.string().trim().max(80).nullish(),
  dob: z
    .string()
    .regex(ISO_DATE, "Enter your baby's date of birth")
    .refine((v) => v <= new Date().toISOString().slice(0, 10), "That date is in the future"),
  sex: z.enum(["male", "female"]),
  weightKg: z.number().positive().max(60).nullish(),
  heightCm: z.number().positive().max(200).nullish(),
  gestationalWeeks: z.number().int().min(22).max(42).nullish(),
  bloodGroup: z.enum(BLOOD_GROUPS).nullish(),
});

export async function GET() {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();
    return ok({ babies: await listBabies("lumi9", session.sub) });
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const parsed = ProfileSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest("Check your baby's details.", parsed.error.flatten());
    }

    /*
     * "Today" is derived HERE and passed down, rather than read as `new Date()`
     * inside the service.
     *
     * It is what dates the measurement row, and the service runs on a server in
     * UTC while every parent using this page is in India. An evening save in
     * IST is already tomorrow in UTC, so a `new Date()` in the service would
     * file measurements a day ahead — and `(babyId, takenOn)` is unique, so
     * two readings either side of 05:30 IST would collide into one day's slot
     * on the wrong day.
     */
    const today = new Date().toISOString().slice(0, 10);
    const result = await saveBabyProfile(
      "lumi9",
      session.sub,
      {
        ...parsed.data,
        id: parsed.data.id ?? null,
        // zod's `.nullish()` lets a key be absent OR null; the service takes
        // `null` to mean "clear this column", and absent has to mean the same
        // thing here or a save that drops the weight field would keep the old
        // value forever.
        name: parsed.data.name ?? null,
        weightKg: parsed.data.weightKg ?? null,
        heightCm: parsed.data.heightCm ?? null,
        gestationalWeeks: parsed.data.gestationalWeeks ?? null,
        bloodGroup: parsed.data.bloodGroup ?? null,
      },
      today,
    );

    /*
     * A signature-valid cookie for a user who no longer exists is a 401, not a
     * 500. The token is verified by signature alone and lives 30 days, so it
     * outlasts the account it names — after a deletion, or against a database
     * reset under it in development. The STATUS is what the card branches on: a
     * 401 tells a parent to sign in again, where the 500 this used to be left it
     * repeating "we couldn't sync" on every save with nothing to act on.
     */
    if (result.status === "unknown-user") {
      return unauthorized("Your session has expired. Sign in again to save to your account.");
    }

    /* Deliberately the same 400 for "not yours" and "never existed". Telling
       the two apart would turn this into an oracle for whether a given id is a
       real child somewhere. */
    if (result.status === "not-found") {
      return badRequest("That child isn't on your account.");
    }

    if (result.status === "too-many") {
      return badRequest("You've added as many children as this account holds.");
    }

    return ok({ ok: true, profile: result.profile });
  });
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof body?.id === "string" && body.id.length > 0 ? body.id : null;
    if (!id) return badRequest("Say which child to remove.");

    /* Measurements and vaccination records cascade. "Remove" means remove —
       leaving a child's health history behind an absent profile is the kind of
       orphan nobody ever goes looking for.

       Scoped to the session inside the service, and idempotent: an id this
       account does not own deletes nothing and still answers ok, because a
       distinct "that isn't yours" would say whether it exists. */
    await deleteBaby("lumi9", session.sub, id);
    return ok({ ok: true });
  });
}
