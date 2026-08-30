import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@femi9/core/auth";
import { getProfileStatus } from "@femi9/core/services/account";
import { MinimalNav } from "@/components/site/Nav";
import { safeNextPath } from "@/lib/safe-next";
import { WelcomeFlow } from "./WelcomeFlow";

// Reads the session cookie and the shopper's own row, so it must render per
// request — never statically cached and served to somebody else.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Complete your profile",
  robots: { index: false, follow: false },
};

/**
 * /welcome — the onboarding step that finally captures a name and whichever
 * contact channel signing in did not.
 *
 * Every sign-in path mints a session BEFORE it knows who the shopper is: phone
 * OTP writes a number, the magic link writes an address, Google writes a name
 * and an address but never a number. Before this existed, the gap simply stayed
 * open — /account greeted a magic-link shopper as "there", her orders had no
 * number to deliver to, and checkout asked for the whole lot again as if she
 * were a guest.
 *
 * The gate is resolved on the SERVER so a completed shopper never sees a flash
 * of the form: `proxy.ts` guarantees a session, this page guarantees the step is
 * still needed. Typing the URL does not bypass it, and neither does typing
 * /account — that page redirects here while the profile is incomplete.
 */
export default async function WelcomePage(props: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const raw = typeof searchParams?.next === "string" ? searchParams.next : null;
  const next = resolveNext(raw);

  const session = await getSession("lumi9");
  // `proxy.ts` already bounced an anonymous visitor; this re-check covers a
  // cookie that expired between the two, and a matcher is a routing rule rather
  // than an authorisation in any case.
  if (!session) redirect("/login?next=%2Faccount");

  const status = await getProfileStatus("lumi9", session.sub);
  // A valid token whose user row is gone — bounce rather than render half a page.
  if (!status) redirect("/login");
  // A completed shopper can never see this screen again.
  if (status.complete) redirect(next ?? "/account");

  return (
    <>
      <MinimalNav />
      <main>
        <WelcomeFlow initialMissing={status.missing} next={next} />
      </main>
    </>
  );
}

/**
 * The shared open-redirect guard, plus the two loop guards the sign-in chain
 * needs: `/welcome` is rejected against itself because forwarding here would
 * cycle, and `/login` because bouncing a completed shopper back to sign-in
 * reads as a bug.
 *
 * Returns null rather than a fallback so the caller can tell "she asked for
 * nothing in particular" from "she asked for the default".
 */
function resolveNext(raw: string | null): string | null {
  const safe = safeNextPath(raw, "");
  if (!safe) return null;
  if (safe === "/login" || safe.startsWith("/login/") || safe.startsWith("/login?")) return null;
  if (safe === "/welcome" || safe.startsWith("/welcome/") || safe.startsWith("/welcome?")) return null;
  return safe;
}
