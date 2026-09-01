import type { MetadataRoute } from "next";
import { loadCatalog } from "@/lib/catalog.server";
import { listJournalPosts } from "@/lib/journal.server";
import { absoluteUrl } from "@/lib/seo";

/**
 * `/sitemap.xml`.
 *
 * The marketing URLs are known statically; the products AND the journal are
 * database questions, so both are read the same way the pages read them.
 *
 * Both reads are wrapped. A sitemap route that throws returns a 500 to the
 * crawler, and a repeated 500 is treated as "this sitemap is gone" - a transient
 * database blip would quietly cost the whole site its submitted URL set. Both
 * therefore fall back to NOTHING, because there is no honest static answer to
 * "which products and articles exist" once the console can add and retire them.
 * A sitemap missing a section for a minute beats one that 500s, and beats one
 * that lists five slugs somebody deleted last week.
 *
 * `dynamic` matches the rest of the tree: the build stage has no database.
 */
export const dynamic = "force-dynamic";

/** Priorities are relative within one site - these rank Lumi9's own pages. */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/shop", priority: 0.9, changeFrequency: "weekly" },
  { path: "/size-guide", priority: 0.8, changeFrequency: "monthly" },
  { path: "/parenting-tools", priority: 0.7, changeFrequency: "monthly" },
  { path: "/subscription", priority: 0.7, changeFrequency: "monthly" },
  { path: "/journal", priority: 0.7, changeFrequency: "weekly" },
  { path: "/about", priority: 0.6, changeFrequency: "yearly" },
  { path: "/help", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.5, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.2, changeFrequency: "yearly" },
];

/**
 * Deliberately absent: /cart, /checkout, /confirmation, /account and /login.
 * They are per-session or transactional, have nothing to rank for, and are
 * disallowed in robots.ts - listing a URL you also block is a Search Console
 * warning on every crawl.
 */

/** The journal's URLs, or an empty list if the database is unreachable. */
async function journalEntries(): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await listJournalPosts();
    return posts.map((post) => ({
      url: absoluteUrl(`/journal/${post.slug}`),
      // The article's own timestamp, not `now` - telling a crawler that every
      // post changed today on every fetch is how lastmod stops being believed.
      lastModified: new Date(post.updated),
      changeFrequency: "yearly" as const,
      priority: post.featured ? 0.75 : 0.65,
    }));
  } catch {
    return [];
  }
}

/**
 * The product URLs, from the database and from nowhere else.
 *
 * This used to fall back to the `SIZES` array in `@/lib/catalog` - the seed's
 * input - whenever the read failed or came back empty. That is the one place a
 * stale list actively hurts: a size retired in the console would go on being
 * advertised to crawlers, and every one of those URLs is a 404 being submitted
 * on purpose. A sitemap briefly missing its products is recoverable; one
 * asserting products that do not exist is a crawl-error report.
 */
async function productPaths(): Promise<string[]> {
  try {
    const { sizes } = await loadCatalog();
    return sizes.map((entry) => `/product/${entry.size.toLowerCase()}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [products, journal] = await Promise.all([productPaths(), journalEntries()]);

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
    ...journal,
  ];
}
