import type { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, handle, notFound, ok, unauthorized } from "@femi9/core/api";
import { requireUser } from "@femi9/core/auth";
import { pause, resume, skipNext, cancel } from "@femi9/core/services/subscriptions";

/**
 * Manage one subscription.
 *   PATCH { action: 'pause' | 'resume' | 'skip' | 'cancel' }
 *
 * Customer-guarded AND ownership-checked: the service scopes every mutation by
 * { id, userId }, so a request for somebody else's subscription comes back as a
 * 404 - not owned is indistinguishable from missing, which is what keeps the id
 * space from being enumerable.
 *
 * The account page's "Skip or pause a box" used to be a link to /contact, with
 * a comment saying this endpoint did not exist yet. It does now, so the promise
 * on the subscription page ("Skip, pause or cancel anytime") is one the site
 * can keep.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["pause", "resume", "skip", "cancel"]),
});

// Each action to its service call - the handler stays a straight lookup.
const ACTIONS = { pause, resume, skip: skipNext, cancel } as const;

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return handle(async () => {
    const u = await requireUser("lumi9");
    if (!u) return unauthorized();

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

    const subscription = await ACTIONS[parsed.data.action]("lumi9", params.id, u.sub);
    if (!subscription) return notFound("Subscription not found");
    return ok({ subscription });
  });
}
