import { NextResponse } from "next/server";
import { sendEmailNotification } from "@femi9/core/services/notifications";
import { buildCarePlan } from "@/lib/care-plan";
import type { BabySex } from "@/lib/baby-profile";

/**
 * POST /api/parenting/care-plan
 *
 * The one place the parenting tools leave the device: a parent who adds an email
 * to the baby profile gets a single care + vaccination plan, built from the same
 * UIP schedule the on-site tool uses. Idempotent per (email, dob, day) so saving
 * the form twice does not send twice; the maths never persists — only the email
 * address reaches us, and only to send this one message.
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Body = {
  email?: unknown;
  name?: unknown;
  dob?: unknown;
  sex?: unknown;
  bloodGroup?: unknown;
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
  const sex: BabySex | undefined =
    sexRaw === "male" || sexRaw === "female" ? sexRaw : undefined;
  const bloodGroup = str(body.bloodGroup);

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

  const plan = buildCarePlan({ name, dob, sex, bloodGroup, today });

  try {
    const result = await sendEmailNotification("lumi9", {
      to: email,
      subject: plan.subject,
      html: plan.html,
      text: plan.text,
      template: "parenting-care-plan",
      // One plan per baby per day: re-saving the form is not a resend.
      dedupeKey: `care-plan:${email}:${dob}:${today}`,
    });
    return NextResponse.json({ ok: true, sent: result.sent, duplicate: result.duplicate ?? false });
  } catch {
    // A failed send must not look like a form error the parent can fix.
    return NextResponse.json(
      { ok: false, error: "We couldn't send the email just now. Your plan is still on the page." },
      { status: 502 },
    );
  }
}
