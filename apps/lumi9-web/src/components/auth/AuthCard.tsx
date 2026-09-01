"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { AuthMethods } from "@/lib/auth-methods";
import { safeNextPath } from "@/lib/safe-next";

/**
 * Sign in / create account.
 *
 * ── What this replaced ──────────────────────────────────────────────────────
 * One email field, plus a Google button and an Apple button that were
 * `<button type="button">` with no `onClick` and nothing behind them. Pressing
 * either did nothing at all - no navigation, no error, no spinner - which is a
 * worse outcome than not offering them, because the shopper cannot tell
 * whether the site is broken or she is.
 *
 * ── What it is now ──────────────────────────────────────────────────────────
 * The three methods lumi9.in actually asks for, in the order it asks for them:
 *
 *   • Google        - a top-level navigation to /api/auth/google
 *   • Mobile OTP    - +91, 10 digits → "Send code" → 6 digits → "Verify"
 *   • Email link    - address → "Email me a link"
 *
 * Mobile is the DEFAULT because this storefront ships parcels: a number is the
 * one contact detail the order needs anyway, and capturing it at sign-in is
 * what stops checkout asking for it again. Email is kept as a real second path
 * for shoppers who would rather not hand over a number, not as a placeholder.
 *
 * ── Where she lands ─────────────────────────────────────────────────────────
 * NOT unconditionally /account:
 *   • the guard sends her here with ?next=<the path she asked for>
 *   • a verify response carrying `needsProfile` routes her through /welcome,
 *     which forwards to the same `next` once her profile is complete
 *
 * ── Apple ───────────────────────────────────────────────────────────────────
 * Deliberately gone rather than left inert. Sign in with Apple needs an Apple
 * Developer team, a Services ID, a key and a server-side client-secret JWT that
 * expires every six months - none of which exists on this platform. It is a
 * project, not a button, and a dead control that looks live costs more trust
 * than an absent one.
 */

const MODES = [
  { key: "login", label: "Sign in" },
  { key: "signup", label: "Create account" },
] as const;

type Mode = (typeof MODES)[number]["key"];
type Method = "phone" | "email";
type PhoneStep = "enter" | "code";

/** Where an unqualified sign-in lands. */
const DEFAULT_NEXT = "/account";
/** Gate on the resend control, comfortably inside the server's 5-per-minute cap. */
const RESEND_COOLDOWN_S = 30;

/** The reasons a redirect can bounce back here, in shopper-readable form. */
const REDIRECT_ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or has already been used. Ask for a new one.",
  google: "We could not complete that Google sign-in. Try again, or use your mobile number.",
  "google-config": "Google sign-in is not available right now. Use your mobile number or email.",
};

/**
 * The shared open-redirect guard, plus the two loop guards only the sign-in
 * chain needs: forwarding to /login or /welcome from inside them cycles forever.
 */
function resolveNext(raw: string | null): string | null {
  const safe = safeNextPath(raw, "");
  if (!safe) return null;
  if (safe === "/login" || safe.startsWith("/login/") || safe.startsWith("/login?")) return null;
  if (safe === "/welcome" || safe.startsWith("/welcome/") || safe.startsWith("/welcome?")) return null;
  return safe;
}

