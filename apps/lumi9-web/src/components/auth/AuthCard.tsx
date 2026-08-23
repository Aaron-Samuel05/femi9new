"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

const MODES = [
  { key: "login", label: "Sign in" },
  { key: "signup", label: "Create account" },
] as const;

type Mode = (typeof MODES)[number]["key"];

/** Two-panel auth card: brand panel + segmented sign-in / create-account form. */
export function AuthCard() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, next: nextPath }),
      });
      const body = (await res.json().catch(() => null)) as
        | { devLink?: string; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not send the link. Try again.");
        return;
      }
      setSentTo(email);
      setDevLink(body?.devLink ?? null);
      setSent(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const searchParams = useSearchParams();
  // Where the guard was sending her before it bounced her here.
  const nextPath = searchParams.get("next") ?? "/account";
  const isLogin = mode === "login";

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-panel shadow-deep md:min-h-[560px] md:grid-cols-2">
      {/* BRAND PANEL */}
      <div className="blob-pattern flex flex-col justify-between gap-[clamp(20px,3vw,40px)] bg-moss-deep p-card-lg">
        <Image src="/assets/logo-cream.png" alt="Lumi9" width={88} height={40} className="h-10 w-auto self-start" />
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
        <div className="mb-8 flex rounded-pill bg-paper p-1.25" role="tablist" aria-label="Account access">
          {MODES.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={mode === option.key}
              onClick={() => setMode(option.key)}
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
        <p className="m-0 mb-6.5 text-[clamp(14px,1.3vw,15px)] text-muted">
          {isLogin
            ? "Sign in to manage orders and your subscription."
            : "Join 40,000+ families and save 20% with a subscription."}
        </p>

        {sent ? (
          /* Deliberately the same message whether or not that address has an
             account: "no account found" turns this form into a way to test
             whether someone shops here. */
          <div className="rounded-card bg-paper p-card text-[clamp(14px,1.3vw,15px)]">
            <p className="m-0 font-bold text-midnight">Check your inbox</p>
            <p className="mt-2 mb-0 text-muted">
              If {sentTo} can sign in, a link is on its way. It expires shortly.
            </p>
            {devLink && (
              /* Only ever present when the mail provider is mocked, so the flow
                 is testable before real delivery is configured. */
              <a className="mt-3 inline-block break-all text-moss-deep underline" href={devLink}>
                Development link
              </a>
            )}
          </div>
        ) : (
          <form className="flex flex-col gap-3.5" onSubmit={submit}>
            <input
              type="email"
              aria-label="Email address"
              placeholder="Email address"
              required
              autoComplete="email"
              className="field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
            {/* No password field: this platform has no customer passwords. Both
                brands sign shoppers in with a emailed link or a phone OTP, so
                there is nothing to forget and nothing to breach. */}
            <p className="m-0 text-[13px] text-muted">
              We will email you a sign-in link — no password to remember.
            </p>
            <p className="m-0 min-h-5 text-[13px] text-[#b4232c]" role="alert" aria-live="polite">
              {error ?? " "}
            </p>
            <button type="submit" className="btn btn-dark mt-1 w-full font-bold" disabled={busy}>
              {busy ? "Sending…" : isLogin ? "Email me a link" : "Create account"}
            </button>
          </form>
        )}

        <div className="my-6 flex items-center gap-3.5 text-[13px] text-muted">
          <span className="h-px flex-1 bg-moss-tint" />
          or
          <span className="h-px flex-1 bg-moss-tint" />
        </div>
        <div className="flex gap-3">
          {["Google", "Apple"].map((provider) => (
            <button
              key={provider}
              type="button"
              className="min-h-11 flex-1 cursor-pointer rounded-chip border-[1.5px] border-moss-tint bg-canvas px-3 py-3 text-sm font-semibold text-midnight transition-colors hover:border-moss-soft"
            >
              {provider}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
