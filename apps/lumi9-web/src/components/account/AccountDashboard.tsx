"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/auth-context";
import { inr } from "@/lib/catalog";
import type {
  AccountUser,
  AccountOrder,
  AccountAddress,
  AccountSubscription,
} from "@femi9/core/services/account";
import { AddressBook } from "@/components/account/AddressBook";
import { ProfilePanel } from "@/components/account/ProfilePanel";

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "orders", label: "Orders", icon: "list" },
  { key: "subscription", label: "Subscription", icon: "grow" },
  { key: "addresses", label: "Addresses", icon: "pin" },
  { key: "profile", label: "Profile", icon: "user" },
];

type Tab = "overview" | "orders" | "subscription" | "addresses" | "profile";

/**
 * Shown wherever a panel has nothing to list.
 *
 * A new customer used to reach a heading with silence underneath it, which
 * reads as a page that failed to load rather than an account with no orders
 * yet.
 */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="m-0 py-6 text-[clamp(14px,1.3vw,15px)] text-muted">{children}</p>;
}

function OrderRow({ order, action }: { order: AccountOrder; action?: React.ReactNode }) {
  // "2 items" beats an empty cell when an order has more than one line.
  const title =
    order.items.length === 1
      ? order.items[0]!.name
      : `${order.items.length} items`;
  const initial = title.replace(/^Cloud Soft - /, "").charAt(0).toUpperCase();
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-moss-tint py-4">
      {/* `order.href` has been on the DTO all along and nothing rendered it, so
          an order number on this page was a dead label - there was no way to see
          what was in an order, what it cost to ship, or where it went. */}
      <Link
        href={order.href}
        className="group flex items-center gap-4 no-underline"
        aria-label={`Order ${order.id}, ${order.status}`}
      >
        <div className="flex size-11 shrink-0 items-center justify-center rounded-chip bg-moss-tint font-display font-bold text-moss-deep">
          {initial}
        </div>
        <div>
          <div className="text-[clamp(14px,1.3vw,15px)] font-bold text-midnight group-hover:text-moss-deep">
            {title}
          </div>
          <div className="text-[13px] text-muted">
            {order.id} · {order.date}
          </div>
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-[clamp(10px,1.4vw,18px)]">
        <span className="rounded-pill bg-moss-tint px-3 py-1.25 text-xs font-semibold text-moss-deep">
          {order.status}
        </span>
        <span className="text-[15px] font-bold">{inr(order.total)}</span>
        {action}
      </div>
    </div>
  );
}

/**
 * Skip / pause / resume / cancel, against PATCH /api/subscriptions/[id].
 *
 * Ownership is enforced server-side - the service scopes every mutation by
 * { id, userId } - so nothing here needs to prove the plan is hers; a plan that
 * is not comes back 404 and the message below says so.
 *
 * `router.refresh()` rather than local state: the row is rendered from a server
 * component reading the database, and re-reading it is the only way the next
 * delivery date and saved total stay true after a skip.
 */
