import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mailConfigured,
  mailProviderFor,
  replyToFor,
  sesConfigurationSetFor,
} from "@femi9/core/mail-identity";
import { parseSesEvent } from "@femi9/core/ses-notification";

/**
 * Which account a brand's mail leaves through.
 *
 * Lumi9 sends via SES as `no-reply@lumi9.in`; Femi9 is live on Resend and stays
 * there. The two run in the same task family and share an environment, so the
 * question "which provider is this brand on" has to have an answer that does
 * not depend on which credential happens to be present — which is exactly what
 * the first test below pins.
 */

const KEYS = [
  "MAIL_PROVIDER",
  "MAIL_PROVIDER_LUMI9",
  "MAIL_PROVIDER_FEMI9",
  "RESEND_API_KEY",
  "RESEND_API_KEY_LUMI9",
  "EMAIL_FROM",
  "EMAIL_FROM_LUMI9",
  "EMAIL_REPLY_TO_LUMI9",
  "SES_CONFIGURATION_SET_LUMI9",
] as const;

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("which provider a brand sends through", () => {
  it("sends Lumi9 through SES even though Femi9's Resend key is in the same environment", () => {
    // THE ONE THAT MATTERS. The Lumi9 task carries the SHARED RESEND_API_KEY,
    // because the platform still has brands that need it. "Use whichever
    // credential we can find" would therefore have sent every Lumi9 sign-in
    // link through Femi9's Resend account, from a domain that account has never
    // verified — mail that arrives (or lands in spam) under the wrong brand,
    // with nothing failing anywhere.
    process.env.RESEND_API_KEY = "re_femi9_live_key";
    process.env.MAIL_PROVIDER_LUMI9 = "ses";
    process.env.EMAIL_FROM_LUMI9 = "Lumi9 <no-reply@lumi9.in>";

    expect(mailProviderFor("lumi9")).toBe("ses");
    expect(mailConfigured("lumi9")).toBe(true);
  });

  it("leaves Femi9 on Resend when nothing states a provider", () => {
    // Femi9 is live. Adding a second provider must not move it, and an
    // unstated provider has to keep meaning exactly what it meant before.
    process.env.RESEND_API_KEY = "re_femi9_live_key";
    process.env.EMAIL_FROM = "Femi9 <login@femi9.in>";

    expect(mailProviderFor("femi9")).toBe("resend");
    expect(mailConfigured("femi9")).toBe(true);
  });

  it("treats a TODO placeholder as unstated, not as a provider name", () => {
    // Terraform seeds per-brand values with TODO-. A placeholder that shadowed
    // a working shared value is a bug this codebase has already had once, in
    // payment-identity — it kept Lumi9's tasks out of the load balancer.
    process.env.MAIL_PROVIDER_LUMI9 = "TODO-change-me";
    process.env.RESEND_API_KEY = "re_femi9_live_key";
    process.env.EMAIL_FROM_LUMI9 = "Lumi9 <no-reply@lumi9.in>";

    expect(mailProviderFor("lumi9")).toBe("resend");
  });

  it("ignores an unrecognised provider rather than throwing", () => {
    // A typo in a task definition must not take a storefront out of the load
    // balancer: /api/health calls mailConfigured, and this file must never be
    // the reason a deploy stalls.
    process.env.MAIL_PROVIDER_LUMI9 = "sendgrid";
    process.env.EMAIL_FROM_LUMI9 = "Lumi9 <no-reply@lumi9.in>";

    expect(() => mailProviderFor("lumi9")).not.toThrow();
    expect(mailProviderFor("lumi9")).toBeUndefined();
    expect(mailConfigured("lumi9")).toBe(false);
  });

  it("needs a From address on SES, where there is no key to be missing", () => {
    process.env.MAIL_PROVIDER_LUMI9 = "ses";
    expect(mailConfigured("lumi9")).toBe(false);

    process.env.EMAIL_FROM_LUMI9 = "Lumi9 <no-reply@lumi9.in>";
    expect(mailConfigured("lumi9")).toBe(true);
  });

  it("carries a reply-to and a configuration set per brand", () => {
    process.env.EMAIL_REPLY_TO_LUMI9 = "support@lumi9.in";
    process.env.SES_CONFIGURATION_SET_LUMI9 = "femi9plat-staging-lumi9";

    expect(replyToFor("lumi9")).toBe("support@lumi9.in");
    expect(sesConfigurationSetFor("lumi9")).toBe("femi9plat-staging-lumi9");
  });
});

describe("reading an SES delivery event", () => {
  it("distinguishes a dead address from a full mailbox", () => {
    // A Transient bounce is a full mailbox or a greylist. Recording it the same
    // way as a Permanent one marks a working customer's mail as failed, and
    // (on any system that suppresses from this signal) stops writing to her.
    const permanent = parseSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        bounce: {
          bounceType: "Permanent",
          bounceSubType: "General",
          bouncedRecipients: [{ emailAddress: "Gone@Example.com" }],
        },
      }),
    );
    expect(permanent).toMatchObject({ kind: "bounce", permanent: true });
    // Normalised, because that is how the recipient was stored when it was sent.
    expect(permanent?.recipients).toEqual(["gone@example.com"]);

    const transient = parseSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "full@example.com" }] },
      }),
    );
    expect(transient).toMatchObject({ kind: "bounce", permanent: false });
  });

  it("treats a complaint as final", () => {
    const event = parseSesEvent(
      JSON.stringify({
        eventType: "Complaint",
        complaint: {
          complaintFeedbackType: "abuse",
          complainedRecipients: [{ emailAddress: "annoyed@example.com" }],
        },
      }),
    );
    expect(event).toMatchObject({ kind: "complaint", permanent: true, detail: "abuse" });
  });

  it("reads the legacy notificationType shape as well as eventType", () => {
    // Config-set destinations send `eventType`; an identity notification sends
    // `notificationType`. Both arrive in the wild, and reading only one means
    // silently ignoring half the feed.
    const event = parseSesEvent(
      JSON.stringify({
        notificationType: "Delivery",
        delivery: { recipients: ["parent@example.com"] },
      }),
    );
    expect(event).toMatchObject({ kind: "delivery" });
    expect(event?.recipients).toEqual(["parent@example.com"]);
  });

  it("returns null on a body that is not JSON, rather than throwing into the route", () => {
    expect(parseSesEvent("not json")).toBeNull();
  });
});
