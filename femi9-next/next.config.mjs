import { withSentryConfig } from '@sentry/nextjs'

const productionCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.razorpay.com https://*.ingest.sentry.io",
  "frame-src https://*.razorpay.com",
  'upgrade-insecure-requests',
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The three.js / R3F stack ships ESM that Next needs to transpile.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '0' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Content-Security-Policy', value: productionCsp }]
            : []),
        ],
      },
    ]
  },

  // Emit a self-contained production server for containerized deploys (ECS Fargate).
  // With this, `next build` writes `.next/standalone/server.js` plus a *minimal*,
  // Node-file-trace-pruned `node_modules` — so the runtime image does not need the
  // full dependency tree, `npm start`, or the source. The Dockerfile launches it with
  // `node server.js`.
  //
  // IMPORTANT: standalone does NOT copy `public/` or `.next/static/` into the
  // standalone folder — those must be copied into the image alongside it. The
  // Dockerfile handles this (see the runner stage).
  output: 'standalone',
}

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
})
