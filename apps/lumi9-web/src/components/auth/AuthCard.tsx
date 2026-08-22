"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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

        <form
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            router.push("/account");
          }}
        >
          {!isLogin && (
            <input aria-label="Full name" placeholder="Full name" required autoComplete="name" className="field" />
          )}
          <input
            type="email"
            aria-label="Email address"
            placeholder="Email address"
            required
            autoComplete="email"
            className="field"
          />
          <input
            type="password"
            aria-label="Password"
            placeholder="Password"
            required
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="field"
          />
          {isLogin && (
            <Link href="/contact" className="inline-flex items-center coarse:min-h-10 self-end text-[13px] text-moss-deep hover:text-midnight">
              Forgot password?
            </Link>
          )}
          <button type="submit" className="btn btn-dark mt-1 w-full font-bold">
            {isLogin ? "Sign in" : "Create account"}
          </button>
        </form>

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
