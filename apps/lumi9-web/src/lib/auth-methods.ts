import "server-only";
import { googleConfigured } from "@femi9/core/google-oauth";
import { mailConfigured } from "@femi9/core/mail-identity";
import { smsConfigured } from "@femi9/core/otp";
import { mockProvidersAllowed } from "@femi9/core/runtime-mode";

/**
 * Which ways of signing in this deployment can actually honour.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The login card offered three methods unconditionally. That is only honest
 * when all three providers are set up, and right now none of them is: Google
 * has credentials but `GOOGLE_REDIRECT_URI` still names Femi9's host, so the
 * consent screen answers `redirect_uri_mismatch`; MSG91 has no key; and
 * `RESEND_API_KEY` is deliberately blank. In production every one of those is a
 * button that takes a shopper somewhere broken — which is worse than a button
 * that is not there, because she cannot tell whether the fault is hers.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A method is available when its provider is configured, OR when non-production
 * mocks are on (which is what makes the whole flow exercisable locally without
 * an SMS bill). An explicit `AUTH_*_ENABLED=false` overrides both.
 *
 * The kill switch is what the probe cannot replace. Google is the case in
 * point: `googleConfigured()` is TRUE today — the client id and secret are
 * present — and the flow is still broken, because the thing that is wrong is a
 * redirect URI no probe can validate without asking Google. Detection answers
 * "is it set up?"; the switch answers "do we want it on?", and those are
 * different questions.
 *
 * ── Fail CLOSED, but never to zero ──────────────────────────────────────────
 * `atLeastOne` is the guard that matters. Turning off the last method leaves a
 * storefront nobody can sign into — and since checkout is gated, nobody can buy
 * from either. That is a full outage produced by a config change, and it would
 * look like a working site. When everything resolves to off, the emailed link
 * is forced back on and `disabledEverything` says so, so `/api/health` can warn
 * rather than the launch simply being empty.
 */

export interface AuthMethods {
  google: boolean;
  phone: boolean;
  email: boolean;
}

/**
 * `AUTH_GOOGLE_ENABLED` / `AUTH_PHONE_ENABLED` / `AUTH_EMAIL_ENABLED`.
 *
 * Unset means "follow the provider probe" — the useful default, so a deployment
 * that configures MSG91 gets phone sign-in without also having to remember a
 * second variable. Only the exact string `false` disables; anything else is
 * ignored rather than guessed at, because a typo'd flag must not silently take
 * a sign-in method off a live storefront.
 */
function switchedOff(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "false";
}

export function availableAuthMethods(): AuthMethods {
  const mock = mockProvidersAllowed();

  const google = !switchedOff("AUTH_GOOGLE_ENABLED") && (googleConfigured() || mock);
  const phone = !switchedOff("AUTH_PHONE_ENABLED") && (smsConfigured() || mock);
  const email = !switchedOff("AUTH_EMAIL_ENABLED") && (mailConfigured("lumi9") || mock);

  // Never hand back a card with nothing on it. See "fail CLOSED" above.
  if (!google && !phone && !email) return { google: false, phone: false, email: true };
  return { google, phone, email };
}

/** True when config would have left no way in at all and `email` above is a
 *  fallback rather than a real capability. `/api/health` reports it. */
export function noAuthMethodConfigured(): boolean {
  const mock = mockProvidersAllowed();
  const google = !switchedOff("AUTH_GOOGLE_ENABLED") && (googleConfigured() || mock);
  const phone = !switchedOff("AUTH_PHONE_ENABLED") && (smsConfigured() || mock);
  const email = !switchedOff("AUTH_EMAIL_ENABLED") && (mailConfigured("lumi9") || mock);
  return !google && !phone && !email;
}

/**
 * Guard for the route handlers behind each method.
 *
 * Hiding a button is presentation, not enforcement: `/api/auth/google` would
 * still redirect to a consent screen, and `/api/auth/otp/request` would still
 * spend an SMS, for anyone who kept the URL or read the bundle. Every one of
 * those routes asks this first.
 */
export function authMethodEnabled(method: keyof AuthMethods): boolean {
  return availableAuthMethods()[method];
}
