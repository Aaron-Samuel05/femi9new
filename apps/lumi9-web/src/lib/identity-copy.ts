import type { IdentityField } from "@femi9/core/services/auth";

/**
 * Brand-neutral wording for the one shared error whose message names a brand.
 *
 * `IdentityConflictError` in `@femi9/core` builds its message eagerly in the
 * constructor, and that string says "another Femi9 account". The class is
 * otherwise perfectly brand-agnostic, and Femi9's own tests assert on that
 * copy, so the fix belongs at THIS boundary rather than in the shared package:
 * the error still carries `field`, which is the part that matters, and every
 * Lumi9 route renders the sentence from here instead of forwarding `err.message`.
 *
 * Anything that surfaces a core error to a Lumi9 shopper should check for this
 * class first. Forwarding the raw message is how the other brand's name ends up
 * in this storefront's UI.
 */
export function identityConflictMessage(field: IdentityField): string {
  return field === "email"
    ? "That email is already on another Lumi9 account. Sign in with it instead."
    : "That mobile number is already on another Lumi9 account. Sign in with it instead.";
}
