import { describe, it, expect } from "vitest";
import { CANONICAL_ORIGIN, IS_CANONICAL_HOST, noindexReason } from "@/lib/seo";
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

  it("indexes when SITE_URL is unset, because the fallback IS the canonical", () => {
    // A task whose SITE_URL never got set falls back to this constant. That is
    // the one case where a missing variable must not produce noindex — see the
    // Terraform note: NEXT_PUBLIC_SITE_URL is inlined at build time and does
    // nothing at runtime, which is how the variable went missing in the first
    // place.
    expect(IS_CANONICAL_HOST).toBe(true);
    expect(noindexReason()).toBeNull();
  });
});
