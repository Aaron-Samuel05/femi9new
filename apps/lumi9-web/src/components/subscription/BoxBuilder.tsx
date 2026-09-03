"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CADENCES, inr, subscriptionPrice, type SizeCode } from "@/lib/catalog";
import { useCatalogData } from "@/lib/catalog-context";
import { authorizeMandate, type MandateAuthorization } from "@/lib/mandate";
import { Icon } from "@/components/ui/Icon";
import type { DbProductSize } from "@/lib/catalog.server";

/** Subscribable pack tiers - the 3-count trial packs aren't offered on subscription. */
function subscribablePacks(size: DbProductSize) {
  return size.packs.filter((pack) => pack.count >= 24);
}

/** The shape of the quick address form - a subset of the account address book's
 *  fields, matching what `POST /api/account/addresses` actually requires. */
interface AddressDraft {
  name: string;
  line: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
}

const BLANK_ADDRESS: AddressDraft = { name: "", line: "", city: "", state: "", pincode: "", phone: "" };

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

  // ── The address gate ─────────────────────────────────────────────────────
  // A mandate authorised with no delivery address on file is a recurring
  // charge for a box with nowhere to ship. `startSubscription` used to POST
  // straight to /api/subscriptions and only ever discover a missing address
  // the way every other field is discovered - by the order never arriving.
  const [checkingAddress, setCheckingAddress] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [addressDraft, setAddressDraft] = useState<AddressDraft>(BLANK_ADDRESS);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressFieldErrors, setAddressFieldErrors] = useState<Record<string, string[]>>({});

  const size = getSizeOrDefault(sizeCode);
  const packs = subscribablePacks(size);
  const pack = packs.find((option) => option.count === packCount) ?? packs[packs.length - 1];
  const cadence = CADENCES.find((c) => c.code === cadenceCode) ?? CADENCES[1]!;

  /**
   * Create the mandate and open the approval sheet. Assumes the caller has
   * already confirmed there is somewhere to ship the box - see
   * `handleStartClick`, which is what the button actually calls.
   *
   * TWO PHASES, and the second is what makes it recur. The POST creates the
   * Razorpay plan and mandate; nothing is ever debited until her bank approves
   * that mandate in the sheet `authorizeMandate` opens. Redirecting to the
   * account page on the POST alone - which is what this used to do - showed her
   * a live-looking plan for which no payment method had been agreed.
   */
  async function startSubscription() {
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

  /**
   * What "Start subscription" actually calls. A guest has no address to check
   * (she is not signed in yet, and `/api/account/addresses` answers 401 for
   * exactly that), so this reads the same 401 checkout already relies on and
   * sends her to sign in first; a signed-in shopper with nothing on file gets
   * the quick address form BEFORE the mandate is ever created, not after.
   */
  async function handleStartClick() {
    if (checkingAddress || submitting) return;
    setCheckingAddress(true);
    setError(null);
    try {
      const res = await fetch("/api/account/addresses");
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/subscription#build")}`);
        return;
      }
      if (!res.ok) {
        setError("We could not check your saved addresses. Please try again.");
        return;
      }
      const { addresses } = (await res.json()) as { addresses: unknown[] };
      if (addresses.length === 0) {
        setAddressError(null);
        setAddressFieldErrors({});
        setShowAddressModal(true);
        return;
      }
      await startSubscription();
    } catch {
      setError("Network error - please try again.");
    } finally {
      setCheckingAddress(false);
    }
  }

  async function saveAddressAndContinue(event: React.FormEvent) {
    event.preventDefault();
    if (savingAddress) return;
    setSavingAddress(true);
    setAddressError(null);
    setAddressFieldErrors({});
    try {
      const res = await fetch("/api/account/addresses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // First address on the account, so it becomes primary regardless -
        // `createAddress` does that itself when the count is zero.
        body: JSON.stringify({ label: "Home", isPrimary: true, ...addressDraft }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        };
        if (body.details?.fieldErrors) setAddressFieldErrors(body.details.fieldErrors);
        setAddressError(body.error ?? "Could not save that address.");
        return;
      }
      setShowAddressModal(false);
      setAddressDraft(BLANK_ADDRESS);
      await startSubscription();
    } catch {
      setAddressError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSavingAddress(false);
    }
  }

  const setField = <K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) =>
    setAddressDraft((prev) => ({ ...prev, [key]: value }));

  const busy = checkingAddress || submitting;

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
            onClick={handleStartClick}
            disabled={busy}
            className="btn btn-cream mb-3.5 w-full disabled:opacity-60"
          >
            {checkingAddress ? "Checking your address…" : submitting ? "Setting up auto-pay…" : "Start subscription"}
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

      {showAddressModal && (
        <div
          onClick={() => !savingAddress && setShowAddressModal(false)}
          aria-hidden
          className="fixed inset-0 z-110 flex items-center justify-center bg-midnight/45 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add a delivery address"
            className="w-full max-w-[440px] rounded-card bg-canvas p-card-lg shadow-[0_0_60px_-10px_rgb(39_44_5_/_0.45)]"
          >
            <div className="mb-1.5 flex items-center gap-2.5">
              <Icon name="pin" size={20} strokeWidth={1.8} />
              <h2 className="m-0 font-display text-[clamp(19px,2.2vw,22px)] font-normal">Where should it ship?</h2>
            </div>
            <p className="m-0 mb-5.5 text-sm text-muted">
              Add a delivery address before we set up auto-pay - every box needs somewhere to go.
            </p>

            <form onSubmit={saveAddressAndContinue} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <Field label="Recipient name" error={addressFieldErrors.name?.[0]} full>
                <input
                  className="field"
                  autoComplete="name"
                  value={addressDraft.name}
                  onChange={(e) => setField("name", e.target.value)}
                  required
                  disabled={savingAddress}
                />
              </Field>
              <Field label="Flat, street and area" error={addressFieldErrors.line?.[0]} full>
                <input
                  className="field"
                  autoComplete="street-address"
                  value={addressDraft.line}
                  onChange={(e) => setField("line", e.target.value)}
                  required
                  disabled={savingAddress}
                />
              </Field>
              <Field label="City" error={addressFieldErrors.city?.[0]}>
                <input
                  className="field"
                  autoComplete="address-level2"
                  value={addressDraft.city}
                  onChange={(e) => setField("city", e.target.value)}
                  required
                  disabled={savingAddress}
                />
              </Field>
              <Field label="State" error={addressFieldErrors.state?.[0]}>
                <input
                  className="field"
                  autoComplete="address-level1"
                  value={addressDraft.state}
                  onChange={(e) => setField("state", e.target.value)}
                  required
                  disabled={savingAddress}
                />
              </Field>
              <Field label="Pincode" error={addressFieldErrors.pincode?.[0]}>
                <input
                  className="field"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  maxLength={6}
                  value={addressDraft.pincode}
                  onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  disabled={savingAddress}
                />
              </Field>
              <Field label="Mobile for delivery" error={addressFieldErrors.phone?.[0]}>
                <input
                  className="field"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={addressDraft.phone}
                  onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(-10))}
                  disabled={savingAddress}
                />
              </Field>

              <p className="m-0 min-h-5 text-[13px] text-[#b4232c] sm:col-span-2" role="alert" aria-live="polite">
                {addressError ?? " "}
              </p>

              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <button type="submit" className="btn btn-dark btn-sm py-3.25 font-bold" disabled={savingAddress}>
                  {savingAddress ? "Saving…" : "Save & continue to payment"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddressModal(false)}
                  disabled={savingAddress}
                  className="rounded-pill border-[1.5px] border-moss-tint px-6 py-3.25 text-sm font-semibold text-midnight transition-colors hover:border-moss-soft disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  error,
  full = false,
  children,
}: {
  label: string;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[12px] font-bold tracking-[0.04em] text-midnight uppercase">{label}</span>
      {children}
      {error && (
        <span className="text-[12px] text-[#b4232c]" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
