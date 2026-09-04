import { describe, it, expect, afterEach } from "vitest";
import {
  orderPageUrl,
  renderAddressChangeEmail,
} from "@femi9/core/services/order-address-notify";

/**
 * The message that tells a customer her address correction is open.
 *
 * The sending itself needs a database, a mail provider and an approved WhatsApp
 * template, so it is not what these cover. What they cover is the part that is
 * wrong SILENTLY: a link that does not resolve, and copy that leaves out one of
 * the three things she has to know. Both of those send successfully, arrive,
 * and fail only in her hands — where nothing reports them.
 */

const ENV_KEYS = ["STOREFRONT_URL_LUMI9", "STOREFRONT_URL_FEMI9", "STOREFRONT_URL"];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("orderPageUrl", () => {
  it("uses the brand's own host, not the running process's site URL", () => {
    // The console serves both brands from one container. A link built from
    // NEXT_PUBLIC_SITE_URL there would send every Lumi9 customer to whichever
    // origin that container happened to be configured with.
    expect(orderPageUrl("lumi9", "LM-00014")).toBe("https://lumi9.in/order/LM-00014");
    expect(orderPageUrl("femi9", "FM-00014")).toBe("https://femi9.in/order/FM-00014");
  });

  it("takes a per-brand override for staging", () => {
    process.env.STOREFRONT_URL_LUMI9 = "https://staging.lumi9.in";
    expect(orderPageUrl("lumi9", "LM-00014")).toBe("https://staging.lumi9.in/order/LM-00014");
  });

  it("does not let one brand's override leak into the other's link", () => {
    // The reason the override is not read through `perBrandEnv`: that falls
    // back to a shared STOREFRONT_URL, and one origin for both brands is the
    // exact failure this is built to prevent.
    process.env.STOREFRONT_URL_LUMI9 = "https://staging.lumi9.in";
    process.env.STOREFRONT_URL = "https://staging.lumi9.in";
    expect(orderPageUrl("femi9", "FM-00014")).toBe("https://femi9.in/order/FM-00014");
  });

  it("trims a trailing slash rather than doubling it", () => {
    process.env.STOREFRONT_URL_LUMI9 = "https://staging.lumi9.in/";
    expect(orderPageUrl("lumi9", "LM-00014")).toBe("https://staging.lumi9.in/order/LM-00014");
  });

  it("ignores Terraform's TODO placeholder", () => {
    // Every per-brand value is seeded with one. A placeholder is a non-empty
    // string, so without `usableEnv` it would win and produce a link to
    // https://TODO-change-me/order/LM-00014.
    process.env.STOREFRONT_URL_LUMI9 = "TODO-change-me";
    expect(orderPageUrl("lumi9", "LM-00014")).toBe("https://lumi9.in/order/LM-00014");
  });
});

describe("renderAddressChangeEmail", () => {
  const input = {
    brand: "lumi9" as const,
    greeting: "Priya",
    orderNo: "LM-00014",
    url: "https://lumi9.in/order/LM-00014",
  };

  it("names the brand the customer actually bought from", () => {
    // order-mail.ts sent "Your Femi9 order LM-00001 is confirmed" to every
    // Lumi9 customer for months. One template, two brands — the copy has to
    // take the brand, not assume it.
    const mail = renderAddressChangeEmail(input);
    expect(mail.subject).toContain("Lumi9");
    expect(mail.subject).toContain("LM-00014");
    expect(mail.subject).not.toContain("Femi9");
    expect(mail.text).toContain("Lumi9 · cloud soft baby care");
  });

  it("carries the link in both the text and the HTML part", () => {
    const mail = renderAddressChangeEmail(input);
    expect(mail.text).toContain(input.url);
    expect(mail.html).toContain(`href="${input.url}"`);
  });

  it("tells her to sign in", () => {
    // The edit control renders for a SESSION only — the ?t= capability token
    // that opens the order page does not authorise the write. A customer who
    // follows the link signed out sees her order, no control, and concludes
    // the link is broken.
    const mail = renderAddressChangeEmail(input);
    expect(mail.text).toMatch(/sign in/i);
  });

  it("names the control in the words the button uses", () => {
    const mail = renderAddressChangeEmail(input);
    expect(mail.text).toContain("Change delivery address");
    expect(mail.html).toContain("Change delivery address");
  });

  it("states both halves of the rule: once, and only before dispatch", () => {
    // She gets one save per grant and the window shuts at dispatch. A customer
    // who does not know that saves a half-finished address, and there is no
    // coming back from it.
    const mail = renderAddressChangeEmail(input);
    expect(mail.text).toMatch(/once/i);
    expect(mail.text).toMatch(/dispatch/i);
  });

  it("says there is nothing more to pay", () => {
    // This lands after money has already been taken, and "we need your address"
    // out of nowhere reads like a payment problem or a phishing attempt.
    const mail = renderAddressChangeEmail(input);
    expect(mail.text).toMatch(/nothing more to pay/i);
  });

  it("escapes a name that contains markup", () => {
    const mail = renderAddressChangeEmail({ ...input, greeting: '<script>x</script>' });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
