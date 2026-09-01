import { NextResponse } from "next/server";
import { getSession } from "@femi9/core/auth";
import { logger } from "@femi9/core/logger";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";
import { sendEmailNotification } from "@femi9/core/services/notifications";
import {
  BLOOD_GROUPS,
  getVaccineSchedule,
  recordParentingLead,
  type BloodGroup,
} from "@femi9/core/services/parenting";
import { buildCarePlan } from "@/lib/care-plan";
import type { BabySex } from "@/lib/baby-profile";
import type { VaccineDose } from "@/lib/immunisation-schedule";

/**
 * POST /api/parenting/care-plan
 *
 * The one place the parenting tools leave the device by design: a parent who
 * adds an email to the baby profile gets a single care + vaccination plan.
 * Idempotent per (email, dob, day), so saving the form twice does not send
 * twice.
 *
 * Two things changed when this surface got a backend, and both were silent
 * failures before.
 *
 * **The schedule in the email is now the DATABASE'S.** It used to be the bundled
 * module while the page beside it read rows — so an admin correcting a dose age
 * in the console moved what a parent saw on screen and not what the email they
 * keep in their inbox said. Two answers to "when is the next dose", and the
 * printable one wrong.
 *
 * **The address is now KEPT.** It used to be read, used and dropped: the one
 * piece of first-party data this whole surface collects reached the outbox and
 * no further. No list to follow up, no way to tell whether the feature is used
 * at all, and no record that the address was given for THIS purpose — which is
 * what makes any later send defensible or not.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
  email?: unknown;
  name?: unknown;
  dob?: unknown;
  sex?: unknown;
  bloodGroup?: unknown;
  source?: unknown;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const email = str(body.email)?.toLowerCase();
  const dob = str(body.dob);
  const name = str(body.name);
  const sexRaw = str(body.sex);
  const sex: BabySex | undefined = sexRaw === "male" || sexRaw === "female" ? sexRaw : undefined;
  // Narrowed against the list rather than taken as a string: it goes into a
  // Postgres enum, and an unrecognised value would fail the insert at the very
  // end of a request that has already sent the email.
  const bloodGroupRaw = str(body.bloodGroup);
  const bloodGroup = (BLOOD_GROUPS as readonly string[]).includes(bloodGroupRaw ?? "")
    ? (bloodGroupRaw as BloodGroup)
    : undefined;
  // Which tool page asked. Bounded and never interpreted — it is a label on a
  // row, so the only thing that matters is that it cannot be unbounded input.
  const source = str(body.source)?.slice(0, 120);

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, field: "email", error: "Enter a valid email address." },
      { status: 400 },
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!dob || !ISO_DATE_RE.test(dob) || dob > today) {
    return NextResponse.json(
      { ok: false, field: "dob", error: "Enter your baby's date of birth first." },
      { status: 400 },
    );
  }

  /*
   * Throttled on the two axes every other public mail route here uses, and for
   * the same reasons — this one had neither.
   *
   * It is unauthenticated and it SENDS BRANDED EMAIL to an address in the
   * request body, which makes it an open relay pointed at our own sending
   * reputation: a script can post a stranger's address in a loop and have Lumi9
   * mail them. The `dedupeKey` was the only brake and it does not brake this —
   * varying `dob` by one day is a fresh key, so the same address takes as many
   * distinct sends as there are dates.
   *
   * IP bounds the script; ADDRESS bounds what any one person can be sent,
   * whichever machine asks. Both are needed: the first alone lets a botnet
   * through, the second alone lets one host mail a list.
   *
   * Placed after validation so a malformed request cannot spend a real budget,
   * and before `getVaccineSchedule` so a flood costs no database work either.
   */
  const ipHit = await rateLimit("l9:careplan:ip:" + clientIp(req), 5, 300_000);
  if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);
  const addrHit = await rateLimit("l9:careplan:addr:" + email, 3, 3_600_000);
  if (!addrHit.ok) return tooManyRequests(addrHit.retryAfterSec);

  // The published schedule, mapped into the shape `scheduleFor` speaks — the
  // same two renames `parenting.server.ts` does. An EMPTY schedule is not an
  // error: the plan degrades to its care-tips half rather than refusing to send,
  // which is what a parent on an unseeded deployment should get.
  const doses: VaccineDose[] = (await getVaccineSchedule("lumi9")).map((d) => ({
    id: d.code,
    vaccine: d.vaccine,
    dose: d.dose,
    at: d.at,
    track: d.tracks,
    ...(d.note ? { note: d.note } : {}),
  }));

  const plan = buildCarePlan({ name, dob, sex, bloodGroup, today }, doses);

  try {
    const result = await sendEmailNotification("lumi9", {
      to: email,
      subject: plan.subject,
      html: plan.html,
      text: plan.text,
      template: "parenting-care-plan",
      // One plan per ADDRESS per day: re-saving the form is not a resend.
      //
      // `dob` used to be part of this key, which made the whole thing porous —
      // the same address could be mailed once per date-of-birth per day, and
      // there are as many of those as an attacker cares to type. The rate limit
      // above is the real brake now; this stays for the honest case of a parent
      // pressing Save twice.
      dedupeKey: `care-plan:${email}:${today}`,
    });

    /*
     * Filed AFTER the send, and never allowed to fail the request.
     *
     * The parent asked for an email; if it went out, they got what they came
     * for. Turning a bookkeeping failure into a red banner over a plan that is
     * already in their inbox would be the wrong trade, so this logs and
     * continues. Ordered after the send for the same reason: a lead recorded
     * for a message that never left would be a follow-up list of people who
     * think we ignored them.
     */
    try {
      const session = await getSession("lumi9");
      await recordParentingLead("lumi9", {
        email,
        babyName: name ?? null,
        dob,
        sex: sex ?? null,
        bloodGroup: bloodGroup ?? null,
        source: source ?? null,
        userId: session?.sub ?? null,
      });
    } catch (err) {
      logger.error("parenting_lead_write_failed", { err: String(err) });
    }

    return NextResponse.json({ ok: true, sent: result.sent, duplicate: result.duplicate ?? false });
  } catch {
    // A failed send must not look like a form error the parent can fix.
    return NextResponse.json(
      { ok: false, error: "We couldn't send the email just now. Your plan is still on the page." },
      { status: 502 },
    );
  }
}
