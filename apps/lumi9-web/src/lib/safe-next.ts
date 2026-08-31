/**
 * Validate a `next` destination before it reaches a Location header - or, in the
 * magic-link case, before it is baked into a URL we email out.
 *
 * Accepts only a same-origin absolute path. Protocol-relative (`//evil.com`),
 * absolute URLs and backslash tricks all fall back, so a crafted `?next=` can
 * never turn sign-in into an open redirect.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/account"): string {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("\\")) return fallback;
  // Never bounce a signed-in shopper straight back into an API route.
  if (next.startsWith("/api")) return fallback;
  return next;
}
