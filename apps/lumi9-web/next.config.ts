import path from "node:path";
import type { NextConfig } from "next";

/**
 * Static brand assets (pack photos, feature banners, the mascot GLB and its Draco
 * decoder) never change without a filename change, but Next/Vercel serve /public
 * with `max-age=0, must-revalidate` by default — so every visit paid a
 * revalidation round trip before the 1.3MB mascot could be used. Marking them
 * immutable makes repeat visits free.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

/**
 * Content Security Policy — production only.
 *
 * Femi9 has carried one since it shipped; this storefront had NO security
 * headers at all, which meant it could be framed by any origin, sniffed for a
 * content type it never declared, and leaked full referrer URLs cross-site. It
 * also takes payments, which makes `frame-ancestors` the difference between a
 * clickjacked checkout and a refused one.
 *
 * Development is exempt because `next dev` needs `eval` for hot reload; the
 * non-CSP headers below apply in both.
 *
 * Each allowance below is here for a specific reason — nothing is speculative:
 *  - 'unsafe-inline' in script-src: Next's own bootstrap and flight payloads are
 *    inline <script>s. Removing it means adopting nonces through the whole
 *    document, which is a change to make deliberately rather than in a headers
 *    block. Femi9 makes the same trade.
 *  - 'wasm-unsafe-eval': public/draco/draco_decoder.wasm decompresses the
 *    mascot GLB. Instantiating any WebAssembly needs it, and without it the
 *    mascot silently fails to load with only a console error.
 *  - checkout.razorpay.com in script-src + *.razorpay.com in frame-src and
 *    connect-src: the payment widget is a script we load and an iframe it opens.
 *  - blob: in worker-src and img-src: three.js creates workers and textures
 *    from object URLs.
 *  - https: in img-src: product photographs may be served from Cloudinary when
 *    that provider branch is configured instead of the S3 bucket.
 */
const productionCsp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://checkout.razorpay.com",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.razorpay.com",
  "frame-src https://*.razorpay.com",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Product photos come from the database now, and `isManagedImageUrl` in
  // @femi9/core admits exactly three shapes: `/uploads/…` (the S3 bucket, via
  // CloudFront's same-origin behaviour), `/assets/…` (bundled), and Cloudinary
  // — the upload route's other provider branch. The first two are same-origin
  // and need nothing here. The third does: next/image THROWS on an
  // unconfigured host, so a deployment that sets CLOUDINARY_URL instead of
  // UPLOADS_BUCKET would 500 every page showing a product it had uploaded.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
  // `X-Powered-By: Next.js` names the framework and its major version to anyone
  // who asks, which is free reconnaissance and buys nothing.
  poweredByHeader: false,

  // The workspace packages ship TypeScript source with no build step in front.
  transpilePackages: ["@femi9/core", "@femi9/db"],

  // The dev server trusts `localhost` and nothing else, so browsing the SAME
  // machine over 127.0.0.1 is a CROSS-ORIGIN request to it. Most chunks are
  // fetched without an `Origin` header and survive; the ones r3f pulls in via
  // dynamic import are CORS requests, and those come back `403 Unauthorized` —
  // three, three-stdlib and @react-three/fiber never load, so the mascot canvas
  // mounts with nothing to draw and the hero sits empty. No error surfaces: the
  // GLB and the Draco decoder both fetch 200, and the component's own boundary
  // never fires because the failure is a missing module, not a throw.
  // `.env` points SITE_URL at 127.0.0.1, so this is the address people use.
  allowedDevOrigins: ["127.0.0.1"],

  // Emit a self-contained server bundle for the container image. Without this
  // the Docker runner stage would have to ship the whole workspace and its
  // node_modules; with it, Next traces the modules actually reached and writes
  // a server.js that runs on the base image alone.
  output: "standalone",

  // Trace from the WORKSPACE ROOT, not this directory. npm workspaces hoist the
  // dependency tree above the app, so a trace rooted here would miss almost
  // every dependency and the image would start and immediately fail on a
  // missing module.
  outputFileTracingRoot: path.join(import.meta.dirname, "..", ".."),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // Explicitly OFF. The legacy XSS auditor introduced vulnerabilities of
          // its own and is gone from every current browser; a CSP is the control
          // that replaced it. Femi9 sends the same 0.
          { key: "X-XSS-Protection", value: "0" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Content-Security-Policy", value: productionCsp }]
            : []),
        ],
      },
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
      { source: "/draco/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
    ];
  },
};

export default nextConfig;
