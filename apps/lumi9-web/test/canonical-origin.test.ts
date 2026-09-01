import { describe, it, expect, afterEach, vi } from "vitest";
import { CANONICAL_ORIGIN } from "@/lib/seo";
import { brandConfig } from "@femi9/core/brands";

/**
 * One site, one hostname — asserted against the OTHER place that records it.
 *
 * The repo carried three names for this storefront: `thelumi9.com` in
 * `CANONICAL_ORIGIN`, `shop.lumi9.in` in the Terraform `sites` examples, and
 * `lumi9.in` in `brandConfig('lumi9').host`. Only the first was ever consulted
 * by `robots.ts` and the canonical tags, so shipping on either of the others
 * meant every page served `noindex` and robots.txt served `Disallow: /` — while
 * the site worked perfectly for every human who visited it. Nothing fails,
 * nothing logs at error level, and the first signal is an empty Search Console
 * weeks later.
 *
 * This does not test that the domain is RIGHT — no test can know that. It tests
 * that the two places in this repo which name it agree, so the next person to
 * change one is stopped here and sent to the other. The third place is
 * Terraform (`sites` + the `SITE_URL` on the lumi9 task), which is outside
 * this suite's reach; the health probe's `NOT_INDEXABLE:` warning is what
 * covers that hop at runtime.
 */
describe("canonical origin", () => {
  it("matches the host the brand config records", () => {
    expect(CANONICAL_ORIGIN).toBe(`https://${brandConfig("lumi9").host}`);
  });

  it("is a bare https origin with no trailing slash or path", () => {
    // `absoluteUrl` concatenates, so a trailing slash yields `//about` and a
    // path yields a canonical nobody can reach.
    expect(CANONICAL_ORIGIN).toMatch(/^https:\/\/[a-z0-9.-]+$/);
  });

  // ── The indexability tests read the ENVIRONMENT, so they set it ──────────
  //
  // `SITE_URL` is read at module scope, so `IS_CANONICAL_HOST` is fixed the
  // moment `seo.ts` is first imported. An earlier version of this file asserted
  // that constant directly and passed on a laptop, where the variable is unset,
  // and failed in CI, which sets `SITE_URL=http://127.0.0.1:3101` for the
  // Playwright server. That is a test asserting the harness rather than the
  // code. Each case below states the environment it means and re-imports the
  // module under it, so the answer does not depend on who is running it.
  const ENV_KEYS = ["SITE_URL", "NEXT_PUBLIC_SITE_URL"] as const;
  const saved: Record<string, string | undefined> = {};

  async function seoWith(siteUrl: string | undefined) {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      // DELETED, not set to "". `seo.ts` falls back with `??`, which only
      // triggers on null/undefined — an empty string is a value, and would
      // resolve SITE_URL to "" rather than to CANONICAL_ORIGIN.
      delete process.env[key];
    }
    if (siteUrl !== undefined) process.env.SITE_URL = siteUrl;

    vi.resetModules();
    return import("@/lib/seo");
  }

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.resetModules();
  });

  it("indexes when SITE_URL is unset, because the fallback IS the canonical", async () => {
    // The one case where a missing variable must NOT produce noindex. It is
    // also the case Terraform got wrong: it set NEXT_PUBLIC_SITE_URL, which
    // Next inlines at build time and which is therefore inert in a task
    // definition, and set SITE_URL nowhere at all.
    const seo = await seoWith(undefined);
    expect(seo.IS_CANONICAL_HOST).toBe(true);
    expect(seo.noindexReason()).toBeNull();
  });

  it("says WHY it is not indexable when the origin is anything else", async () => {
    // The launch blocker, in one assertion: ship on a hostname nobody wrote
    // into CANONICAL_ORIGIN and every page carries noindex while working
    // perfectly for every human. The reason has to name both origins, because
    // the person reading it is looking at a site that appears fine.
    const seo = await seoWith("https://shop.lumi9.in");
    expect(seo.IS_CANONICAL_HOST).toBe(false);
    expect(seo.noindexReason()).toContain("shop.lumi9.in");
    expect(seo.noindexReason()).toContain(CANONICAL_ORIGIN);
  });
});
