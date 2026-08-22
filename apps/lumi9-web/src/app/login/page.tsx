import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Track orders, manage your subscription, and reorder in a tap.",
};

const AUTH_LINKS = [
  { label: "Shop", href: "/shop" },
  { label: "About", href: "/about" },
  { label: "Journal", href: "/journal" },
  { label: "Help", href: "/help" },
];

export default function LoginPage() {
  return (
    <PageShell links={AUTH_LINKS} cta="shop">
      <section className="px-safe mx-auto max-w-[1040px] pt-[clamp(28px,4.6vw,60px)] pb-section">
        <AuthCard />
      </section>
    </PageShell>
  );
}
