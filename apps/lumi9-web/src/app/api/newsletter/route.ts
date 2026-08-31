import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, created, handle, ok } from "@femi9/core/api";
import { dbFor } from "@femi9/db";
import { clientIp, rateLimit, tooManyRequests } from "@femi9/core/rate-limit";

/**
 * POST /api/newsletter - persist a footer signup.
 *
 * The footer form was theatre: it swapped itself for "You're on the list -
 * welcome to Lumi9" and threw the address away. Femi9 fixed exactly this and
 * `NewsletterSubscriber` exists in the shared schema because of it; the comment
 * on that model still says "Both newsletter forms showed 'you're on the list'
 * while discarding the address. This is where they land now." Lumi9's did not
 * land anywhere.
 *
 * Re-subscribing is idempotent (email is @unique) and answers 200 rather than a
 * conflict - from the visitor's side "you are on the list" is simply true, and
 * a 409 would leak which addresses are already subscribed.
 */

export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  source: z.enum(["footer", "journal"]).optional(),
});

export async function POST(req: NextRequest) {
  // Two buckets, the same shape the auth routes use: one per IP so a single
  // client cannot flood the table, one per address so a shared NAT does not
  // lock out an office. A cheap insert, so the limits are generous.
  const ipHit = await rateLimit("l9:newsletter:ip:" + clientIp(req), 10, 60_000);
  if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec);

  return handle(async () => {
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest("Enter a valid email address.", parsed.error.flatten());
    }
    const { email, source } = parsed.data;

    const addrHit = await rateLimit("l9:newsletter:addr:" + email, 5, 3_600_000);
    if (!addrHit.ok) return tooManyRequests(addrHit.retryAfterSec);

    const db = dbFor("lumi9");
    const existing = await db.newsletterSubscriber.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) return ok({ ok: true, alreadySubscribed: true });

    await db.newsletterSubscriber.create({ data: { email, source: source ?? null } });
    return created({ ok: true, alreadySubscribed: false });
  });
}
