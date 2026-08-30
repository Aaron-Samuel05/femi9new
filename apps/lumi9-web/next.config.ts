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

const nextConfig: NextConfig = {
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
      { source: "/assets/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
      { source: "/draco/:path*", headers: [{ key: "Cache-Control", value: IMMUTABLE }] },
    ];
  },
};

export default nextConfig;
