import path from 'node:path'

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
        ],
      },
    ]
  },
}

export default nextConfig
