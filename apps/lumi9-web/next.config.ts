import type { NextConfig } from "next";

/**
 * Static brand assets (pack photos, feature banners, the mascot GLB and its Draco
 * decoder) never change without a filename change, but Next/Vercel serve /public
 * with `max-age=0, must-revalidate` by default — so every visit paid a
 * revalidation round trip before the 1.3MB mascot could be used. Marking them
 * immutable makes repeat visits free.
 */
const IMMUTABLE = "public, max-age=31536000, immutable";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
      { source: "/draco/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
    ];
  },
};

export default nextConfig;
