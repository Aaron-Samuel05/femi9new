"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ProfileField } from "@/lib/auth-context";

/**
 * The onboarding form.
 *
 * WHICH FIELDS RENDER IS DRIVEN ENTIRELY BY `missing`. There is no per-provider
 * branch anywhere in this file: a Google shopper sees only the mobile step, an
 * OTP shopper sees name and email, a magic-link shopper sees all three. That is
 * the whole reason `missingProfileFields` is one function in `@femi9/core` -
 * the gate on /account and the screen it gates read the same definition, so
 * they cannot disagree about what "complete" means and strand somebody in a
 * loop between them.
 *
 * Two steps, and the split is forced by the data rather than chosen for looks:
 *
 *   A. name + email are written IMMEDIATELY by /api/account/complete-profile.
 *   B. the phone is NOT written - an unverified number on `User` is worse than
 *      none, because it is what a parcel and every delivery SMS go to. Step A's
 *      response only STARTS the OTP challenge; /api/account/phone/verify is
 *      what attaches it.
 *
 * Because step A persists whatever arrived, an abandoned onboarding resumes
 * where it stopped instead of starting over.
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_S = 30;

type Step = "details" | "code";

export function WelcomeFlow({
  initialMissing,
  next,
}: {
  initialMissing: ProfileField[];
  next: string | null;
}) {
  const router = useRouter();
  const [missing, setMissing] = useState<ProfileField[]>(initialMissing);
  const [step, setStep] = useState<Step>("details");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  const needName = missing.includes("name");
  const needEmail = missing.includes("email");
  const needPhone = missing.includes("phone");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  function done() {
    router.replace(next ?? "/account");
    // Every signed-in surface is server-rendered from the cookie, so without
    // this the next paint still shows the pre-onboarding render.
    router.refresh();
  }

  async function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/account/complete-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(needName ? { name } : {}),
          ...(needEmail ? { email } : {}),
          ...(needPhone ? { phone } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        const details = body.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) setFieldErrors(details.fieldErrors);
        // A 409 names the field it collided on, so bind it inline rather than
        // dropping a generic banner over a form she cannot tell how to fix.
        const field = typeof body.field === "string" ? body.field : null;
        const message = typeof body.error === "string" ? body.error : "Check the details you entered.";
        if (field) setFieldErrors((prev) => ({ ...prev, [field]: [message] }));
        else setError(message);
        return;
      }

      if (body.phoneVerificationRequired === true) {
        setDevCode(typeof body.devCode === "string" ? body.devCode : null);
        setCooldown(RESEND_COOLDOWN_S);
        setStep("code");
        // Whatever step A saved is saved; only the phone is outstanding now.
        setMissing(Array.isArray(body.missing) ? (body.missing as ProfileField[]) : ["phone"]);
        return;
      }

      if (body.profileComplete === true) {
        done();
        return;
      }

      // Partially saved - re-render against whatever is still outstanding
      // rather than repeating fields she has already filled in.
      setMissing(Array.isArray(body.missing) ? (body.missing as ProfileField[]) : missing);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
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
        setError(typeof body.error === "string" ? body.error : "That code is not right. Try again.");
        return;
      }
      if (body.profileComplete === true) {
        done();
        return;
      }
      setMissing(Array.isArray(body.missing) ? (body.missing as ProfileField[]) : []);
      setStep("details");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || cooldown > 0) return;
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
        setError(typeof body.error === "string" ? body.error : "Could not send the code. Try again.");
        return;
      }
      setDevCode(typeof body.devCode === "string" ? body.devCode : null);
      setCode("");
      setCooldown(RESEND_COOLDOWN_S);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (key: string) => fieldErrors[key]?.[0] ?? null;

  return (
    <section className="px-safe mx-auto max-w-[560px] py-[clamp(36px,6vw,80px)]">
      <div className="rounded-panel bg-canvas p-card-lg shadow-deep">
        <div className="eyebrow mb-3">One last thing</div>
        <h1 className="m-0 mb-2.5 font-display text-[clamp(26px,5vw,36px)] font-normal leading-[1.08]">
          {step === "code" ? "Verify your mobile" : "Welcome to Lumi9"}
        </h1>
        <p className="m-0 mb-7 text-[clamp(14px,1.35vw,16px)] leading-[1.6] text-muted">
          {step === "code"
            ? `We sent a ${CODE_LENGTH}-digit code to +91 ${phone}. It keeps your delivery updates going to the right handset.`
            : "We just need a couple of details so we know who to greet and where to send the box."}
        </p>

        {step === "details" ? (
          <form className="flex flex-col gap-4" onSubmit={submitDetails}>
            {needName && (
              <Field label="Full name" error={fieldError("name")}>
                <input
                  className="field"
                  autoComplete="name"
                  placeholder="Your name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={busy}
                />
              </Field>
            )}

            {needEmail && (
              <Field
                label="Email"
                hint="For your order confirmations and receipts."
                error={fieldError("email")}
              >
                <input
                  type="email"
                  className="field"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                />
              </Field>
            )}

            {needPhone && (
              <Field
                label="Mobile number"
                hint="Delivery updates go here. We will text a code to confirm it."
                error={fieldError("phone")}
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
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(-10))}
                    disabled={busy}
                  />
                </div>
              </Field>
            )}

            <p className="m-0 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
              {error ?? " "}
            </p>
            <button
              type="submit"
              className="btn btn-dark w-full font-bold"
              disabled={busy || (needPhone && phone.length !== 10)}
            >
              {busy ? "Saving…" : needPhone ? "Save and send code" : "Save and continue"}
            </button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submitCode}>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={`${CODE_LENGTH}-digit code`}
              placeholder="000000"
              maxLength={CODE_LENGTH}
              required
              className="field text-center text-[22px] font-bold tracking-[8px]"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
              }
              disabled={busy}
            />
            {/* Only ever present when the SMS provider is mocked. */}
            {devCode && <p className="m-0 text-[13px] text-moss-deep">Development code: {devCode}</p>}
            <p className="m-0 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
              {error ?? " "}
            </p>
            <button
              type="submit"
              className="btn btn-dark w-full font-bold"
              disabled={busy || code.length !== CODE_LENGTH}
            >
              {busy ? "Verifying…" : "Verify and finish"}
            </button>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <button
                type="button"
                className="cursor-pointer text-muted underline underline-offset-2"
                onClick={() => {
                  setStep("details");
                  setCode("");
                  setError(null);
                }}
              >
                Change number
              </button>
              <button
                type="button"
                className="cursor-pointer text-muted underline underline-offset-2 disabled:no-underline disabled:opacity-60"
                disabled={busy || cooldown > 0}
                onClick={() => void resend()}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
              </button>
            </div>
          </form>
        )}

        <p className="mt-7 mb-0 flex items-center gap-2 text-[12px] text-muted">
          <Icon name="lock" size={14} strokeWidth={1.7} />
          We never share your details. You can edit them any time from your account.
        </p>
      </div>
    </section>
  );
}

/** Label + control + hint + inline error, so a rejected field explains itself
 *  beside the input rather than in a banner above the form. */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13px] font-bold tracking-[0.04em] text-midnight uppercase">{label}</span>
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
