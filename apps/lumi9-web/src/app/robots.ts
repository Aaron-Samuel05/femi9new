import type { MetadataRoute } from "next";
import { absoluteUrl, IS_CANONICAL_HOST, SITE_URL } from "@/lib/seo";

/**
 * `/robots.txt`.
 *
 * Only genuinely private or transactional paths are disallowed. Blocking more
 * than that is a common own-goal: a crawler that cannot fetch a page also
 * cannot see its `noindex`, so over-blocking keeps URLs in the index with no
 * description rather than removing them.
 *
 * The staging guard is the important half. Any origin that is not the canonical
 * one — a preview deployment, the load balancer's own hostname — serves a
 * blanket disallow, because a crawlable copy of the whole storefront on a
 * second domain competes with the real one for its own keywords.
 */
/**
 * Rendered per request. Prerendered, this file would freeze whatever origin the
 * BUILD saw — and the build has no deploy configuration, so every image would
 * ship a production robots.txt and the staging guard below would never fire.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!IS_CANONICAL_HOST) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/cart", "/checkout", "/confirmation", "/account", "/login"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
