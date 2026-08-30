import type { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { badRequest, handle, ok, serviceUnavailable } from "@femi9/core/api";
import { sendEmailNotification } from "@femi9/core/services/notifications";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";

/**
 * POST /api/contact — the "Get in touch" form on /contact.
 *
 * That form used to render a green tick and "Thanks for reaching out — we'll be
 * in touch shortly" without sending anything anywhere. Its own comment said
 * "Wire `onSubmit` to the care inbox", and nothing ever did. Every sizing
 * question, order problem and wholesale enquiry a visitor typed was discarded
 * while they were told somebody would reply.
 *
 * There is no `ContactMessage` table in the shared schema, so this delivers to
 * the care inbox by mail rather than inventing a brand-specific model in a
 * schema both storefronts migrate. `sendEmailNotification` logs every send in
 * `NotificationLog`, so a message that failed to deliver is still recoverable
 * from the database — which is most of what a table would have given us.
 *
 * It FAILS CLOSED. With no recipient configured, or with mail unconfigured, the
 * visitor is told to email us directly instead of being shown a confirmation
 * for a message nobody will read. A silent drop is the defect this replaces.
 */

export const runtime = "nodejs"; // node:crypto for the dedupe key
export const dynamic = "force-dynamic";

const SUBJECTS = ["Sizing help", "An existing order", "Subscription", "Bulk / wholesale"] as const;

const Schema = z.object({
  firstName: z.string().trim().min(1, "Please enter your first name.").max(80),
  lastName: z.string().trim().max(80).default(""),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  subject: z.enum(SUBJECTS),
  message: z.string().trim().min(1, "Please tell us how we can help.").max(4000),
});

export async function POST(req: NextRequest) {
  // A contact form is a free outbound mail relay if it is not throttled. Two
  // buckets, like the newsletter: per IP and per sender address.
  const ipHit = await rateLimit("l9:contact:ip:" + clientIp(req), 5, 300_000);
  if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);

  return handle(async () => {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Please fix the errors below", parsed.error.flatten());
    const { firstName, lastName, email, subject, message } = parsed.data;

    const addrHit = await rateLimit("l9:contact:addr:" + email, 5, 3_600_000);
    if (!addrHit.ok) return tooManyRequests(addrHit.retryAfterSec);

    const inbox = process.env.CARE_INBOX_EMAIL_LUMI9?.trim() || process.env.CARE_INBOX_EMAIL?.trim();
    if (!inbox) {
      return serviceUnavailable(
        "Our contact form is unavailable right now — please email care@lumi9.in and we will reply.",
      );
    }

    const name = [firstName, lastName].filter(Boolean).join(" ");
    // Deduped on the CONTENT plus a ten-minute bucket, so a double-click or a
    // retried submit does not mail the care team twice, while a genuine second
    // message later in the day still gets through.
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const dedupeKey = `contact:${createHash("sha256")
      .update(`${email}|${subject}|${message}|${bucket}`)
      .digest("hex")
      .slice(0, 32)}`;

    const { sent } = await sendEmailNotification("lumi9", {
      to: inbox,
      subject: `Lumi9 contact — ${subject} — ${name}`,
      text: `${name} <${email}>\nTopic: ${subject}\n\n${message}`,
      // The visitor's own words, so every interpolation is escaped before it
      // reaches an inbox that renders HTML.
      html:
        `<p><strong>${esc(name)}</strong> &lt;${esc(email)}&gt;</p>` +
        `<p>Topic: ${esc(subject)}</p>` +
        `<p style="white-space:pre-wrap">${esc(message)}</p>`,
      template: "contact-message",
      dedupeKey,
    });

    if (!sent) {
      return serviceUnavailable(
        "We could not send your message — please email care@lumi9.in and we will reply.",
      );
    }
    return ok({ ok: true });
  });
}

/** Minimal HTML escape for untrusted text placed into an email body. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
