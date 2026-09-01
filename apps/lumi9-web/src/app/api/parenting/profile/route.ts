import { z } from "zod";
import { badRequest, handle, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import {
  // From the SERVICE, not from the client module beside the form: this is the
  // list the database enum can actually hold, and a route handler validating
  // against a copy is how a dropdown option ends up rejected at the API.
  BLOOD_GROUPS,
  deleteBabyProfile,
  getBabyProfile,
  saveBabyProfile,
} from "@femi9/core/services/parenting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The signed-in parent's baby.
 *
 * GET / PUT / DELETE, and every one of them 401s without a session. There is
 * deliberately no guest path: a signed-out parent's profile stays in
 * localStorage and never reaches this route, which is what lets the card go on
 * promising that the details stay on the device for them.
 *
 * This is a child's date of birth, sex, weight and blood group. It is addressed
 * ONLY by the session — there is no `userId` in the body, no id in the path and
 * nothing to enumerate. `BabyProfile.userId` is unique, so "this parent's baby"
 * is a lookup, not a search that could be widened by a crafted request.
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
    return ok({ profile: await getBabyProfile("lumi9", session.sub) });
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
    const profile = await saveBabyProfile(
      "lumi9",
      session.sub,
      {
        ...parsed.data,
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

    return ok({ ok: true, profile });
  });
}

export async function DELETE() {
  return handle(async () => {
    const session = await requireUser("lumi9");
    if (!session) return unauthorized();

    // Measurements and vaccination records cascade. "Clear" on the card means
    // clear — leaving a child's health history behind an absent profile is the
    // kind of orphan nobody ever goes looking for.
    await deleteBabyProfile("lumi9", session.sub);
    return ok({ ok: true });
  });
}
