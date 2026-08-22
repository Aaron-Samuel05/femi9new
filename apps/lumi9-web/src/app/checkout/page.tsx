import type { Metadata } from "next";
import { CheckoutNav } from "@/components/site/Nav";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Secure Lumi9 checkout.",
  robots: { index: false },
};

export default function CheckoutPage() {
  return (
    <>
      <CheckoutNav />
      <main>
        <CheckoutForm />
      </main>
    </>
  );
}
