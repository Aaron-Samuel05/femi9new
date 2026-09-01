/**
 * Where the mascot model and its decoder live.
 *
 * This is a PLAIN module, not part of `components/three/mascot-shared`, because
 * two very different callers need the same string: the client canvas that loads
 * it, and the server-rendered `<link rel="preload">` on the home page. A `"use
 * client"` module cannot supply the second - its exports cross the boundary as
 * client references - so the constant sat duplicated as a literal in
 * `app/page.tsx`, and the two drifted. That drift is not cosmetic: see the
 * versioning note below.
 */

/**
 * Versioned filename on purpose. `/assets/:path*` is served
 * `max-age=31536000, immutable` (next.config.ts), so a browser that has fetched
 * this URL once will NOT revalidate it for a year, and neither will the
 * CloudFront edge in front of it - re-saving the model under the same name
 * leaves earlier visitors on the old bytes indefinitely.
 *
 * That is exactly what kept the footer mascot rendering as an untextured pale
 * figure after the EXT_texture_webp fix: the corrected GLB shipped, byte for
 * byte, under the name the broken one had already been cached under, so nobody
 * who had loaded the site before ever saw it. Fixing the file is only half the
 * fix - BUMP THIS SUFFIX whenever the GLB changes.
 */
export const MASCOT_URL = "/assets/mascot-v3.glb";

/**
 * Draco-compressed geometry, decoded by a self-hosted decoder (no CDN request).
 * Draco halves the transfer size versus meshopt at identical triangle counts.
 */
export const DRACO_DECODER_PATH = "/draco/";
