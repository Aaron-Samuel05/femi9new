import type { Metadata } from "next";
import { PageShell } from "@/components/site/PageShell";
import { PRIMARY_LINKS } from "@/components/site/Nav";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = {
  title: "Your cart",
  description: "Review your Cloud Soft basket — free delivery on orders over ₹999.",
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <PageShell links={PRIMARY_LINKS} cta="cart">
      <CartView />
    </PageShell>
  );
}
