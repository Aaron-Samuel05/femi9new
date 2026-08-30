import type { MetadataRoute } from "next";
import { loadCatalog } from "@/lib/catalog.server";
import { SIZES } from "@/lib/catalog";
import { POSTS } from "@/lib/journal";
import { absoluteUrl } from "@/lib/seo";

/**
 * `/sitemap.xml`.
 *
 * Marketing and journal URLs are known statically; the product routes are a
 * database question, so the catalogue is read the same way the pages read it.
 *
 * That read is wrapped, and the seed's size list is the fallback. A sitemap
 * route that throws returns a 500 to the crawler, and a repeated 500 is treated
 * as "this sitemap is gone" — a transient database blip would quietly cost the
 * whole site its submitted URL set. Serving a slightly stale list is strictly
 * better than serving none.
 *
 * `dynamic` matches the rest of the tree: the build stage has no database.
 */
export const dynamic = "force-dynamic";

/** Priorities are relative within one site — these rank Lumi9's own pages. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/shop", priority: 0.9, changeFrequency: "weekly" },
  { path: "/size-guide", priority: 0.8, changeFrequency: "monthly" },
  { path: "/subscription", priority: 0.7, changeFrequency: "monthly" },
  { path: "/journal", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "yearly" },
  { path: "/help", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
];

/**
 * Deliberately absent: /cart, /checkout, /confirmation, /account and /login.
 * They are per-session or transactional, have nothing to rank for, and are
 * disallowed in robots.ts — listing a URL you also block is a Search Console
 * warning on every crawl.
 */

async function productPaths(): Promise<string[]> {
  try {
    const { sizes } = await loadCatalog();
    if (sizes.length > 0) return sizes.map((entry) => `/product/${entry.size.toLowerCase()}`);
  } catch {
    // fall through to the seed list
  }
  return SIZES.map((size) => `/product/${size.size.toLowerCase()}`);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const products = await productPaths();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: absoluteUrl(route.path),
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...products.map((path) => ({
      url: absoluteUrl(path),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    })),
    ...POSTS.map((post) => ({
      url: absoluteUrl(`/journal/${post.slug}`),
      // The article's own date, not `now` — telling a crawler that every post
      // changed today on every fetch is how lastmod stops being believed.
      lastModified: new Date(`${post.updated ?? post.published}T00:00:00Z`),
      changeFrequency: "yearly" as const,
      priority: post.featured ? 0.75 : 0.65,
    })),
  ];
}
