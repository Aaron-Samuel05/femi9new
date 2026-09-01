"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSession } from "@/lib/auth-context";

/**
 * The Lumi9 creator programme's one interactive block: apply, or - if you are
 * already an approved creator signed in on this device - see your own link and
 * what it has earned.
 *
 * Two rules shape it.
 *
 * A promo code is a marketing string people put in captions; it is NOT a
 * credential. So the metrics panel is owner-scoped and reached only through the
 * session, never by typing a code. `/api/affiliate/me` enforces that server
 * side; this component simply never offers a code box.
 *
 * And nothing here promises a code on submit. Applying writes a PENDING row -
 * an admin allocates the real, shareable code on approval - so the success
 * panel says exactly that. A form that hands back a code the programme has not
 * issued yet produces links that track nothing.
 */

interface Stats {
  status: string;
  promoCode: string;
  clicks: number;
  orders: number;
  earnings: number;
}

const FOLLOWER_BANDS = ["Under 5k", "5k - 25k", "25k - 100k", "100k+"];
const PLATFORMS = ["Instagram", "YouTube", "WhatsApp", "Facebook", "Blog", "Other"];

/** Integer rupees throughout the platform - never floats, never paise. */
function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-moss-tint bg-paper p-4 text-center">
      <div className="font-display text-[clamp(22px,3vw,30px)] leading-none text-midnight">{value}</div>
      <div className="mt-1.5 text-xs text-muted">{label}</div>
    </div>
  );
}

/** The signed-in creator's own link and numbers. */
function CreatorDashboard({ stats }: { stats: Stats }) {
  const [copied, setCopied] = useState(false);
  // Built in the browser so it is correct on whatever host this is actually
  // being served from - a preview deploy included.
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/a/${stats.promoCode}`;

  return (
    <div className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero">
      <div className="eyebrow mb-3">Your creator link</div>
      <h2 className="m-0 mb-4 font-display text-[clamp(21px,2.6vw,26px)] font-normal">
        {stats.promoCode}
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-pill border border-moss-tint bg-paper px-4 py-2.5 text-sm text-midnight">
          {link}
        </code>
        <button
          type="button"
          className="chip shrink-0 cursor-pointer border-transparent bg-moss-tint font-bold text-midnight hover:bg-moss-soft"
          onClick={() => {
            navigator.clipboard
              ?.writeText(link)
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              })
              .catch(() => {});
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat value={stats.clicks.toLocaleString("en-IN")} label="clicks" />
        <Stat value={stats.orders.toLocaleString("en-IN")} label="orders" />
        <Stat value={inr(stats.earnings)} label="earned" />
      </div>

      <p className="m-0 mt-5 text-xs leading-[1.6] text-muted">
        Clicks are counted when somebody opens your link. An order counts once it is
        placed by a shopper who arrived on it within the last 30 days.
      </p>
    </div>
  );
}

export function AffiliatePanel() {
  const { user, ready } = useSession();
  // Tagged with the shopper it was fetched for, so signing out - or switching
  // accounts - resolves in render rather than needing the effect to clear it.
  const [fetched, setFetched] = useState<{ userId: string; stats: Stats | null } | null>(null);

  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id ?? null;

  // Only a signed-in shopper can have a creator account, and a 404 here is the
  // ordinary answer for "not an approved creator" rather than a failure.
  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetch("/api/affiliate/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Stats | null) => {
        if (live) setFetched({ userId, stats: data });
      })
      .catch(() => {
        if (live) setFetched({ userId, stats: null });
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const mine = fetched && fetched.userId === userId ? fetched : null;
  const stats = mine?.stats ?? null;
  // A signed-out visitor has nothing to look up, so she is resolved as soon as
  // the session is. A signed-in one is resolved once HER lookup has landed.
  const checked = ready && (!userId || mine !== null);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      const data = new FormData(event.currentTarget);
      const get = (key: string) => String(data.get(key) ?? "").trim();

      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/affiliate/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: get("name"),
            handle: get("handle"),
            platform: get("platform"),
            followerBand: get("followerBand"),
            email: get("email"),
          }),
        });
        if (res.ok) {
          setSent(true);
          return;
        }
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "We could not send your application. Please try again.");
      } catch {
        setError("Network error - please try again, or email care@lumi9.in.");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting],
  );

  // Hold still until the session AND the metrics lookup have resolved: painting
  // the application form at an approved creator, then swapping it for her
  // dashboard, reads as the programme forgetting who she is.
  if (!checked) {
    return (
      <div
        className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero"
        aria-busy="true"
      >
        <p className="m-0 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (stats) return <CreatorDashboard stats={stats} />;

  if (sent) {
    return (
      <div
        className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero"
        data-testid="affiliate-applied"
      >
        <div className="px-2.5 py-10 text-center">
          <div className="mx-auto mb-5 flex size-[clamp(52px,6vw,64px)] items-center justify-center rounded-full bg-moss-tint text-moss-deep">
            <Icon name="check" size={28} />
          </div>
          <h2 className="m-0 mb-2.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal">
            Application received
          </h2>
          <p className="m-0 text-base leading-[1.6] text-muted">
            We review every application by hand. When yours is approved we&apos;ll email
            your creator code and your link - there is nothing to share until then.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      data-testid="affiliate-form"
      className="rounded-media border border-moss-tint bg-canvas p-card-lg shadow-hero"
    >
      <div className="flex flex-col gap-4">
        <input
          name="name"
          aria-label="Your name"
          placeholder="Your name"
          required
          autoComplete="name"
          className="field"
        />
        <input
          name="handle"
          aria-label="Your social handle"
          placeholder="Your handle, e.g. @lumi9mom"
          required
          className="field"
        />
        <div className="grid grid-cols-1 gap-[clamp(10px,1.4vw,14px)] min-[420px]:grid-cols-2">
          <select name="platform" aria-label="Main platform" defaultValue="" className="field text-muted">
            <option value="">Main platform</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            name="followerBand"
            aria-label="Audience size"
            defaultValue=""
            className="field text-muted"
          >
            <option value="">Audience size</option>
            {FOLLOWER_BANDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
        <input
          name="email"
          type="email"
          aria-label="Email address"
          placeholder="Email address"
          required
          autoComplete="email"
          className="field"
        />
        {error && (
          <p className="m-0 text-sm text-[#b4232c]" role="alert" aria-live="polite">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="btn btn-dark w-full font-bold disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Apply to the programme"}
        </button>
        <p className="m-0 text-xs leading-[1.6] text-muted">
          Applying does not issue a code. We review each one by hand and email your
          creator link once it is approved.
        </p>
      </div>
    </form>
  );
}
