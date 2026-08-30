import path from 'node:path'

/**
 * The console's Content-Security-Policy — production only (`next dev` needs
 * `eval` for hot reload).
 *
 * This is the tightest policy on the platform, and it can be: the console loads
 * NO third-party script. There is no payment widget, no analytics, no tag
 * manager. The only external origin it touches at all is Google Fonts, and only
 * for a stylesheet and the font files it names — so `script-src` needs no host
 * beyond 'self' and `connect-src` needs none at all.
 *
 * `'unsafe-inline'` in script-src is Next's own inline bootstrap, the same trade
 * both storefronts make. Everything else is closed: no object, no frame, no
 * form posting off-origin, and `frame-ancestors 'none'` alongside the
 * X-Frame-Options below (the header for old browsers, the directive for current
 * ones) so a refund button cannot be clickjacked.
 *
 * `img-src` allows https: because product thumbnails in the catalogue list are
 * whatever the upload route returned, which is the CDN in production.
 */
const productionCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  'upgrade-insecure-requests',
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Trace from the workspace root: the dependency tree is hoisted above this app.
  outputFileTracingRoot: path.join(import.meta.dirname, '..', '..'),
  // Workspace packages ship TypeScript source with no build step in front.
  transpilePackages: ['@femi9/core', '@femi9/db', '@femi9/db-platform'],
  output: 'standalone',

  async headers() {
    return [
      {
        // The ops console is never embedded, never indexed, and never needs a
        // referrer. It can also refund money, so the defaults are strict.
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy', value: productionCsp }]
            : []),
        ],
      },
    ]
  },
}

export default nextConfig
