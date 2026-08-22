import type { Metadata } from "next";
import { MinimalNav } from "@/components/site/Nav";
import { ConfirmationView } from "@/components/checkout/ConfirmationView";

export const metadata: Metadata = {
  title: "Order confirmed",
  description: "Your Cloud Soft order is on its way.",
  robots: { index: false },
};

export default function ConfirmationPage() {
  return (
    <>
      <MinimalNav />
      <main>
        <ConfirmationView />
      </main>
    </>
  );
}
