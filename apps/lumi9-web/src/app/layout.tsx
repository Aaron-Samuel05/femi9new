import type { Metadata, Viewport } from "next";
import { ABeeZee, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { loadCatalog } from "@/lib/catalog.server";
import { CatalogProvider } from "@/lib/catalog-context";
import { CartProvider } from "@/lib/cart";
import {
  DEFAULT_OG_IMAGE,
  IS_CANONICAL_HOST,
  jsonLd,
  organizationSchema,
  SITE_NAME,
  SITE_URL,
  websiteSchema,
} from "@/lib/seo";

const display = ABeeZee({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-abeezee",
  display: "swap",
});

const ui = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

/**
 * Brand-level defaults. Every route that can rank supplies its own title,
 * description and — importantly — its own `alternates.canonical`; a canonical
 * declared once up here would name the homepage as the canonical of every page
 * on the site, which is a request to drop them all from the index.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Lumi9 by Femi9 — Soft, Breathable Baby Diapers & Diaper Pants",
    template: "%s · Lumi9",
  },
  description:
    "Lumi9 by Femi9 baby diapers and diaper pants for newborns and growing babies — soft cotton-like comfort, an Advanced SAP Core for quick moisture absorption, breathable protection, 360° coverage and a wetness indicator, in sizes NB to XL.",
  applicationName: SITE_NAME,
  category: "Baby care",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: SITE_URL,
    title: "Lumi9 by Femi9 — Soft, Breathable Baby Diapers & Diaper Pants",
    description:
      "Cloud Soft baby diapers and diaper pants designed around everyday movement, moisture management and dependable protection — NB to XL.",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumi9 by Femi9 — Soft, Breathable Baby Diapers",
    description:
      "Cloud Soft baby diapers and diaper pants designed around everyday movement, moisture management and dependable protection — NB to XL.",
    images: [DEFAULT_OG_IMAGE.url],
  },
  /**
   * A non-production origin serves `noindex` from every page as well as a
   * blanket robots.txt disallow. The two guard different failure modes: a URL
   * already in the index is only removed by the meta tag, which a crawler can
   * only read on a page robots.txt let it fetch.
   */
  robots: IS_CANONICAL_HOST
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } }
    : { index: false, follow: false },
  formatDetection: { telephone: false },
  icons: { icon: "/favicon.ico" },
};

/**
 * `viewportFit: "cover"` is what ARMS `env(safe-area-inset-*)`.
 *
 * Next only injects `width=device-width, initial-scale=1` by default, which
 * leaves viewport-fit unset — and with it unset every safe-area inset resolves
 * to 0 in every browser. That silently turned the `max(...)` in the `px-safe`
 * utility and in JournalGrid into a no-op, so the app's entire safe-area story
 * did nothing on a notched phone.
 *
 * Deliberately NO `maximum-scale` / `user-scalable=no`: pinch-zoom must stay
 * available.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f5ea",
};

/**
 * Rendered per request, not at build time.
 *
 * The catalogue is live data now — the console can change a price or retire a
 * size — so prerendering it would serve whatever was true when the image was
 * built. It also keeps the BUILD free of database credentials, which matters
 * because the Docker build stage has none: they arrive at deploy time from
 * Secrets Manager. A build that needs a database is a build that cannot run in
 * CI without one.
 *
 * The cost is an SSR per request, which is what the Femi9 storefront already
 * does. If that becomes a problem, the fix is caching the catalogue read behind
 * a tag the console invalidates on write — not going back to build-time data.
 */
export const dynamic = "force-dynamic";

/**
 * The catalogue is loaded ONCE here, per request, and handed to the client tree
 * through CatalogProvider. Every size chip, price and pack tier on the page
 * comes from that single query rather than from a hardcoded module.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const catalog = await loadCatalog();

  return (
    // data-scroll-behavior keeps route changes instant while in-page anchors stay smooth
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${display.variable} ${ui.variable}`}>
      <body className="font-ui antialiased">
        {/* Organization + WebSite, emitted once for the whole site. Every other
            node (BlogPosting, Product, BreadcrumbList) references these by @id
            rather than restating the publisher on each page. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationSchema())} />
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(websiteSchema())} />
        <CatalogProvider catalog={catalog}>
          <CartProvider>{children}</CartProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