function SubscriptionControls({ plan }: { plan: AccountSubscription }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "pause" | "resume" | "skip" | "cancel") {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/subscriptions/${plan.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "That did not work. Please try again.");
    } catch {
      setError("Network error - please try again.");
    } finally {
      setBusy(null);
    }
  }

  const ghost =
    "rounded-pill border-[1.5px] border-moss-tint px-6 py-3.25 text-sm font-semibold text-midnight transition-colors hover:border-moss-soft disabled:opacity-60";

  return (
    <>
      {error && (
        <p className="m-0 mb-3 text-sm text-[#b4232c]" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href="/subscription#build" className="btn btn-dark btn-sm py-3.25">
          Change size or pack
        </Link>

        {plan.status === "active" && (
          <>
            <button type="button" onClick={() => act("skip")} disabled={busy !== null} className={ghost}>
              {busy === "skip" ? "Skipping…" : "Skip next box"}
            </button>
            <button type="button" onClick={() => act("pause")} disabled={busy !== null} className={ghost}>
              {busy === "pause" ? "Pausing…" : "Pause"}
            </button>
          </>
        )}

        {plan.status === "paused" && (
          <button type="button" onClick={() => act("resume")} disabled={busy !== null} className={ghost}>
            {busy === "resume" ? "Resuming…" : "Resume"}
          </button>
        )}

        {/* Cancelling is not reversible from here, so it is not offered on a
            plan that is already cancelled and it says what it is. */}
        {plan.status !== "cancelled" && (
          <button type="button" onClick={() => act("cancel")} disabled={busy !== null} className={ghost}>
            {busy === "cancel" ? "Cancelling…" : "Cancel subscription"}
          </button>
        )}
      </div>
    </>
  );
}

/** Sidebar tabs switching the panel: overview / orders / subscription /
 *  addresses / profile. */
export function AccountDashboard({
  user,
  orders,
  addresses,
  subscriptions,
  pointsBalance,
}: {
  user: AccountUser;
  orders: AccountOrder[];
  addresses: AccountAddress[];
  subscriptions: AccountSubscription[];
  pointsBalance: number;
}) {
  // `?tab=subscription` so a link can land on a panel - the box builder sends
  // the shopper straight to her new plan after starting one. Anything that is
  // not a known tab falls back to overview rather than rendering nothing.
  const requested = useSearchParams().get("tab");
  const [tab, setTab] = useState<Tab>(
    TABS.some((t) => t.key === requested) ? (requested as Tab) : "overview",
  );
  const { addMany } = useCart();
  const { signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  /**
   * The customer's own figures.
   *
   * These three tiles used to be a constant - every account was told it had
   * placed 12 orders and saved Rs.2,940. Cancelled and refunded orders are
   * left out of the total spent, because money that came back is not money
   * spent.
   */
  const paidOrders = orders.filter(
    (order) => order.statusKey !== "cancelled" && order.statusKey !== "refunded",
  );
  const totalSpent = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const stats = [
    { value: String(orders.length), label: orders.length === 1 ? "Order placed" : "Orders placed" },
    { value: inr(totalSpent), label: "Spent with Lumi9" },
    { value: String(pointsBalance), label: "Reward points" },
  ];

  // Newest first, so a paused plan still shows rather than falling behind a
  // "no subscription" empty state.
  const plan = subscriptions[0] ?? null;
  const upcoming = subscriptions.find((s) => s.status === "active") ?? null;

  /**
   * Put the exact lines back in the bag.
   *
   * The order carries the variant ids it was placed with, so this does not have
   * to parse "54 pcs" out of a title and hope the catalogue still has that pack
   * - and a size discontinued since is simply not re-added rather than silently
   * becoming a different one.
   *
   * It used to fire one POST per line in a bare `for` loop, unawaited. Each
   * request returns the WHOLE cart, so the response that landed last won - and
   * that was not necessarily the one that had seen every line. A three-line
   * reorder could leave the basket showing one item while the server held
   * three, with nothing on screen to say so. `addMany` sends them in order and
   * opens the drawer, so the result is both correct and visible.
   */
  function reorder(order: AccountOrder) {
    void addMany(order.items.map((item) => ({ variantId: item.variantId, qty: item.qty })));
  }

  return (
    <section className="page-wrap grid grid-cols-1 items-start gap-[clamp(20px,3vw,40px)] pb-section lg:grid-cols-[minmax(210px,250px)_1fr]">
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
        {/* A link to "/" left the session cookie in place: it looked like a
            sign-out and wasn't one. */}
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut();
          }}
          className="flex cursor-pointer items-center gap-3 rounded-chip px-4 py-3.5 text-left text-[clamp(14px,1.3vw,15px)] font-semibold text-muted hover:text-midnight disabled:opacity-60"
        >
          <Icon name="logout" size={19} strokeWidth={1.7} />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </aside>

      <div>
        {tab === "overview" && (
          <div className="flex flex-col gap-5.5">
            <div className="grid grid-cols-1 gap-[clamp(12px,1.6vw,18px)] min-[420px]:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-card border border-moss-tint bg-canvas p-card">
                  <div className="mb-2 font-display text-[clamp(24px,3vw,34px)] leading-none text-moss-deep">{stat.value}</div>
                  <div className="text-[clamp(12px,1.2vw,14px)] text-muted">{stat.label}</div>
                </div>
              ))}
            </div>

            {upcoming && (
              <div
                className="flex flex-wrap items-center justify-between gap-6 rounded-card p-card text-butter"
                style={{ background: "linear-gradient(120deg,#272C05,#3a4310)" }}
              >
                <div>
                  <div className="mb-3 text-xs font-bold tracking-[0.16em] text-gold">NEXT SUBSCRIPTION BOX</div>
                  <div className="mb-2 font-display text-[clamp(21px,2.8vw,30px)]">
                    {upcoming.product} · {upcoming.qty} pcs
                  </div>
                  <div className="text-[clamp(13px,1.3vw,15px)] opacity-85">
                    Ships {upcoming.nextDelivery}
                    {upcoming.saved > 0 && <> · saving {inr(upcoming.saved)}</>}
                  </div>
                </div>
                <button type="button" onClick={() => setTab("subscription")} className="btn btn-cream btn-sm py-3.5">
                  Manage box
                </button>
              </div>
            )}

            <div className="panel p-card">
              <div className="mb-5.5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="m-0 font-display text-[clamp(20px,2.2vw,24px)] font-normal">Recent orders</h2>
                <button
                  type="button"
                  onClick={() => setTab("orders")}
                  className="inline-flex cursor-pointer items-center coarse:min-h-11 text-sm font-semibold text-moss-deep hover:text-midnight"
                >
                  View all →
                </button>
              </div>
              {orders.length === 0 ? (
                <Empty>
                  No orders yet. <Link href="/shop" className="underline">Browse the range</Link> to place your first.
                </Empty>
              ) : (
                orders.slice(0, 2).map((order) => <OrderRow key={order.id} order={order} />)
              )}
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="panel p-card">
            <h2 className="m-0 mb-5.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal">Order history</h2>
            {orders.length === 0 ? (
              <Empty>Your orders will appear here once you have placed one.</Empty>
            ) : (
              orders.map((order) => (
                <OrderRow
                  key={order.id}
                  order={order}
                  action={
                    <button
                      type="button"
                      onClick={() => reorder(order)}
                      className="chip shrink-0 cursor-pointer border-midnight font-semibold text-midnight transition-colors hover:bg-midnight hover:text-butter"
                    >
                      Reorder
                    </button>
                  }
                />
              ))
            )}
          </div>
        )}

        {tab === "subscription" && (
          <div className="panel p-card">
            {!plan ? (
              <>
                <h2 className="m-0 mb-2 font-display text-[clamp(21px,2.6vw,26px)] font-normal">
                  No subscription yet
                </h2>
                <Empty>
                  A subscription delivers your size on a schedule and adjusts as your baby grows.{" "}
                  <Link href="/subscription" className="underline">
                    See how it works
                  </Link>
                  .
                </Empty>
              </>
            ) : (
              <>
                <div className="mb-6.5 flex flex-wrap items-start justify-between gap-4.5">
                  <div>
                    <div className="mb-2.5 text-xs font-bold tracking-[0.14em] text-moss-deep">
                      {plan.status === "active" ? "ACTIVE PLAN" : plan.status.toUpperCase() + " PLAN"}
                    </div>
                    <h2 className="m-0 mb-1.5 font-display text-[clamp(22px,2.8vw,28px)] font-normal">
                      {plan.product}
                    </h2>
                    <div className="text-[15px] text-muted">
                      {plan.qty} pants · {plan.frequency}
                    </div>
                  </div>
                  {/* Colour follows the real status - a paused plan showed a green
                      "Active" pill, which is the one thing the badge exists to say. */}
                  <span
                    className={`rounded-pill px-3.75 py-1.75 text-[13px] font-semibold ${
                      plan.status === "active"
                        ? "bg-[#e4f0df] text-[#2f7d32]"
                        : "bg-moss-tint text-muted"
                    }`}
                  >
                    {plan.status === "active" ? "Active" : plan.status === "paused" ? "Paused" : "Cancelled"}
                    {plan.saved > 0 && plan.status === "active" && <> · saving {inr(plan.saved)}</>}
                  </span>
                </div>

                <div className="mb-6.5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-3">
                  {[
                    { label: "Next delivery", value: plan.status === "active" ? plan.nextDelivery : "-" },
                    { label: "Every", value: plan.frequency },
                    { label: "Pack size", value: `${plan.qty} pants` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-chip bg-paper p-[clamp(14px,1.8vw,20px)]">
                      <div className="mb-1.5 text-xs text-muted">{item.label}</div>
                      <div className="text-base font-bold">{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Real controls now. These were a link to /contact, with a
                    comment saying the PATCH endpoint did not exist yet - so
                    "Skip, pause or cancel anytime" on the subscription page was
                    a promise the site could only keep by email. */}
                <SubscriptionControls plan={plan} />
              </>
            )}
          </div>
        )}

        {/* Both panels write. The address book used to be a read-only list and
            the profile did not exist at all, which meant the only way to fix a
            wrong pincode or add a missing phone number was to place another
            order. */}
        {tab === "addresses" && <AddressBook addresses={addresses} />}

        {tab === "profile" && <ProfilePanel user={user} />}
      </div>
    </section>
  );
}
