import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByNo } from "@femi9/core/services/checkout";
import { verifyOrderToken } from "@femi9/core/order-token";
import { getSession } from "@femi9/core/auth";
import { dbFor } from "@femi9/db";
import { PageShell } from "@/components/site/PageShell";
import { NAV_LINKS } from "@/components/site/Nav";
import { Icon } from "@/components/ui/Icon";
import { inr } from "@/lib/catalog";
import { presentStatus } from "@/lib/order-status";
import { RetryPayment } from "@/components/checkout/RetryPayment";
import { ReorderButton } from "./ReorderButton";

// Reflects live order state (a status moves from paid to shipped without any
// deploy), so it renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your order",
  robots: { index: false, follow: false },
};

/*
 * Labels and tone come from `@/lib/order-status`, shared with the confirmation
 * page. This file used to carry its own STATUS_LABEL map and a GOOD set, which
 * is how the two pages ended up disagreeing: this one read the real status and
 * said "Awaiting payment confirmation" while /confirmation was hardcoded to
 * "Order confirmed" for the very same order.
 */

/**
 * /order/[orderNo] - one order, in full.
 *
 * `AccountOrder.href` has pointed at this path since the DTO was written and
 * there was no page at the other end: an order number on the account page was a
 * dead label, and there was no way to see what was in an order, what it cost to
 * ship, or which address it went to.
 *
 * ── Authorisation ───────────────────────────────────────────────────────────
 * This page shows a name, a full address and a phone number, and `orderNo` is
 * sequential - `LM-00042` is a guess away from `LM-00041`. So it is NOT public.
 * Access is EITHER:
 *
 *   • the unguessable capability token in `?t=`, which is how a GUEST reaches
 *     her own confirmation from the email without having an account, or
 *   • a session that owns the order.
 *
 * Anything else looks like enumeration and gets `notFound()` - the same answer
 * an order that does not exist gets, so the page never confirms whether a given
 * order number is real.
 */
