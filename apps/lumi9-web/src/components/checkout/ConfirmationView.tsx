"use client";

import Image from "next/image";
import Link from "next/link";
import { resolveLine, useCart } from "@/lib/cart";
import { inr, shippingLabel } from "@/lib/catalog";

const TIMELINE = [
  { dot: "#6E7E3E", title: "Order confirmed", body: "Just now · we’ve received your order." },
  { dot: "#8A9C52", title: "Packed & dispatched", body: "Within 24 hours from our Erode facility." },
  { dot: "#c7cdb4", title: "Out for delivery", body: "We’ll text you tracking as soon as it moves." },
];

export function ConfirmationView() {
  const { lastOrder, ready } = useCart();

  if (!ready) {
    return <div className="mx-auto my-25 h-40 max-w-[760px] animate-pulse rounded-3xl bg-canvas" aria-hidden />;
  }

  if (!lastOrder) {
    return (
      <section className="px-safe mx-auto max-w-[760px] py-section text-center">
        <h1 className="m-0 mb-3 font-display text-[clamp(27px,7vw,54px)] font-normal">No recent order</h1>
        <p className="m-0 mb-7 text-lg text-muted">
          Once you place an order, your confirmation and tracking will appear here.
        </p>
        <Link href="/shop" className="btn btn-dark font-bold">
          Shop Cloud Soft
        </Link>
      </section>
    );
  }

  const lines = lastOrder.lines.map(resolveLine);

  return (
    <section className="px-safe mx-auto max-w-[760px] pt-[clamp(40px,6vw,70px)] pb-section">
      <div className="mb-11 text-center">
        <div className="mx-auto mb-6 flex size-[clamp(60px,8vw,76px)] items-center justify-center rounded-full bg-moss-tint text-[clamp(28px,4vw,38px)] text-moss-deep">
          ✓
        </div>
        <div className="eyebrow mb-3.5">Order confirmed</div>
        <h1 className="m-0 mb-3.5 font-display text-[clamp(27px,7.6vw,54px)] font-normal leading-[1.04] md:text-[clamp(32px,4.4vw,54px)]">
          Thank you, {lastOrder.firstName}! 🥑
        </h1>
        <p className="m-0 text-lg text-muted">
          Your Cloud Soft order is on its way. A confirmation is in your inbox.
        </p>
      </div>

      <div className="panel mb-5.5 p-card">
        <dl className="mb-5.5 grid grid-cols-2 gap-4 border-b border-moss-tint pb-5.5 sm:flex sm:flex-wrap sm:justify-between">
          <div>
            <dt className="mb-1 text-xs text-muted">Order number</dt>
            <dd className="m-0 text-base font-bold">{lastOrder.id}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-muted">Estimated delivery</dt>
            <dd className="m-0 text-base font-bold">{lastOrder.eta}</dd>
          </div>
          <div>
            <dt className="mb-1 text-xs text-muted">Ship to</dt>
            <dd className="m-0 text-base font-bold">{lastOrder.shipTo}</dd>
          </div>
        </dl>

        <div className="mb-5.5 flex flex-col gap-4">
          {lines.map((line) => (
            <div key={line.key} className="flex items-center gap-3.5">
              <div className="relative size-[clamp(52px,5vw,60px)] shrink-0 overflow-hidden rounded-chip bg-shell">
                <Image src={line.image} alt="" fill sizes="60px" className="object-cover" />
                <span className="absolute -top-1.5 -right-1.5 flex size-5.5 items-center justify-center rounded-full bg-midnight text-xs font-bold text-butter">
                  {line.qty}
                </span>
              </div>
              <div className="flex-1">
                <div className="text-[15px] font-bold">Cloud Soft — {line.name}</div>
                <div className="text-[13px] text-muted">{line.count} pants</div>
              </div>
              <div className="text-[15px] font-bold">{inr(line.lineTotal)}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-moss-tint pt-5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Subtotal</span>
            <span className="font-semibold">{inr(lastOrder.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Delivery</span>
            <span className="font-semibold text-moss-deep">{shippingLabel(lastOrder.shipping)}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-moss-tint pt-3">
            <span className="text-base font-bold">Total paid</span>
            <span className="font-display text-[clamp(20px,2.2vw,24px)]">{inr(lastOrder.total)}</span>
          </div>
        </div>
      </div>

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

      <div className="flex flex-wrap justify-center gap-3.5">
        <Link href="/account" className="btn btn-dark font-bold">
          Track my order
        </Link>
        <Link href="/shop" className="btn btn-ghost">
          Continue shopping
        </Link>
      </div>
    </section>
  );
}
