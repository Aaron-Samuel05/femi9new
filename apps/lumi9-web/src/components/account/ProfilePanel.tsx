"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useSession } from "@/lib/auth-context";
import type { AccountUser } from "@femi9/core/services/account";

/**
 * Name, email and mobile - the surface the account page did not have.
 *
 * Without it, a shopper who signed in with a link had no way to add a phone
 * number and one who signed in with an OTP had no way to add an email, so
 * checkout asked for the missing half on every order and kept none of it. Both
 * halves are what the delivery SMS and the receipt go to.
 *
 * ── The phone is not an ordinary field ──────────────────────────────────────
 * Name and email are a straight PATCH. A CHANGE OF NUMBER is not: an unverified
 * number on `User` is worse than none, because it is where a parcel and every
 * delivery update are sent. So the server refuses the write and answers 400
 * with `code: "phone_requires_verification"`, and this panel switches to the
 * OTP challenge instead of showing the shopper an error she cannot act on.
 *
 * That is the same two-step /welcome runs, against the same two endpoints -
 * there is one implementation of "prove you own this number" on the storefront,
 * not two that can drift.
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

export function ProfilePanel({ user }: { user: AccountUser }) {
  const router = useRouter();
  const { refresh } = useSession();

  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // The phone challenge, when a change of number triggers one.
  const [challenge, setChallenge] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  const dirty =
    name.trim() !== (user.name ?? "").trim() ||
    email.trim().toLowerCase() !== (user.email ?? "").toLowerCase() ||
    phone !== (user.phone ?? "");
  const phoneChanged = phone !== (user.phone ?? "");

  /** After any successful write: re-read the row on the server AND in the nav's
   *  session, or the greeting keeps the old name until the token expires. */
  function settle() {
    setSaved(true);
    void refresh();
    router.refresh();
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    setFieldErrors({});
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(name.trim() !== (user.name ?? "").trim() ? { name: name.trim() } : {}),
          ...(email.trim().toLowerCase() !== (user.email ?? "").toLowerCase()
            ? { email: email.trim() }
            : {}),
          ...(phoneChanged ? { phone } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        // The one refusal that is not an error: the server is telling us to
        // prove the number first. Start the challenge rather than reporting it.
        if (body.code === "phone_requires_verification") {
          await startChallenge();
          return;
        }
        const details = body.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        const field = typeof body.field === "string" ? body.field : null;
        const message = typeof body.error === "string" ? body.error : "Could not save those changes.";
        if (field) setFieldErrors((prev) => ({ ...prev, [field]: [message] }));
        else setError(message);
        return;
      }

      settle();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startChallenge() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/phone/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Could not send the code.");
        return;
      }
      setDevCode(typeof body.devCode === "string" ? body.devCode : null);
      setCooldown(RESEND_COOLDOWN_S);
      setChallenge(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmChallenge(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/phone/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "That code is not right.");
        return;
      }
      setChallenge(false);
      setCode("");
      settle();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-card">
      <h2 className="m-0 mb-1.5 font-display text-[clamp(21px,2.6vw,26px)] font-normal">
        Your details
      </h2>
      <p className="m-0 mb-6 text-[clamp(14px,1.3vw,15px)] text-muted">
        We use these for order confirmations and delivery updates. Nothing here is shared.
      </p>

      {challenge ? (
        <form method="post" className="max-w-[420px]" onSubmit={confirmChallenge}>
          <p className="m-0 mb-4 text-[15px] text-muted">
            We sent a {CODE_LENGTH}-digit code to <b className="text-midnight">+91 {phone}</b>.
            Confirm it and the number is yours.
          </p>
          <input
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`${CODE_LENGTH}-digit code`}
            placeholder="000000"
            maxLength={CODE_LENGTH}
            required
            className="field mb-3 text-center text-[22px] font-bold tracking-[8px]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
            disabled={busy}
          />
          {devCode && <p className="m-0 mb-2 text-[13px] text-moss-deep">Development code: {devCode}</p>}
          <p className="m-0 mb-3 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
            {error ?? " "}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="btn btn-dark btn-sm py-3.25 font-bold"
              disabled={busy || code.length !== CODE_LENGTH}
            >
              {busy ? "Verifying…" : "Confirm number"}
            </button>
            <button
              type="button"
              className="cursor-pointer text-[13px] text-muted underline underline-offset-2 disabled:no-underline disabled:opacity-60"
              disabled={busy || cooldown > 0}
              onClick={() => void startChallenge()}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              className="cursor-pointer text-[13px] text-muted underline underline-offset-2"
              onClick={() => {
                setChallenge(false);
                setCode("");
                setPhone(user.phone ?? "");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form method="post" className="max-w-[560px]" onSubmit={save}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" error={fieldErrors.name?.[0]} full>
              <input
                className="field"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field
              label="Email"
              error={fieldErrors.email?.[0]}
              badge={
                user.email
                  ? user.emailVerified
                    ? { tone: "ok", text: "Verified" }
                    : { tone: "warn", text: "Unverified" }
                  : null
              }
              full
            >
              <input
                type="email"
                className="field"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field
              label="Mobile number"
              error={fieldErrors.phone?.[0]}
              hint={
                phoneChanged && user.phone
                  ? "Changing this sends a code to the new number before it takes effect."
                  : "Delivery updates go here."
              }
              badge={
                user.phone
                  ? user.phoneVerified
                    ? { tone: "ok", text: "Verified" }
                    : { tone: "warn", text: "Unverified" }
                  : null
              }
              full
            >
              <div className="flex items-stretch gap-2">
                <span className="flex items-center rounded-chip bg-moss-tint px-3.5 text-[15px] font-bold text-midnight">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  className="field flex-1"
                  autoComplete="tel-national"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(-10))}
                  disabled={busy}
                />
              </div>
            </Field>
          </div>

          <p className="m-0 mt-3 min-h-5 text-[13px]" role="alert" aria-live="polite">
            {error ? (
              <span className="text-[#b4232c]">{error}</span>
            ) : saved ? (
              <span className="inline-flex items-center gap-1.5 text-moss-deep">
                <Icon name="check" size={14} strokeWidth={2.2} /> Saved
              </span>
            ) : (
              " "
            )}
          </p>

          <button
            type="submit"
            className="btn btn-dark btn-sm mt-1 py-3.25 font-bold"
            // Nothing changed means nothing to send: the API rejects an empty
            // patch with a 400, and a button that answers "nothing to update"
            // is a button that should not have been pressable.
            disabled={busy || !dirty || (phone !== "" && phone.length !== 10)}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  badge,
  full = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  badge?: { tone: "ok" | "warn"; text: string } | null;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-2 ${full ? "sm:col-span-2" : ""}`}>
      <span className="flex items-center gap-2.5">
        <span className="text-[12px] font-bold tracking-[0.04em] text-midnight uppercase">
          {label}
        </span>
        {badge && (
          <span
            className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
              badge.tone === "ok" ? "bg-[#e4f0df] text-[#2f7d32]" : "bg-moss-tint text-muted"
            }`}
          >
            {badge.text}
          </span>
        )}
      </span>
      {children}
      {hint && !error && <span className="text-[12px] text-muted">{hint}</span>}
      {error && (
        <span className="text-[12px] text-[#b4232c]" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
