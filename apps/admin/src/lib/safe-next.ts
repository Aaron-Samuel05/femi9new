import { isBrand, type Brand } from '@femi9/db'

/**
 * Validate a `next` destination before redirecting to it.
 *
 * Anything user-supplied that ends up in a Location header is an open-redirect
 * risk. This accepts only a same-origin path INSIDE the brand the user actually
 * signed into — so a crafted `?next=` can neither leave the site nor walk into
 * the other brand's console.
 */
export function safeNext(next: string | null | undefined, brand: Brand): string {
  const fallback = `/${brand}`
  if (!next) return fallback
  // Reject anything that is not a plain absolute path: protocol-relative
  // (`//evil.com`), absolute URLs, and backslash tricks all fail here.
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback
  const [, first] = next.split('/')
  if (!isBrand(first) || first !== brand) return fallback
  return next
}
