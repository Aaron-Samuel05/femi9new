"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { ACCOUNT_ADDRESSES, ACCOUNT_ORDERS, ACCOUNT_STATS } from "@/lib/content";
import { getSizeOrDefault, defaultPack } from "@/lib/catalog";

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "orders", label: "Orders", icon: "list" },
  { key: "subscription", label: "Subscription", icon: "grow" },
  { key: "addresses", label: "Addresses", icon: "pin" },
];

type Tab = "overview" | "orders" | "subscription" | "addresses";

type Order = (typeof ACCOUNT_ORDERS)[number];

function OrderRow({ order, action }: { order: Order; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-moss-tint py-4">
      <div className="flex items-center gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-chip bg-moss-tint font-display font-bold text-moss-deep">
          {order.size}
        </div>
        <div>
          <div className="text-[clamp(14px,1.3vw,15px)] font-bold">{order.title}</div>
          <div className="text-[13px] text-muted">
            {order.id} · {order.date}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-[clamp(10px,1.4vw,18px)]">
        <span className="rounded-pill bg-moss-tint px-3 py-1.25 text-xs font-semibold text-moss-deep">
          {order.status}
        </span>
        <span className="text-[15px] font-bold">{order.total}</span>
        {action}
      </div>
    </div>
  );
}

