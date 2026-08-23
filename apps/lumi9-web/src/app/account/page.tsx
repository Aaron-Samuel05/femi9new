import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/site/PageShell";
import { AccountDashboard } from "@/components/account/AccountDashboard";
import { getSession } from "@femi9/core/auth";
import { getAccountData } from "@femi9/core/services/account";

export const metadata: Metadata = {
  title: "My account",
  description: "Orders, subscription and saved addresses.",
  robots: { index: false },
};

const ACCOUNT_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "Technology", href: "/#tech" },
  { label: "Journal", href: "/journal" },
  { label: "Account", href: "/account" },
];

/**
 * The account page reads the signed-in shopper's real data.
 *
 * `proxy.ts` already bounced anyone without a session, but this checks again:
 * a matcher is a routing rule, not an authorisation, and this page renders
 * somebody's order history.
 */
export default async function AccountPage() {
  const session = await getSession("lumi9");
  if (!session) redirect("/login?next=/account");

  const data = await getAccountData("lumi9", session.sub);
  // A session whose user has since been deleted: treat as signed out rather
  // than rendering an empty shell.
  if (!data) redirect("/login?next=/account");

  const firstName = (data.user.name ?? "").trim().split(/\s+/)[0] || "there";

  return (
    <PageShell links={ACCOUNT_LINKS} cta="shop">
      <header className="px-safe mx-auto max-w-[1240px] pt-[clamp(32px,4.4vw,56px)] pb-8.5">
        <div className="eyebrow mb-3">My account</div>
        <h1 className="m-0 font-display text-[clamp(27px,7.4vw,52px)] md:text-[clamp(32px,4vw,52px)] font-normal leading-[1.02]">
          Hi, {firstName} 👋
        </h1>
      </header>

      <AccountDashboard orders={data.orders} addresses={data.addresses} />
    </PageShell>
  );
}