export default async function OrderPage(props: {
  params: Promise<{ orderNo: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { orderNo } = await props.params;
  const searchParams = await props.searchParams;

  const order = await getOrderByNo("lumi9", orderNo);
  if (!order) notFound();

  const rawToken = searchParams?.t;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  let authorized = verifyOrderToken(orderNo, token);
  let signedIn = false;
  if (!authorized) {
    const session = await getSession("lumi9");
    if (session) {
      signedIn = true;
      const owned = await dbFor("lumi9").order.findFirst({
        where: { orderNo, userId: session.sub },
        select: { id: true },
      });
      authorized = owned !== null;
    }
  }
  if (!authorized) notFound();

  const view = presentStatus(order.status);
  const placed = order.placedAt.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <PageShell links={NAV_LINKS}>
      <section className="px-safe mx-auto max-w-[880px] pt-[clamp(28px,4.4vw,56px)] pb-section">
        <Link
          href={signedIn ? "/account?tab=orders" : "/shop"}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-midnight"
        >
          <Icon name="arrowLeft" size={16} strokeWidth={1.8} />
          {signedIn ? "Back to orders" : "Back to shop"}
        </Link>

        <header className="mb-8">
          <div className="eyebrow mb-3">Order {order.orderNo}</div>
          <h1 className="m-0 mb-3.5 font-display text-[clamp(27px,6vw,44px)] font-normal leading-[1.05]">
            {view.label}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <span
              className={`rounded-pill px-3 py-1.25 text-[13px] font-semibold ${
                view.tone === "good"
                  ? "bg-[#e4f0df] text-[#2f7d32]"
                  : view.tone === "waiting"
                    ? "bg-butter text-midnight"
                    : "bg-[#fdeceb] text-[#8a2a20]"
              }`}
            >
              {view.label}
            </span>
            <span>Placed {placed}</span>
          </div>
        </header>

        <div className="grid grid-cols-1 items-start gap-[clamp(18px,2.6vw,32px)] md:grid-cols-[1.4fr_1fr]">
          {/* LINES */}
          <div className="panel p-card">
            <h2 className="m-0 mb-4.5 font-display text-[clamp(18px,2.2vw,22px)] font-normal">
              What is in this order
            </h2>
            <ul className="m-0 list-none p-0">
              {order.items.map((item) => (
                <li
                  key={`${item.variantId}-${item.productName}`}
                  className="flex items-start justify-between gap-4 border-t border-moss-tint py-3.5 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0">
                    {/* The name and price are SNAPSHOTS taken at purchase. Never
                        re-derived from today's catalogue - a price change must
                        not rewrite what somebody already paid. */}
                    <div className="text-[15px] font-bold">{item.productName}</div>
                    <div className="text-[13px] text-muted">
                      {item.variantLabel} · {inr(item.unitPrice)} each × {item.qty}
                    </div>
                  </div>
                  <div className="shrink-0 text-[15px] font-bold">{inr(item.lineTotal)}</div>
                </li>
              ))}
            </ul>

            <div className="mt-5 border-t border-moss-tint pt-4">
              <Row label="Subtotal" value={inr(order.subtotal)} />
              <Row label="Delivery" value={order.shipping === 0 ? "Free" : inr(order.shipping)} />
              <div className="mt-2.5 flex items-center justify-between border-t border-moss-tint pt-3.5">
                <span className="text-base font-bold">Total paid</span>
                <span className="font-display text-[clamp(20px,2.4vw,26px)] leading-none">
                  {inr(order.total)}
                </span>
              </div>
            </div>

            {/* An unpaid order needs a way to be paid for, not a way to be
                ordered again - the lines are already on it. */}
            {view.awaitingPayment && (
              <div className="mt-5.5">
                <RetryPayment orderNo={order.orderNo} token={token} amount={order.total} />
              </div>
            )}

            <div className="mt-5.5">
              <ReorderButton
                items={order.items.map((item) => ({ variantId: item.variantId, qty: item.qty }))}
              />
            </div>

            {/*
              The receipt, as a PDF.

              A plain <a>, not a fetch-and-blob: the browser's own download is
              the thing that works on iOS Safari, survives a slow render without
              a spinner this page would have to own, and lets her long-press to
              share it - which is what a parent actually does with a receipt.

              The capability token is carried through when there is one. A guest
              arrived here by `?t=` and has no session, so without it the route
              answers 404 to the very person the button is for. A signed-in
              shopper has no `t` in the URL and does not need one; the route
              falls back to session ownership.
            */}
            <a
              href={`/api/orders/${encodeURIComponent(order.orderNo)}/invoice${
                token ? `?t=${encodeURIComponent(token)}` : ""
              }`}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-moss-tint px-6 py-3.25 text-sm font-semibold text-midnight transition-colors hover:border-moss-soft"
              // A cross-origin referrer would leak the token; same-origin keeps
              // the download working without publishing it.
              referrerPolicy="same-origin"
            >
              <Icon name="save" size={16} strokeWidth={1.8} />
              Download receipt (PDF)
            </a>
          </div>

          {/* ADDRESS */}
          <div className="panel p-card">
            <h2 className="m-0 mb-4 font-display text-[clamp(18px,2.2vw,22px)] font-normal">
              Delivering to
            </h2>
            {order.address ? (
              <address className="m-0 text-sm leading-[1.7] text-muted not-italic">
                <span className="font-bold text-midnight">{order.address.name}</span>
                <br />
                {order.address.line}
                <br />
                {order.address.city}
                {order.address.state ? `, ${order.address.state}` : ""}
                {order.address.pincode ? ` ${order.address.pincode}` : ""}
                {order.address.phone && (
                  <>
                    <br />
                    {order.address.phone}
                  </>
                )}
              </address>
            ) : (
              <p className="m-0 text-sm text-muted">
                No delivery address is attached to this order.
              </p>
            )}

            <p className="mt-6 mb-0 flex items-start gap-2 text-[13px] leading-[1.55] text-muted">
              <Icon name="chat" size={15} strokeWidth={1.7} />
              Something not right?{" "}
              <Link href="/contact" className="underline underline-offset-2">
                Get in touch
              </Link>{" "}
              with the order number and we will sort it.
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
