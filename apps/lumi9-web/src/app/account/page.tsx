import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { AccountDashboard } from "@/components/account/AccountDashboard";

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

export default function AccountPage() {
  return (
    <PageShell links={ACCOUNT_LINKS} cta="shop">
      <header className="px-safe mx-auto max-w-[1240px] pt-[clamp(32px,4.4vw,56px)] pb-8.5">
        <div className="eyebrow mb-3">My account</div>
        <h1 className="m-0 font-display text-[clamp(27px,7.4vw,52px)] md:text-[clamp(32px,4vw,52px)] font-normal leading-[1.02]">Hi, Ananya 👋</h1>
      </header>

      <AccountDashboard />
    </PageShell>
  );
}
