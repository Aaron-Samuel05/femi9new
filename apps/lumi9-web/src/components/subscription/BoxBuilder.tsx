"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CADENCES, inr, subscriptionPrice, type SizeCode } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import { authorizeMandate, type MandateAuthorization } from "@/lib/mandate";
import type { DbProductSize } from "@/lib/catalog.server";

/** Subscribable pack tiers - the 3-count trial packs aren't offered on subscription. */
function subscribablePacks(size: DbProductSize) {
  return size.packs.filter((pack) => pack.count >= 24);
}

export function BoxBuilder() {
  const router = useRouter();
  const { sizes, getSizeOrDefault, subscribeSavePct } = useCatalogData();
  const [sizeCode, setSizeCode] = useState<SizeCode>("M");
  const [packCount, setPackCount] = useState<number | null>(null);
  // The cadence CODE, not a display string. It used to be the label ("4 weeks")
  // from a copy module, which was never sent anywhere; the API resolves this
  // against the Cadence rows the seed writes.
  const [cadenceCode, setCadenceCode] = useState<string>("4w");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const size = getSizeOrDefault(sizeCode);
  const packs = subscribablePacks(size);
  const pack = packs.find((option) => option.count === packCount) ?? packs[packs.length - 1];
  const cadence = CADENCES.find((c) => c.code === cadenceCode) ?? CADENCES[1]!;

  /**
   * Start the subscription for real.
   *
   * "Start subscription" was a `<Link href="/checkout">`: it created nothing,
   * carried none of the size, pack or frequency chosen above, and applied no
   * discount - the shopper arrived at checkout with whatever was already in her
   * cart, at full price, having been told she was subscribing at a saving.
   *
   * A subscription belongs to an account (it has to: it recurs, and something
   * has to own it), so a guest is sent to sign in and returned here.
   *
   * TWO PHASES, and the second is what makes it recur. The POST creates the
   * Razorpay plan and mandate; nothing is ever debited until her bank approves
   * that mandate in the sheet `authorizeMandate` opens. Redirecting to the
   * account page on the POST alone - which is what this used to do - showed her
   * a live-looking plan for which no payment method had been agreed.
   */
  async function startSubscription() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variantId: pack.variantId, qty: 1, cadenceCode }),
      });
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/subscription#build")}`);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "We could not start your subscription. Please try again.");
        return;
      }

      const { authorization } = (await res.json()) as { authorization: MandateAuthorization };
      const outcome = await authorizeMandate(authorization, {
        description: `Lumi9 ${size.size} · ${cadence.label}`,
      });

      if (outcome.ok) {
        router.push("/account?tab=subscription");
        router.refresh();
        return;
      }
      // Dismissing the bank screen is a change of mind, not an error. The plan
      // is saved and unauthorised, and the account page offers to finish it -
      // so say that instead of a failure she did not cause.
      setError(
        outcome.dismissed
          ? "Saved. Finish setting up auto-pay from your account whenever you are ready."
          : outcome.message,
      );
    } catch {
      setError("Network error - please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="build" className="px-safe pt-5 pb-section">
      <div className="mx-auto grid max-w-[1080px] grid-cols-1 items-start gap-stack rounded-panel border border-moss-tint bg-canvas p-card-lg lg:grid-cols-[1fr_minmax(280px,340px)]">
        <div>
          <h2 className="m-0 mb-7.5 font-display text-[clamp(24px,3vw,32px)] font-normal">Build your box</h2>

          <div className="mb-3 text-sm font-semibold">Size</div>
          <div className="mb-7 grid grid-cols-5 gap-[clamp(6px,0.9vw,10px)]" role="group" aria-label="Size">
            {sizes.map((option) => (
              <button
                key={option.size}
                type="button"
                aria-pressed={option.size === sizeCode}
                onClick={() => {
                  setSizeCode(option.size);
                  setPackCount(null);
                }}
                className={`min-h-11 min-w-0 cursor-pointer rounded-chip border-[1.5px] p-2 text-[clamp(13px,1.4vw,15px)] font-bold transition-colors ${
                  option.size === sizeCode
                    ? "border-midnight bg-midnight text-butter"
                    : "border-moss-tint text-midnight hover:border-moss-soft"
                }`}
              >
                {option.size}
              </button>
            ))}
          </div>

          <div className="mb-3 text-sm font-semibold">Pack per delivery</div>
          <div className="mb-7 flex flex-wrap gap-2.5" role="group" aria-label="Pack per delivery">
            {packs.map((option) => (
              <button
                key={option.count}
                type="button"
                aria-pressed={option.count === pack.count}
                onClick={() => setPackCount(option.count)}
                className="chip"
              >
                {option.count} pcs
              </button>
            ))}
          </div>

          <div className="mb-3 text-sm font-semibold">Delivery frequency</div>
          <div className="flex flex-wrap gap-2.5" role="group" aria-label="Delivery frequency">
            {CADENCES.map((option) => (
              <button
                key={option.code}
                type="button"
                aria-pressed={option.code === cadenceCode}
                onClick={() => setCadenceCode(option.code)}
                className="chip"
                title={option.sub}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full rounded-card bg-midnight p-card text-butter lg:sticky lg:top-24">
          <div className="mb-4 text-xs font-bold tracking-[0.14em] text-gold">YOUR BOX</div>
          <div className="mb-1.5 font-display text-[clamp(20px,2.2vw,24px)]">Cloud Soft - {size.name}</div>
          <div className="mb-6 text-sm opacity-80">
            {pack.count} pants · {cadence.label.toLowerCase()}
          </div>
          <div className="mb-1.5 flex flex-wrap items-baseline gap-2.5">
            <span className="font-display text-[clamp(30px,3.6vw,40px)]">
              {inr(subscriptionPrice(pack.price, subscribeSavePct))}
            </span>
            <span className="text-[15px] line-through opacity-70">{inr(pack.price)}</span>
          </div>
          {/* The console's percentage, which is what a renewal order is actually
              discounted by. This said a flat "20%" from a hardcoded constant
              while generateDueOrders() applied Settings.subscribeSavePct. */}
          <div className="mb-6 text-[13px] text-gold">
            You save {subscribeSavePct}% every delivery
          </div>
          {error && (
            <p className="m-0 mb-3 text-[13px] text-gold" role="alert" aria-live="polite">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={startSubscription}
            disabled={submitting}
            className="btn btn-cream mb-3.5 w-full disabled:opacity-60"
          >
            {submitting ? "Setting up auto-pay…" : "Start subscription"}
          </button>
          <div className="text-center text-xs leading-[1.5] opacity-70">
            Skip, pause or cancel anytime from{" "}
            <Link href="/account?tab=subscription" className="underline">
              your account
            </Link>
            . Free delivery.
          </div>
        </div>
      </div>
    </section>
  );
}
