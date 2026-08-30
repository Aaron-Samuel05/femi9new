import type { Metadata, Viewport } from "next";
import { Caveat, Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { loadCatalog } from "@/lib/catalog.server";
import { CatalogProvider } from "@/lib/catalog-context";
import { CartProvider } from "@/lib/cart";
import { CartUIProvider } from "@/lib/cart-ui";
import { CartQuoteProvider } from "@/lib/quote";
import { SessionProvider } from "@/lib/auth-context";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { Toast } from "@/components/ui/Toast";
import {
  DEFAULT_OG_IMAGE,
  IS_CANONICAL_HOST,
  jsonLd,
  organizationSchema,
  SITE_NAME,
  SITE_URL,
  websiteSchema,
} from "@/lib/seo";

/**
 * ONE family, two roles — the same axis lumi9.in ships.
 *
 * The storefront used to pair ABeeZee (display) with Hanken Grotesk (UI). Two
 * faces is the safer default, but it is not what the brand actually looks like:
 * lumi9.in sets its whole page in Nunito and leans on WEIGHT for hierarchy,
 * which is why its headings read warm rather than editorial. A rounded terminal
 * on a baby-care page is doing real work — Hanken's flat terminals were quietly
 * making the same copy read like a B2B dashboard.
 *
 * Roman only. lumi9.in requests `ital,wght@0,400..0,900` — the `0,` prefix on
 * every pair means it never loads an italic, and headings must not be italic
 * anyway (it is one of the most reliable generated-design tells).
 *
 * Both `--font-display` and `--font-ui` resolve here so every existing call
 * site keeps working; the token names are the app's, the family is the brand's.
 */
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal"],
  variable: "--font-nunito",
  display: "swap",
});

/**
 * Display — the punch-line face.
 *
 * Fredoka's rounded terminals and heavy weights are what @lumi9official's post
 * creatives set their statements in ("LUMI9 BABY DIAPERS", "Less Worries",
 * "A BIG HELLO"). Nunito can reach 900 but stays a text face at size; Fredoka
 * is drawn to be large, so a headline gains weight without gaining primness.
 */
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

/**
 * Script — the emphasis face, and the reason this variation exists.
 *
 * The Instagram grid pairs a brush script against that heavy sans on nearly
 * every card: "A Mother's" over "Love in Every Layer", "More Cuddles" over
 * "Less Worries", "The Wait Is Over" over "Meet Lumi9 Baby Diapers". The site
 * was reaching for the same emphasis with `font-style: italic`, which is a
 * different gesture entirely — a slanted text face reads as a generated
 * emphasis tic, where a second, genuinely different face reads as a brand.
 *
 * Caveat is NOT loaded as an italic. It is an upright handwriting face; the
 * slant is drawn into the letterforms rather than sheared onto them, which is
 * why it holds up at display sizes where a synthesised oblique falls apart.
 */
const caveat = Caveat({
  subsets: ["latin"],
  weight: ["600", "700"],
  style: ["normal"],
  variable: "--font-caveat",
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
  /*
   * No `icons` here on purpose.
   *
   * The icons are FILE CONVENTIONS — src/app/favicon.ico, icon.svg and
   * apple-icon.png — which Next discovers and links itself, with a content hash
   * for cache busting. An explicit `icons` field in metadata OVERRIDES that
   * discovery rather than adding to it, so the `icon: "/favicon.ico"` that used
   * to sit here suppressed the SVG and the Apple icon and pointed at
   * /favicon.ico in `public/`, where no such file has ever existed.
   */
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
    <html
      lang="en-IN"
      data-scroll-behavior="smooth"
      className={`${nunito.variable} ${fredoka.variable} ${caveat.variable}`}
    >
      <body className="font-ui antialiased">
        {/* Organization + WebSite, emitted once for the whole site. Every other
            node (BlogPosting, Product, BreadcrumbList) references these by @id
            rather than restating the publisher on each page. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(organizationSchema())} />
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(websiteSchema())} />
        {/* Provider order is load-bearing.
            · SessionProvider is outermost and independent — one /api/auth/me for
              the whole tree, so the nav, the account entry and checkout cannot
              disagree about who is signed in.
            · CartUIProvider sits ABOVE CartProvider because the cart calls the
              chrome ("open me", "say this") and never the other way round.
            · The drawer and the toast are siblings of `children`, INSIDE
              CartQuoteProvider: the drawer shows the server's total and the
              free-shipping threshold, so it needs the quote. */}
        <SessionProvider>
          <CatalogProvider catalog={catalog}>
            <CartUIProvider>
              <CartProvider>
                {/* Totals come from the server, once, for both the cart and checkout. */}
                <CartQuoteProvider>
                  {children}
                  <CartDrawer />
                  <Toast />
                </CartQuoteProvider>
              </CartProvider>
            </CartUIProvider>
          </CatalogProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
