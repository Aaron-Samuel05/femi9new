import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/site/PageShell";
import { PRIMARY_LINKS } from "@/components/site/Nav";
import { AccountDashboard } from "@/components/account/AccountDashboard";
import { getSession } from "@femi9/core/auth";
import { getAccountData } from "@femi9/core/services/account";

// Reads the session cookie and per-user rows, so it must render per request —
// never statically cached and served to the wrong shopper.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My account",
  description: "Orders, subscription, saved addresses and your profile.",
  robots: { index: false },
};

/**
 * The account page reads the signed-in shopper's real data.
 *
 * `proxy.ts` already bounced anyone without a session, but this checks again:
 * a matcher is a routing rule, not an authorisation, and this page renders
 * somebody's order history.
 *
 * It also re-runs the ONBOARDING gate. An account that never captured a name,
 * an email or a number cannot render a member surface honestly — it greets
 * "Hi, there", shows an order history with nowhere to deliver to, and lets
 * checkout ask for all of it again. Typing the URL does not bypass that; the
 * shopper goes to /welcome and comes back here.
 */
export default async function AccountPage() {
  const session = await getSession("lumi9");
  if (!session) redirect("/login?next=/account");

  const data = await getAccountData("lumi9", session.sub);
  // A session whose user has since been deleted: treat as signed out rather
  // than rendering an empty shell.
  if (!data) redirect("/login?next=/account");
  if (!data.user.profileComplete) redirect("/welcome?next=%2Faccount");

  const firstName = (data.user.name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <PageShell links={PRIMARY_LINKS} cta="both">
      <header className="px-safe mx-auto max-w-[1240px] pt-[clamp(32px,4.4vw,56px)] pb-8.5">
        <div className="eyebrow mb-3">My account</div>
        <h1 className="m-0 font-display text-[clamp(27px,7.4vw,52px)] md:text-[clamp(32px,4vw,52px)] font-normal leading-[1.02]">
          Hi, {firstName} 👋
        </h1>
      </header>

      <AccountDashboard
        user={data.user}
        orders={data.orders}
        addresses={data.addresses}
        subscriptions={data.subscriptions}
        pointsBalance={data.pointsBalance}
      />
    </PageShell>
  );
}
