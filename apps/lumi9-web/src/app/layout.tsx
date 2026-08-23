import type { Metadata, Viewport } from "next";
import { ABeeZee, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { loadCatalog } from "@/lib/catalog.server";
import { CatalogProvider } from "@/lib/catalog-context";
import { CartProvider } from "@/lib/cart";

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

export const metadata: Metadata = {
  title: {
    default: "Lumi9 — Happy day, every day",
    template: "%s · Lumi9",
  },
  description:
    "Ultra-soft, chemical-free Cloud Soft diapers engineered with a 5-layer protection system — gentle on delicate skin, up to 12 hours of dryness, kind to the planet.",
  metadataBase: new URL("https://lumi9.in"),
  openGraph: {
    title: "Lumi9 — Happy day, every day",
    description: "Chemical-free, cloud-soft diapers for every stage. Trusted by 40,000+ Indian families.",
    type: "website",
    locale: "en_IN",
  },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
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
        <CatalogProvider catalog={catalog}>
          <CartProvider>{children}</CartProvider>
        </CatalogProvider>
      </body>
    </html>
  );
}
