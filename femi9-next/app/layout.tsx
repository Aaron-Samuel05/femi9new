import type { Metadata } from 'next'
import Script from 'next/script'

// Lenis base styles (height:auto, overscroll containment) — required for the
// smooth scroll to behave. Then app CSS in cascade order: base tokens first,
// component styles next, responsive media queries LAST so they always win,
// immersive overrides last of all.
import 'lenis/dist/lenis.css'
import '@/styles/base.css'
import '@/components/Nav.css'
import '@/components/Hero.css'
import '@/components/HeroBanner.css'
import '@/components/TrustStrip.css'
import '@/components/Products.css'
import '@/components/WhyBento.css'
import '@/components/Story.css'
import '@/components/Impact.css'
import '@/components/Cta.css'
import '@/components/Footer.css'
import '@/components/CartDrawer.css'
import '@/charts/charts.css'
import '@/styles/app.css'
import '@/styles/blog.css'
import '@/styles/responsive.css'
import '@/immersive/immersive.css'
import '@/styles/figma-landing.css'
import '@/styles/figma-landing-responsive.css'

import { Providers } from './providers'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: 'Femi9 - Organic, breathable period care',
  description:
    'Femi9 makes ultra-thin, breathable organic cotton sanitary pads with a mood-lifting anion strip. Toxin-free, biodegradable, and made for real life.',
  icons: { icon: '/assets/img/logo.png' },
  alternates: {
    canonical: 'https://femi9.in/',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* LCP hero photo + nav logo are React-rendered, so the browser can't
            discover them until the bundle runs. Preloading puts them in flight
            with the HTML. Keep in sync with Hero.tsx / Nav.tsx. */}
        <link rel="preload" as="image" href="/assets/figma-home/image 19.png" fetchPriority="high" />
        <link rel="preload" as="image" href="/assets/figma-home/navbar-imgImage29.png" fetchPriority="high" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500;1,6..72,600&family=Urbanist:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,600&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Femi9',
              url: 'https://femi9.in',
              description: 'Comfortable, breathable sanitary pads and period care products',
              contactPoint: {
                '@type': 'ContactPoint',
                telephone: '+91-90429-16499',
                email: 'support@femi9.in',
              },
            }),
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
        {/* <pad-exploder> web component (zero-dep custom element). Loaded here
            rather than bundled so it stays framework-agnostic. */}
        <Script src="/pad-exploder.js" strategy="afterInteractive" />
      </body>
    </html>
  )
}
