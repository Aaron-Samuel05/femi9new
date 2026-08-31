import { cookies } from "next/headers";

/**
 * Guest session helpers for Lumi9.
 *
 * Anonymous carts are keyed by an opaque token in an httpOnly cookie - the only
 * thing tying repeat requests to the same `Cart` row before sign-in.
 *
 * The cookie NAME is brand-specific even though the brands are on different
 * hosts. Different hosts already isolate cookies; naming them apart means that
 * if the two are ever served from one domain, a Femi9 cart token cannot be
 * presented as a Lumi9 one.
 */

export const GUEST_COOKIE = "lumi9_cart";

/** The token on the current request, or null if this visitor has no cart yet. */
export async function getGuestToken(): Promise<string | null> {
  return (await cookies()).get(GUEST_COOKIE)?.value ?? null;
}

/** Mint a token for a first-time visitor. The caller persists it onto the
 *  response cookie - see the cart POST handler. */
export function newGuestToken(): string {
  return crypto.randomUUID();
}
