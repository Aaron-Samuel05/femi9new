import { loadCatalog } from "@/lib/catalog.server";
import { listJournalPosts } from "@/lib/journal.server";
import { absoluteUrl, IS_CANONICAL_HOST } from "@/lib/seo";

/**
 * `/llms.txt` — the llmstxt.org convention: a short, curated, human-readable
 * map of the site for an LLM to read instead of crawling and guessing.
 *
 * Same rule as `sitemap.ts` and `robots.ts` beside it: this app is
 * `force-dynamic` because the catalogue and the journal are database
 * questions the Docker build stage cannot answer, and a stale product list
 * here is the same defect a stale sitemap entry is — a size the console
 * retired going on being described as current. The marketing pages are
 * listed statically because they are not console content; the size list and
 * the featured articles are read live.
 *
 * Text, not XML/JSON — the spec is markdown, and a crawler capable of using
 * this file is capable of reading a plain sentence.
 */
export const dynamic = "force-dynamic";

async function sizeLines(): Promise<string> {
  try {
    const { sizes } = await loadCatalog();
    return sizes
      .map((s) => `- [Cloud Soft — ${s.name}](${absoluteUrl(`/product/${s.size.toLowerCase()}`)}): fits ${s.fits}.`)
      .join("\n");
  } catch {
    return "";
  }
}

async function journalLines(): Promise<string> {
  try {
    const posts = await listJournalPosts();
    return posts
      .filter((p) => p.featured)
      .slice(0, 6)
      .map((p) => `- [${p.title}](${absoluteUrl(`/journal/${p.slug}`)})`)
      .join("\n");
  } catch {
    return "";
  }
}

export async function GET() {
  // Same staging guard robots.ts uses: a non-canonical origin has no business
  // telling an LLM it is the real lumi9.in.
  if (!IS_CANONICAL_HOST) {
    return new Response("This deployment is not lumi9.in — see https://lumi9.in/llms.txt\n", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const [sizes, journal] = await Promise.all([sizeLines(), journalLines()]);

  const body = `# Lumi9

> Lumi9 by Femi9 makes Cloud Soft baby diapers and diaper pants for newborns through toddlers (sizes NB to XL) — cotton-like softness, an Advanced SAP Core for quick moisture absorption, 360° leakage protection and a wetness indicator. Sold as one-off packs or a recurring, size-adjusting subscription, shipped pan-India from lumi9.in.

Pricing, discounts, stock and shipping are set live in an operator console and read at request time on every page — nothing about a product, its price or its availability is fixed at build time, so this file and the site itself never disagree.

## Shop
- [All sizes and packs](${absoluteUrl("/shop")}): every Cloud Soft size and pack tier, with live pricing.
${sizes}
- [Size guide](${absoluteUrl("/size-guide")}): the weight-band size chart and the size-up tool.

## Subscription
- [Build a box](${absoluteUrl("/subscription")}): recurring diaper delivery that adjusts with your baby's size — skip, pause or cancel anytime.

## Learn
- [Parenting tools](${absoluteUrl("/parenting-tools")}): baby weight/size tracker, immunisation schedule, diaper planner.
- [Journal](${absoluteUrl("/journal")}): parenting and diapering articles.
${journal}
- [About](${absoluteUrl("/about")})
- [Help](${absoluteUrl("/help")})

## Optional
- [Contact](${absoluteUrl("/contact")})
- [Terms](${absoluteUrl("/terms")})
- [Privacy](${absoluteUrl("/privacy")})
`;

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