/** Google's mark. Not in the Icon set: that set is monochrome by design and
 *  inherits `currentColor`, and Google's brand guidance requires these four. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.05-1.2-.16-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.5-1.8.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}

/** Turn a fetch response into something the UI can branch on, whatever it is. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function AuthCard({ methods }: { methods: AuthMethods }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Where the guard was sending her before it bounced her here.
  const nextPath = resolveNext(searchParams.get("next"));
  const redirectError = REDIRECT_ERRORS[searchParams.get("error") ?? ""] ?? null;

  const [mode, setMode] = useState<Mode>("login");
  /*
   * Mobile is preferred when it is available, because a delivery address needs
   * a number anyway - but only when the deployment can actually send an SMS.
   * Defaulting to a method whose provider is off would open the card on a form
   * that answers 503 the moment it is submitted.
   */
  const [method, setMethod] = useState<Method>(methods.phone ? "phone" : "email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone OTP
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("enter");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Email link
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);

  const isLogin = mode === "login";

  // Tick the resend gate down. One interval for the whole component, cleared on
  // unmount - a stray timer here would keep the button disabled after a route
  // change and there is no other way to re-enable it.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Focus the code field the moment the step changes, so a shopper reading the
  // SMS can type straight into it rather than hunting for the box.
  useEffect(() => {
    if (phoneStep === "code") codeRef.current?.focus();
  }, [phoneStep]);

  /** Send her onward after a successful verify. */
  const land = useCallback(
    (needsProfile: boolean) => {
      const destination = nextPath ?? DEFAULT_NEXT;
      if (needsProfile) {
        router.replace(
          `/welcome${destination !== DEFAULT_NEXT ? `?next=${encodeURIComponent(destination)}` : ""}`,
        );
      } else {
        router.replace(destination);
      }
      // Every signed-in surface is server-rendered from the cookie, so without
      // this the next paint still shows the signed-out chrome.
      router.refresh();
    },
    [nextPath, router],
  );

  async function requestOtp(resend = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(str(body.error) ?? "Could not send the code. Try again.");
        return;
      }
      setDevCode(str(body.devCode));
      setPhoneStep("code");
      setCooldown(RESEND_COOLDOWN_S);
      if (resend) setCode("");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(str(body.error) ?? "That code is not right. Try again.");
        return;
      }
      land(body.needsProfile === true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function requestLink() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next: nextPath ?? DEFAULT_NEXT }),
      });
      const body = await readJson(res);
      if (!res.ok) {
        setError(str(body.error) ?? "Could not send the link. Try again.");
        return;
      }
      setSentTo(email);
      setDevLink(str(body.devLink));
      setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const googleHref = nextPath
    ? `/api/auth/google?next=${encodeURIComponent(nextPath)}`
    : "/api/auth/google";

  // Only ten digits reach the field. A `type="tel"` accepts anything, and the
  // server's "enter a valid 10-digit number" arriving after a round trip is a
  // slower way of saying what the field can simply not allow.
  const onPhoneInput = (raw: string) => setPhone(raw.replace(/\D/g, "").slice(-10));

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-panel shadow-deep md:min-h-[600px] md:grid-cols-2">
      {/* BRAND PANEL */}
      <div className="blob-pattern flex flex-col justify-between gap-[clamp(20px,3vw,40px)] bg-moss-deep p-card-lg">
        <Image
          src="/assets/logo-cream.webp"
          alt="Lumi9"
          width={88}
          height={40}
          className="h-10 w-auto self-start"
        />
        <div>
          <h2 className="m-0 mb-4 font-display text-[clamp(24px,3.4vw,34px)] font-normal leading-[1.1] text-butter">
            Happy day, every day.
          </h2>
          <p className="m-0 text-[clamp(14px,1.4vw,16px)] leading-[1.6] text-butter/85">
            Track orders, manage your subscription, and reorder in a tap.
          </p>
        </div>
        <div className="flex items-center gap-2.5 text-[13px] text-butter/70">
          <Icon name="lock" size={15} strokeWidth={1.6} /> Your data stays private &amp; secure
        </div>
      </div>

      {/* FORM PANEL */}
      <div className="flex flex-col justify-center bg-canvas p-card-lg">
        <div className="mb-7 flex rounded-pill bg-paper p-1.25" role="tablist" aria-label="Account access">
          {MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={mode === option.key}
              onClick={() => {
                setMode(option.key);
                setError(null);
              }}
              className={`min-h-11 flex-1 cursor-pointer rounded-pill px-2 py-3 text-[clamp(13px,1.3vw,15px)] font-bold transition-colors ${
                mode === option.key ? "bg-canvas text-midnight" : "text-muted hover:text-midnight"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <h1 className="m-0 mb-1.5 font-display text-[clamp(24px,3vw,30px)] font-normal tracking-[-0.01em]">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>
        <p className="m-0 mb-6 text-[clamp(14px,1.3vw,15px)] text-muted">
          {isLogin
            ? "Sign in to manage orders and your subscription."
            : "Join 40,000+ families and never run out of the right size."}
        </p>

        {/* A redirect that failed says so HERE rather than dropping her on a
            blank sign-in form with no idea why she is looking at it again. */}
        {redirectError && (
          <p
            className="mb-5 flex items-start gap-2 rounded-chip bg-[#fdeceb] px-3.5 py-3 text-[13px] leading-[1.5] text-[#8a2a20]"
            role="alert"
          >
            <Icon name="alert" size={15} strokeWidth={1.9} />
            {redirectError}
          </p>
        )}

        {/* GOOGLE - a real navigation, not a fetch: the OAuth handshake is a
            top-level redirect and cannot be done from inside the page.
            Rendered only where the provider is set up AND switched on. */}
        {methods.google && (
          <>
            <a
              href={googleHref}
              className="mb-5 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-chip border-[1.5px] border-moss-tint bg-canvas px-3 text-[clamp(14px,1.3vw,15px)] font-semibold text-midnight transition-colors hover:border-moss-soft"
            >
              <GoogleMark />
              Continue with Google
            </a>

            {/* The divider only reads as a divider when there is something on
                both sides of it. With Google off it would sit at the very top
                of the card announcing an alternative to nothing. */}
            <div className="mb-5 flex items-center gap-3.5 text-[12px] tracking-[0.06em] text-muted uppercase">
              <span className="h-px flex-1 bg-moss-tint" />
              or continue with
              <span className="h-px flex-1 bg-moss-tint" />
            </div>
          </>
        )}

        {/* METHOD - a choice, and therefore only shown when there IS one. A
            single-option toggle is a control that cannot do anything. */}
        {methods.phone && methods.email && (
          <div className="mb-5 flex gap-2" role="group" aria-label="Sign-in method">
            {(
              [
                { key: "phone", label: "Mobile", icon: "phone" },
                { key: "email", label: "Email", icon: "mail" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={method === option.key}
                onClick={() => {
                  setMethod(option.key);
                  setError(null);
                }}
                className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-chip border-[1.5px] text-[14px] font-semibold transition-colors ${
                  method === option.key
                    ? "border-midnight bg-midnight text-butter"
                    : "border-moss-tint text-midnight hover:border-moss-soft"
                }`}
              >
                <Icon name={option.icon} size={16} strokeWidth={1.7} />
                {option.label}
              </button>
            ))}
          </div>
        )}

        {methods.phone && method === "phone" ? (
          phoneStep === "enter" ? (
            <form
              className="flex flex-col gap-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                void requestOtp();
              }}
            >
              <div className="flex items-stretch gap-2">
                <span className="flex items-center rounded-chip bg-moss-tint px-3.5 text-[15px] font-bold text-midnight">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  aria-label="Mobile number"
                  placeholder="10-digit mobile number"
                  autoComplete="tel-national"
                  required
                  className="field flex-1"
                  value={phone}
                  onChange={(event) => onPhoneInput(event.target.value)}
                  disabled={busy}
                />
              </div>
              <p className="m-0 text-[13px] text-muted">
                We will text you a 6-digit code - no password to remember.
              </p>
              <p className="m-0 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
                {error ?? " "}
              </p>
              <button
                type="submit"
                className="btn btn-dark w-full font-bold"
                disabled={busy || phone.length !== 10}
              >
                {busy ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <form
              className="flex flex-col gap-3.5"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyOtp();
              }}
            >
              <p className="m-0 text-[14px] text-muted">
                Code sent to <b className="text-midnight">+91 {phone}</b>.{" "}
                <button
                  type="button"
                  className="cursor-pointer underline underline-offset-2"
                  onClick={() => {
                    setPhoneStep("enter");
                    setCode("");
                    setDevCode(null);
                    setError(null);
                  }}
                >
                  Change
                </button>
              </p>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit code"
                placeholder="000000"
                maxLength={6}
                required
                className="field text-center text-[22px] font-bold tracking-[8px]"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                disabled={busy}
              />
              {/* Only ever present when the SMS provider is mocked, so the flow
                  is exercisable before real delivery is configured. */}
              {devCode && (
                <p className="m-0 text-[13px] text-moss-deep">Development code: {devCode}</p>
              )}
              <p className="m-0 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
                {error ?? " "}
              </p>
              <button
                type="submit"
                className="btn btn-dark w-full font-bold"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Verifying…" : "Verify and continue"}
              </button>
              <button
                type="button"
                className="cursor-pointer text-[13px] text-muted underline underline-offset-2 disabled:no-underline disabled:opacity-60"
                disabled={busy || cooldown > 0}
                onClick={() => void requestOtp(true)}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </form>
          )
        ) : sent ? (
          /* Deliberately the same message whether or not that address has an
             account: "no account found" turns this form into a way to test
             whether somebody shops here. */
          <div className="rounded-card bg-paper p-card text-[clamp(14px,1.3vw,15px)]">
            <p className="m-0 font-bold text-midnight">Check your inbox</p>
            <p className="mt-2 mb-0 text-muted">
              If {sentTo} can sign in, a link is on its way. It expires shortly.
            </p>
            {devLink && (
              <a className="mt-3 inline-block break-all text-moss-deep underline" href={devLink}>
                Development link
              </a>
            )}
            <button
              type="button"
              className="mt-3 block cursor-pointer text-[13px] text-muted underline underline-offset-2"
              onClick={() => {
                setSent(false);
                setDevLink(null);
              }}
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              void requestLink();
            }}
          >
            <input
              type="email"
              aria-label="Email address"
              placeholder="Email address"
              required
              autoComplete="email"
              className="field"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
            {/* No password field: this platform has no customer passwords. Both
                brands sign shoppers in with an emailed link or a phone OTP, so
                there is nothing to forget and nothing to breach. */}
            <p className="m-0 text-[13px] text-muted">
              We will email you a sign-in link - no password to remember.
            </p>
            <p className="m-0 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
              {error ?? " "}
            </p>
            <button type="submit" className="btn btn-dark w-full font-bold" disabled={busy}>
              {busy ? "Sending…" : "Email me a link"}
            </button>
          </form>
        )}

        <p className="mt-6 mb-0 text-[12px] leading-[1.55] text-muted">
          By continuing you agree to our{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
