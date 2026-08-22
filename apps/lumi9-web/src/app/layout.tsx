import type { Metadata, Viewport } from "next";
import { ABeeZee, Hanken_Grotesk } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-scroll-behavior keeps route changes instant while in-page anchors stay smooth
    <html lang="en-IN" data-scroll-behavior="smooth" className={`${display.variable} ${ui.variable}`}>
      <body className="font-ui antialiased">{children}</body>
    </html>
  );
}
