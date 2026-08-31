import Image from "next/image";
import Link from "next/link";
import type { OrderConfirmation } from "@femi9/core/services/checkout";
import { inr, shippingLabel } from "@/lib/catalog";
import { loadCatalog } from "@/lib/catalog.server";
import { presentStatus } from "@/lib/order-status";
import { RetryPayment } from "@/components/checkout/RetryPayment";

/**
 * The confirmation, rendered from the ORDER as the database has it.
 *
 * It used to read a copy the browser kept in localStorage, which meant the
 * screen could disagree with what was actually bought - and showed nothing at
 * all on another device. This is a server component now: no cart, no
 * catalogue, no "ready" flicker.
 *
 * The one thing it does read the catalogue for is the pack photo: the order
 * snapshots the name, label and price at purchase, but not an image, so each
 * line is joined back to its variant to find one. A line whose variant has
 * since been retired keeps the plain quantity chip.
 */

/*
 * The timeline is only true once the money has arrived.
 *
 * It used to render unconditionally, so an unpaid order was told "Order
 * confirmed · Just now · we’ve received your order" and promised dispatch
 * within 24 hours. Nothing had been received and nothing was going to be
 * packed.
 */
const TIMELINE = [
  { dot: "#6E7E3E", title: "Payment received", body: "We have your order and the money has cleared." },
  { dot: "#8A9C52", title: "Packed & dispatched", body: "Within 24 hours from our Erode facility." },
  { dot: "#c7cdb4", title: "Out for delivery", body: "We’ll text you tracking as soon as it moves." },
];

export async function ConfirmationView({
  order,
  /** The capability token this page was opened with, so "Track my order" works
   *  for a GUEST as well as for a signed-in shopper. */
  token,
}: {
  order: OrderConfirmation;
  token?: string;
}) {
  // variantId → pack photo, built once for the whole line list.
  const { sizes } = await loadCatalog();
  const photos = new Map(
    sizes.flatMap((size) => size.packs.map((pack) => [pack.variantId, pack.image] as const)),
  );

  // The greeting uses the first word of the name on the order.
  const firstName = order.customerName.trim().split(/\s+/)[0] || "there";
  const shipTo = order.address
    ? [order.address.city, order.address.state].filter(Boolean).join(", ")
    : "your address";

  /* Everything above the receipt now comes from the ORDER, not from the
     assumption that reaching this URL means the payment worked. */
  const view = presentStatus(order.status);

  return (
    <section className="px-safe mx-auto max-w-[760px] pt-[clamp(40px,6vw,70px)] pb-section">
      <div className="mb-11 text-center">
        <div
          className={`mx-auto mb-6 flex size-[clamp(60px,8vw,76px)] items-center justify-center rounded-full text-[clamp(28px,4vw,38px)] ${
            view.tone === "good"
              ? "bg-moss-tint text-moss-deep"
              : view.tone === "waiting"
                ? "bg-butter text-midnight"
                : "bg-[#fdeceb] text-[#8a2a20]"
          }`}
          aria-hidden
        >
          {/* A tick is a claim. It is only drawn once one is true. */}
          {view.tone === "good" ? "✓" : view.tone === "waiting" ? "•••" : "!"}
        </div>
        <div className="eyebrow mb-3.5">{view.eyebrow}</div>
        <h1 className="m-0 mb-3.5 font-display text-[clamp(27px,7.6vw,54px)] font-normal leading-[1.04] md:text-[clamp(32px,4.4vw,54px)]">
          {view.headline(firstName)}
        </h1>
        <p className="m-0 text-lg text-muted">{view.body}</p>

        {/* The cart was consumed when the pending order was created, so without
            this she has an unpaid order and no route back to paying for it. */}
        {view.awaitingPayment && (
          <div className="mt-7">
            <RetryPayment orderNo={order.orderNo} token={token} amount={order.total} />
          </div>
        )}
      </div>

      <div className="panel mb-5.5 p-card">
        <dl className="mb-5.5 grid grid-cols-2 gap-4 border-b border-moss-tint pb-5.5 sm:flex sm:flex-wrap sm:justify-between">
          <div>
            <dt className="mb-1 text-xs text-muted">Order number</dt>
            <dd className="m-0 text-base font-bold">{order.orderNo}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-muted">Placed</dt>
            <dd className="m-0 text-base font-bold">
              {new Date(order.placedAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-muted">Ship to</dt>
            <dd className="m-0 text-base font-bold">{shipTo}</dd>
          </div>
        </dl>

        <div className="mb-5.5 flex flex-col gap-4">
          {/* Names and prices are the ones snapshotted at purchase, so this
              still reads correctly after the catalogue changes. */}
          {order.items.map((item, index) => {
            const photo = photos.get(item.variantId);
            return (
              <div key={`${item.productName}-${index}`} className="flex items-center gap-3.5">
                <div className="relative size-[clamp(52px,5vw,60px)] shrink-0">
                  {photo ? (
                    <>
                      <span className="absolute inset-0 overflow-hidden rounded-chip bg-shell">
                        <Image src={photo} alt="" fill sizes="60px" className="object-cover" />
                      </span>
                      <span className="absolute -top-1.5 -right-1.5 z-1 flex size-5.5 items-center justify-center rounded-full bg-midnight text-xs font-bold text-butter">
                        {item.qty}
                      </span>
                    </>
                  ) : (
                    <span className="flex size-full items-center justify-center rounded-chip bg-shell text-sm font-bold text-muted">
                      ×{item.qty}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-[15px] font-bold">{item.productName}</div>
                  <div className="text-[13px] text-muted">{item.variantLabel}</div>
                </div>
                <div className="text-[15px] font-bold">{inr(item.lineTotal)}</div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-moss-tint pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold">{inr(order.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Delivery</span>
            <span className="font-semibold text-moss-deep">{shippingLabel(order.shipping)}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-moss-tint pt-3">
            {/* "Total paid" is a statement about money that has moved. It had
                better only be made once it has. */}
            <span className="text-base font-bold">
              {view.settled ? "Total paid" : view.awaitingPayment ? "Total due" : "Order total"}
            </span>
            <span className="font-display text-[clamp(20px,2.2vw,24px)]">{inr(order.total)}</span>
          </div>
        </div>
      </div>

      {/* Only for an order that is actually going somewhere. Promising dispatch
          within 24 hours on an unpaid order is the same lie as the tick. */}
      {view.settled && (
      <div className="panel mb-7.5 p-card">
        <h2 className="m-0 mb-6 font-display text-[22px] font-normal">What happens next</h2>
        <ol className="m-0 flex list-none flex-col p-0">
          {TIMELINE.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className="size-4 shrink-0 rounded-full" style={{ background: step.dot }} aria-hidden />
                {index < TIMELINE.length - 1 && <div className="min-h-5.5 w-0.5 flex-1 bg-moss-tint" aria-hidden />}
              </div>
              <div className="pb-5.5">
                <div className="text-[15px] font-bold text-midnight">{step.title}</div>
                <div className="text-sm text-muted">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      )}

      <div className="flex flex-wrap justify-center gap-3.5">
        {/* Points at the ORDER, carrying the same capability token, rather than
            at /account. A guest has no session, so "Track my order" used to
            bounce her through the guard to a sign-in form for an account she
            does not have - one click after paying. */}
        <Link
          href={`/order/${order.orderNo}${token ? `?t=${encodeURIComponent(token)}` : ""}`}
          className="btn btn-dark font-bold"
        >
          Track my order
        </Link>
        <Link href="/shop" className="btn btn-ghost">
          Continue shopping
        </Link>
      </div>
    </section>
  );
}