/** Sidebar tabs (overview / orders / subscription / addresses) switching the panel. */
export function AccountDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const { add } = useCart();

  function reorder(order: Order) {
    const size = getSizeOrDefault(order.size);
    const match = order.title.match(/(\d+)\s*pcs/);
    const count = match ? Number(match[1]) : defaultPack(size).count;
    add(size.size, count);
  }

  return (
    <section className="px-safe mx-auto grid max-w-[1240px] grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] pb-section lg:grid-cols-[minmax(210px,250px)_1fr]">
      <aside className="flex flex-col gap-1 rounded-card border border-moss-tint bg-canvas p-3.5 lg:sticky lg:top-24">
        <div className="scroll-row gap-1 lg:flex-col" role="tablist" aria-label="Account sections">
          {TABS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={tab === option.key}
              onClick={() => setTab(option.key)}
              className={`flex shrink-0 cursor-pointer items-center gap-3 rounded-chip px-4 py-3.5 text-left text-[clamp(14px,1.3vw,15px)] font-semibold whitespace-nowrap transition-colors ${
                tab === option.key ? "bg-moss-tint text-midnight" : "text-muted hover:text-midnight"
              }`}
            >
              <Icon name={option.icon} size={19} strokeWidth={1.7} />
              {option.label}
            </button>
          ))}
        </div>
        <div className="mx-1.5 my-2 h-px bg-moss-tint" />
        <Link
          href="/"
          className="flex items-center gap-3 rounded-chip px-4 py-3.5 text-[clamp(14px,1.3vw,15px)] font-semibold text-muted hover:text-midnight"
        >
          <Icon name="logout" size={19} strokeWidth={1.7} />
          Sign out
        </Link>
      </aside>

      <div>
        {tab === "overview" && (
          <div className="flex flex-col gap-5.5">
            <div className="grid grid-cols-1 gap-[clamp(12px,1.6vw,18px)] min-[420px]:grid-cols-3">
              {ACCOUNT_STATS.map((stat) => (
                <div key={stat.label} className="rounded-card border border-moss-tint bg-canvas p-card">
                  <div className="mb-2 font-display text-[clamp(24px,3vw,34px)] leading-none text-moss-deep">{stat.value}</div>
                  <div className="text-[clamp(12px,1.2vw,14px)] text-muted">{stat.label}</div>
                </div>
              ))}
            </div>

            <div
              className="flex flex-wrap items-center justify-between gap-6 rounded-card p-card text-butter"
              style={{ background: "linear-gradient(120deg,#272C05,#3a4310)" }}
            >
              <div>
                <div className="mb-3 text-xs font-bold tracking-[0.16em] text-gold">NEXT SUBSCRIPTION BOX</div>
                <div className="mb-2 font-display text-[clamp(21px,2.8vw,30px)]">Cloud Soft — Medium · 54 pcs</div>
                <div className="text-[clamp(13px,1.3vw,15px)] opacity-85">Ships 24 Feb 2026 · ₹759/mo (20% off)</div>
              </div>
              <button type="button" onClick={() => setTab("subscription")} className="btn btn-cream btn-sm py-3.5">
                Manage box
              </button>
            </div>

            <div className="panel p-card">
              <div className="mb-5.5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 font-display text-[clamp(20px,2.2vw,24px)] font-normal">Recent orders</h2>
                <button
                  type="button"
                  onClick={() => setTab("orders")}
                  className="inline-flex cursor-pointer items-center coarse:min-h-10 text-sm font-semibold text-moss-deep hover:text-midnight"
                >
                  View all →
                </button>
              </div>
              {ACCOUNT_ORDERS.slice(0, 2).map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="panel p-card">
            <h2 className="m-0 mb-5.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal">Order history</h2>
            {ACCOUNT_ORDERS.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                action={
                  <button
                    type="button"
                    onClick={() => reorder(order)}
                    className="cursor-pointer rounded-pill border-[1.5px] border-midnight px-4 py-2 text-[13px] font-semibold text-midnight transition-colors hover:bg-midnight hover:text-butter"
                  >
                    Reorder
                  </button>
                }
              />
            ))}
          </div>
        )}

        {tab === "subscription" && (
          <div className="panel p-card">
            <div className="mb-6.5 flex flex-wrap items-start justify-between gap-4.5">
              <div>
                <div className="mb-2.5 text-xs font-bold tracking-[0.14em] text-moss-deep">ACTIVE PLAN</div>
                <h2 className="m-0 mb-1.5 font-display text-[clamp(22px,2.8vw,28px)] font-normal">Cloud Soft — Medium</h2>
                <div className="text-[15px] text-muted">54 pants · every 4 weeks</div>
              </div>
              <span className="rounded-pill bg-[#e4f0df] px-3.75 py-1.75 text-[13px] font-semibold text-[#2f7d32]">
                Active · saving 20%
              </span>
            </div>

            <div className="mb-6.5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
              {[
                { label: "Next delivery", value: "24 Feb 2026" },
                { label: "Monthly price", value: "₹759" },
                { label: "Auto size-up", value: "On" },
              ].map((item) => (
                <div key={item.label} className="rounded-chip bg-paper p-[clamp(14px,1.8vw,20px)]">
                  <div className="mb-1.5 text-xs text-muted">{item.label}</div>
                  <div className="text-base font-bold">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/subscription#build" className="btn btn-dark btn-sm py-3.25">
                Change size or pack
              </Link>
              <button
                type="button"
                className="cursor-pointer rounded-pill border-[1.5px] border-moss-tint px-6 py-3.25 text-sm font-semibold text-midnight transition-colors hover:border-moss-soft"
              >
                Skip next box
              </button>
              <button
                type="button"
                className="cursor-pointer rounded-pill border-[1.5px] border-moss-tint px-6 py-3.25 text-sm font-semibold text-muted transition-colors hover:border-moss-soft"
              >
                Pause
              </button>
            </div>
          </div>
        )}

        {tab === "addresses" && (
          <div className="panel p-card">
            <div className="mb-5.5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="m-0 font-display text-[clamp(21px,2.6vw,26px)] font-normal">Saved addresses</h2>
              <button type="button" className="btn btn-dark btn-sm py-2.75">
                + Add new
              </button>
            </div>
            <div className="grid grid-cols-1 gap-[clamp(12px,1.6vw,18px)] md:grid-cols-2">
              {ACCOUNT_ADDRESSES.map((address) => (
                <div key={address.label} className="rounded-chip border-[1.5px] border-moss-tint p-[clamp(16px,2vw,24px)]">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-[15px] font-bold">{address.label}</span>
                    {address.isDefault && (
                      <span className="rounded-pill bg-moss-tint px-2.5 py-1 text-[12px] font-semibold text-moss-deep">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="m-0 text-sm leading-[1.6] text-muted">{address.lines}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
