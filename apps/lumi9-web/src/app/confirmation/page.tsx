import type { Metadata } from "next";
import Link from "next/link";
import { MinimalNav } from "@/components/site/Nav";
import { ConfirmationView } from "@/components/checkout/ConfirmationView";
import { getOrderByNo } from "@femi9/core/services/checkout";
import { verifyOrderToken } from "@femi9/core/order-token";

export const metadata: Metadata = {
  title: "Order confirmed",
  description: "Your Cloud Soft order is on its way.",
  robots: { index: false },
};

/**
 * The confirmation reads the REAL order, not a copy kept in the browser.
 *
 * `?t=` is an unguessable capability token minted when the order was placed. It
 * is what lets a guest — who has no session — see her own order without order
 * numbers becoming guessable: without a valid token this renders the same
 * "nothing to show" state as an order that does not exist, so the page never
 * confirms whether a given order number is real.
 */
export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; t?: string }>;
}) {
  const { order: orderNo, t } = await searchParams;

  const authorized = Boolean(orderNo && verifyOrderToken(orderNo, t));
  const order = authorized && orderNo ? await getOrderByNo("lumi9", orderNo) : null;

  return (
    <>
      <MinimalNav />
      <main>
        {order ? (
          <ConfirmationView order={order} />
        ) : (
          <section className="px-safe mx-auto max-w-[760px] py-section text-center">
            <h1 className="m-0 mb-3 font-display text-[clamp(27px,7vw,54px)] font-normal">
              No recent order
            </h1>
            <p className="m-0 mb-7 text-lg text-muted">
              Once you place an order, your confirmation and tracking will appear here.
            </p>
            <Link href="/shop" className="btn btn-dark font-bold">
              Shop Cloud Soft
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
