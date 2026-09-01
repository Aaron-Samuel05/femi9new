/**
 * "Moments" — the Instagram rail's clips and stills, as the home page plays them.
 *
 * ── What this is ────────────────────────────────────────────────────────────
 * The eight creatives that run in the Instagram band on the OLD lumi9.in (the
 * Vite storefront), which serves them from `GET /api/instagram/feed` as a list
 * of `{mediaType, imageUrl, videoUrl}` rows. That endpoint belongs to the
 * Laravel app this storefront replaces, so the media was pulled off its
 * CloudFront distribution and re-uploaded into THIS platform's uploads bucket —
 * otherwise the new site would be hotlinking the old one's CDN, and retiring
 * that stack would blank the section.
 *
 * Not to be confused with `components/home/Testimonials.tsx`, which is the
 * WRITTEN reviews rail and reads `Review` rows through the console's moderation
 * queue. This is brand-authored creative, and no table models it — it belongs
 * with the rest of the marketing chrome (see this app's CLAUDE.md).
 *
 * ── Why a hand-written list ─────────────────────────────────────────────────
 * Same reasoning as Femi9's `data/videoTestimonials.ts`: files cannot be
 * enumerated at runtime, each item needs a description no filename carries, and
 * an explicit list means a half-finished upload never appears on the storefront
 * by accident. When Instagram moments become something the console owns, this
 * becomes the seed's input the way `catalog.ts` and `journal.ts` already are.
 *
 * ── How to add one ──────────────────────────────────────────────────────────
 * 1. Upload the file (and, for a clip, a poster frame beside it) under the same
 *    prefix. The poster is REQUIRED on a clip: it is what every card that is
 *    not the one playing paints, and without one the card is a black rectangle
 *    the browser has to start downloading video to fill.
 *
 *      aws s3 cp <file> s3://femi9-staging-uploads-851725383246/uploads/lumi9/testimonials/ \
 *        --profile femi9-staging --content-type video/mp4 \
 *        --cache-control "public, max-age=2592000"
 *
 * 2. Add an entry below. Order is the order the rail turns in.
 *
 * Clips want to be SHORT — the rail plays each one end to end before moving on,
 * so a three-minute clip parks it. 10–40s is the useful range; `parent-story`
 * at 62s is already at the edge of what a rail should hold.
 */

/**
 * Where the media is served from.
 *
 * SITE-RELATIVE on purpose, exactly like Femi9's rail and like every
 * `ProductImage.url` the console writes. No CDN hostname is baked in, so the
 * path resolves per environment with no code change: the `/uploads/*`
 * CloudFront behaviour (infra/terraform/cloudfront.tf) points at the shared
 * uploads bucket, and each brand's distribution serves its own prefix.
 *
 * Brand-scoped (`lumi9/`) because that bucket holds BOTH brands — Femi9's rail
 * is at `/uploads/testimonials`, and an unscoped prefix here would put two
 * brands' stories in one folder.
 *
 * NOT in `public/`: 27MB of binary is 27MB in every clone and every container
 * image forever, and the app server would be streaming the video itself,
 * including the range requests seeking generates, rather than letting the edge
 * do it.
 */
const BASE = "/uploads/lumi9/testimonials";

export interface Moment {
  /** Stable key, also the DOM id suffix — keep it slug-like. */
  id: string;
  /**
   * The still the card paints: the image itself on a photo card, the poster
   * frame on a clip. Always present, always what is painted first.
   */
  poster: string;
  /**
   * The clip, when there is one. Its ABSENCE is what makes a card a still —
   * there is no `kind` field to get out of step with the file list.
   */
  video?: string;
  /**
   * What the card shows. Not drawn anywhere: the rail is uncaptioned, and this
   * is the accessible name every control on the card is labelled with ("Play:
   * a mother holding her sleeping baby"). It is what a screen reader announces
   * and what a keyboard visitor hears, so write it as a description of the
   * content rather than a file name.
   */
  alt: string;
}

/**
 * In the order the old site's feed returns them, so the two storefronts tell
 * the story in the same sequence while both are up.
 *
 * Source files were `L1`–`L10` on the Laravel CDN; renamed to content slugs on
 * the way in, because `L8.mp4` tells the next reader nothing. The mapping, for
 * anyone comparing the two sites:
 *
 *   L10 → store-aisle      L8 → parent-story    L7 → mothers-love
 *   L1  → ten-times-a-day   L2 → goodnight       L4 → meet-lumi9
 *   L3  → tiniest-skin      L5 → little-shopper
 *
 * All four clips arrived already 720×1280 H.264 at ~1–1.4 Mbps with the moov
 * atom up front, which is the shape Femi9's rail transcodes TO — so they were
 * uploaded as-is rather than re-encoded a second time for nothing. The poster
 * frames were cut at 1.2s (frame zero is a fade-in on several of them).
 */
export const MOMENTS: Moment[] = [
  {
    id: "store-aisle",
    poster: `${BASE}/store-aisle.jpg`,
    video: `${BASE}/store-aisle.mp4`,
    alt: "A mother comparing diaper packs along a supermarket shelf",
  },
  {
    id: "parent-story",
    poster: `${BASE}/parent-story.jpg`,
    video: `${BASE}/parent-story.mp4`,
    alt: "A mother at home unpacking her Lumi9 order and talking through it",
  },
  {
    id: "mothers-love",
    poster: `${BASE}/mothers-love.jpg`,
    alt: "A mother holding her sleeping newborn — a mother's love in every layer",
  },
  {
    id: "ten-times-a-day",
    poster: `${BASE}/ten-times-a-day.jpg`,
    alt: "Muddy little footprints across a floor — what if this happened ten times a day?",
  },
  {
    id: "goodnight",
    poster: `${BASE}/goodnight.jpg`,
    video: `${BASE}/goodnight.mp4`,
    alt: "Lumi the avocado asleep under the covers on a moonlit night",
  },
  {
    id: "meet-lumi9",
    poster: `${BASE}/meet-lumi9.jpg`,
    alt: "The Lumi9 Cloud Comfort diaper pack and its full size run",
  },
  {
    id: "tiniest-skin",
    poster: `${BASE}/tiniest-skin.jpg`,
    alt: "Soft cotton clouds — soft enough for the tiniest skin",
  },
  {
    id: "little-shopper",
    poster: `${BASE}/little-shopper.jpg`,
    video: `${BASE}/little-shopper.mp4`,
    alt: "An animated baby in a shopping trolley, upset in the diaper aisle",
  },
];
