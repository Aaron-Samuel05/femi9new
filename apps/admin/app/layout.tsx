import type { Metadata } from 'next'

// Cascade order matters. `globals.css` owns the bare page and the group view;
// `admin.css` is the console's design system and every `.adm-*` class the
// fifteen sections compose; `charts.css` is the primitives the dashboard's
// three charts draw into. All three are global — none is optional, and a page
// that loads only the first renders as unstyled HTML, which is exactly what
// happened while `admin.css` sat in `src/` with nothing importing it.
import './globals.css'
import '@/styles/admin.css'
import '@/charts/charts.css'

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Urbanist and Newsreader are `--sans` and `--serif` in admin.css.
            Loaded by link rather than `next/font` on purpose: the Docker build
            stage has no reason to need the network, and every font token
            already declares a system fallback, so a blocked request costs the
            console its typography and nothing else. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700;800&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
