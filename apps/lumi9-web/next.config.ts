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
 *  - blob: in worker-src, img-src AND connect-src: three.js creates workers and
 *    textures from object URLs. connect-src is the one that is easy to miss and
 *    the one the mascot actually needs: GLTFLoader extracts each embedded
 *    texture from the GLB into a Blob URL and hands it to ImageBitmapLoader,
 *    which FETCHES it — so the request is governed by connect-src, not img-src.
 *    Without it the browser refuses all three maps, GLTFLoader logs "Couldn't
 *    load texture blob:..." and carries on, and the model renders with its
 *    default WHITE base colour: a pale, untextured mascot on a live site that
 *    is perfect in `next dev`, because this CSP is production-only.
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
  "connect-src 'self' blob: https://*.razorpay.com",
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

  /**
   * Let the SERVER resolve `/uploads/…`, which it otherwise cannot.
   *
   * `/uploads/…` is same-origin to a BROWSER — CloudFront has a behaviour that
   * serves that prefix from the S3 bucket over Origin Access Control, so an
   * `<img src="/uploads/x.jpeg">` loads fine. The comment above says those need
   * nothing here, and for a plain img tag that is true.
   *
   * next/image is not a plain img tag. The optimizer resolves a relative `src`
   * against its OWN origin and fetches it server-side — inside the container,
   * where `/uploads` does not exist, because those bytes are in S3 and only
   * CloudFront knows to go there. It got the 404 page back and answered
   * `400 "The requested resource isn't a valid image"`, so every product photo
   * and journal cover rendered as a broken image the moment the catalogue
   * stopped pointing at files baked into the image.
   *
   * Nothing failed at build time and the direct URL still returns 200 — only
   * `/_next/image?url=…` breaks, which is the URL the page actually requests.
   *
   * This sends the server's own lookup back out to the CDN, which routes it to
   * S3. It fixes every consumer at once — catalogue, journal, and anything the
   * console uploads next — without absolute URLs in the database.
   *
   * ⚠️ The destination MUST be a host that serves `/uploads/*` from the bucket.
   * Pointed at the load balancer instead it would resolve to this app again and
   * proxy to itself.
   */
  async rewrites() {
    /*
     * In DEVELOPMENT the bytes are on the console's disk, not in S3.
     *
     * `/<brand>/api/upload` falls back to writing under `public/uploads` when
     * no bucket is configured, and `process.cwd()` there is apps/admin — so a
     * photo or a popup GIF uploaded locally exists only on :3002. Sending this
     * app's `/uploads/*` to SITE_URL in dev pointed it at ITSELF, where the
     * file has never been, so every locally uploaded image 404'd while the same
     * code was correct in production. Point it at the console instead;
     * UPLOADS_ORIGIN overrides for anyone running it on another port.
     */
    if (process.env.NODE_ENV !== "production") {
      const dev = process.env.UPLOADS_ORIGIN || "http://127.0.0.1:3002";
      return [{ source: "/uploads/:path*", destination: `${dev}/uploads/:path*` }];
    }
    const origin = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (!origin) return [];
    return [{ source: "/uploads/:path*", destination: `${origin}/uploads/:path*` }];
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
