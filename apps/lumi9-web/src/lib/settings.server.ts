import "server-only";
import { cache } from "react";
import { getSettings } from "@femi9/core/services/settings";

/**
 * The console's business numbers, for the SENTENCES that quote them.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `Settings.freeShipThreshold` and `Settings.subscribeSavePct` were already the
 * numbers a shopper is CHARGED — `/api/checkout/quote` prices against the first
 * and `generateDueOrders()` discounts a renewal by the second. What nothing
 * owned was the numbers a shopper is TOLD, which were typed into the copy as
 * literals: "free delivery on orders over ₹999" in six places and "save 20%" in
 * two, against a console default of 15.
 *
 * So `/subscription` promised 20% in its hero and said 15% in the box builder
 * eight hundred pixels below it, on the same screen, and the higher of the two
 * was the one that was not true. Moving the console's value fixed neither
 * sentence, and nothing anywhere reported the disagreement: both numbers
 * rendered perfectly.
 *
 * A number a shopper reads and a number a shopper is charged have to come from
 * one place. This is that place for the server-rendered copy; on the client the
 * same values arrive through `useQuote()` (the threshold) and `useCatalogData()`
 * (the percentage), which is why neither of those had the bug.
 *
 * ── Why `cache()` ───────────────────────────────────────────────────────────
 * `loadCatalog()` already reads settings once per request for the root layout.
 * A page interpolating a sentence must not add a second round trip for two
 * integers, and `/help` renders a FAQ list that quotes both. React's `cache`
 * dedupes for the life of the request, so every caller shares one query.
 *
 * ── Why not `catalog.server.ts` ─────────────────────────────────────────────
 * That loader returns the CATALOGUE and hands it to a client provider. A server
 * component that needs one integer for one sentence should not pull five
 * products, twelve variants and their photography across the wire to get it.
 */
export const storefrontNumbers = cache(async () => {
  const settings = await getSettings("lumi9");
  return {
    /** What a basket must reach to ship free. The quote API charges against this. */
    freeShipThreshold: settings.freeShipThreshold,
    /** The subscription discount, as a percentage. Renewals apply this. */
    subscribeSavePct: settings.subscribeSavePct,
    /** Digits only, as `wa.me` wants them — the console stores `919042916499`. */
    whatsappNumber: settings.whatsappNumber,
  };
});

export type StorefrontNumbers = Awaited<ReturnType<typeof storefrontNumbers>>;
