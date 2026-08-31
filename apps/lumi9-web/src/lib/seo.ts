/**
 * Site-wide SEO primitives: the canonical origin, absolute-URL helpers and the
 * structured-data blocks that appear on more than one page.
 *
 * Everything that needs an absolute URL - canonicals, Open Graph images,
 * `sitemap.xml`, JSON-LD `@id`s - goes through `SITE_URL` so a single env var
 * moves the whole site between staging and production. Hard-coding the domain
 * in each page is how a staging deploy ends up telling Google its canonical is
 * the production URL, which quietly deindexes the pages you did want crawled.
 *
 * `SITE_URL` is read FIRST and is deliberately not a `NEXT_PUBLIC_` name. Next
 * inlines every `NEXT_PUBLIC_*` reference at build time, and the Docker build
 * stage has no deploy configuration - so a public variable would bake whatever
 * the build happened to see into the image, and the staging guard below could
 * never fire at runtime. Nothing in this module is imported by a client
 * component, so a server-only variable is all it needs.
 *
 * `NEXT_PUBLIC_SITE_URL` is still honoured as a fallback because the email-link
 * verifier already reads it, and one host should not need two settings.
 */

/**
 * The production origin, as fixed by the SEO brief. Change it here and the
 * canonicals, sitemap, JSON-LD and the robots.txt staging guard all follow.
 */
export const CANONICAL_ORIGIN = "https://thelumi9.com";

/** The origin THIS deployment answers on, no trailing slash. */
export const SITE_URL = (
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  CANONICAL_ORIGIN
).replace(/\/$/, "");

/** True only on production. Staging and previews must not be indexed. */
export const IS_CANONICAL_HOST = SITE_URL === CANONICAL_ORIGIN;

/**
 * Why a deployment is serving `noindex`, or null when it is not.
 *
 * The staging guard is correct and load-bearing, and it is also the quietest
 * possible way to launch invisibly. `CANONICAL_ORIGIN` is a constant in this
 * file; `SITE_URL` arrives from the environment. If the site ships on a
 * hostname nobody remembered to write here - `shop.lumi9.in` and `lumi9.in`
 * are both named elsewhere in this repo, and an un-aliased CloudFront
 * distribution serves a `*.cloudfront.net` name - then every page carries
 * `noindex` and robots.txt says `Disallow: /`, the site works perfectly for
 * every human who visits it, and no crawler ever comes. Nothing fails, nothing
 * logs, and the first signal is an empty Search Console weeks later.
 *
 * So the mismatch is surfaced: /api/health reports it as a warning (not a
 * failure - a mis-set origin must never pull tasks out of the load balancer),
 * and `assertCanonicalHostIntent` logs it once at boot.
 */
export function noindexReason(): string | null {
  if (IS_CANONICAL_HOST) return null;
  return `SITE_URL is ${SITE_URL || "(unset)"} but CANONICAL_ORIGIN is ${CANONICAL_ORIGIN} - every page is serving noindex and robots.txt is Disallow: /`;
}

/**
 * Say so, loudly, once, when a production deployment is not indexable.
 *
 * Called from the health probe rather than at module scope: this module is
 * imported by the build, which has no deploy configuration and would warn on
 * every build for no reason.
 */
let warned = false;
export function warnIfNotIndexable(): void {
  if (warned || process.env.NODE_ENV !== "production") return;
  const reason = noindexReason();
  if (!reason) return;
  warned = true;
  console.warn(`[seo] NOT INDEXABLE: ${reason}`);
}

export const SITE_NAME = "Lumi9";
export const BRAND_LEGAL_NAME = "Lumi9 by Femi9";

/** Resolve a site-relative path to an absolute URL. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The default social card - used wherever a page has no image of its own. */
export const DEFAULT_OG_IMAGE = {
  url: absoluteUrl("/assets/journal/lumi9-baby-diapers-our-story.webp"),
  width: 1800,
  height: 1204,
  alt: "Lumi9 Cloud Comfort premium baby diapers by Femi9",
};

/**
 * `alternates.canonical` for a page. Next resolves a relative value against
 * `metadataBase`, but passing the absolute URL keeps the emitted tag readable
 * and independent of where `metadataBase` happens to point.
 */
export function canonical(path: string) {
  return { canonical: absoluteUrl(path) };
}

/* -------------------------------------------------------------------------
   Structured data
   ------------------------------------------------------------------------- */

/** Stable @id fragments, so nodes can reference each other across pages. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const SITE_ID = `${SITE_URL}/#website`;

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: BRAND_LEGAL_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/assets/logo-midnight.png"),
    description:
      "Lumi9 by Femi9 makes Cloud Soft baby diapers and diaper pants - soft, breathable, leak-protected comfort for newborns and growing babies, in sizes NB to XL.",
    parentOrganization: { "@type": "Organization", name: "Femi9", url: "https://femi9.in" },
    areaServed: { "@type": "Country", name: "India" },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@thelumi9.com",
      availableLanguage: ["en", "hi", "ta"],
    },
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    publisher: { "@id": ORG_ID },
    inLanguage: "en-IN",
  };
}

/** Breadcrumb trail. Pass the crumbs in order, root first. */
export function breadcrumbSchema(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * FAQPage. Google only honours this when the same questions and answers are
 * visible on the page, so every caller must render the FAQ block too - passing
 * schema for hidden content is a manual-action risk, not a shortcut to a rich
 * result.
 */
/**
 * Strips the markdown subset used in answer copy. Schema.org answer text is read
 * by machines, not rendered, so `[label](href)` would surface to searchers as
 * literal brackets.
 */
function plainText(markdown: string): string {
  return markdown.replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1");
}

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: plainText(faq.a) },
    })),
  };
}

/**
 * Serialises a JSON-LD node for `dangerouslySetInnerHTML`.
 *
 * `<` is escaped because a stray `</script>` inside any string field - a
 * product description pasted from the console, say - would otherwise close the
 * script tag early and inject the rest of the JSON into the document as markup.
 */
export function jsonLd(data: unknown): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
