import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@femi9/core/auth";
import { PageShell } from "@/components/site/PageShell";
import { SUPPORT_LINKS } from "@/components/site/Nav";
import { AuthCard } from "@/components/auth/AuthCard";
import { availableAuthMethods } from "@/lib/auth-methods";
import { safeNextPath } from "@/lib/safe-next";

// Reads the session cookie, so it must render per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Track orders, manage your subscription, and reorder in a tap.",
  robots: { index: false, follow: true },
};


/**
 * /login — the sign-in card, standalone under the standard chrome.
 *
 * A shopper who is ALREADY signed in is sent on rather than shown the form.
 * Without that, the nav's account control (which points at /account when a
 * session resolves) and a stale bookmark disagree: one takes her to her orders,
 * the other to a sign-in screen for an account she is already in — which reads
 * as having been signed out.
 */
export default async function LoginPage(props: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const raw = typeof searchParams?.next === "string" ? searchParams.next : null;

  const session = await getSession("lumi9");
  if (session) redirect(safeNextPath(raw, "/account"));

  /*
   * Resolved on the SERVER and handed down.
   *
   * The probes read `GOOGLE_CLIENT_ID`, `MSG91_AUTH_KEY`, `RESEND_API_KEY` and
   * the `AUTH_*_ENABLED` switches — none of which may reach the browser, and
   * none of which a client component could read anyway. The card is told what
   * it may offer; it never works it out.
   */
  const methods = availableAuthMethods();

  return (
    <PageShell links={SUPPORT_LINKS}>
      <section className="px-safe mx-auto max-w-[1040px] pt-[clamp(28px,4.6vw,60px)] pb-section">
        {/* AuthCard reads `?next` and `?error` with useSearchParams, which needs
            a Suspense boundary above it — without one the whole route opts out
            of static optimisation and Next errors at build. */}
        <Suspense fallback={<div className="min-h-[560px] rounded-panel bg-canvas shadow-deep" />}>
          <AuthCard methods={methods} />
        </Suspense>
      </section>
    </PageShell>
  );
}
