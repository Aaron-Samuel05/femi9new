'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * The star in the products table: put this product on the landing page's
 * featured rail, or take it off.
 *
 * One click, from the list — which is the whole point. Featuring is a decision
 * about the SET ("these five lead the homepage"), and the set is only visible on
 * this screen; making it a checkbox buried in the product editor would mean
 * opening five pages to arrange one row of cards.
 *
 * It talks to /<brand>/api/products/[id]/featured, which owns the cap. This
 * component's `disabled` is a courtesy — it stops the obvious mistake without
 * pretending to be the enforcement, and the API's message is rendered when the
 * count it was given has gone stale under another admin's edit.
 */
export function FeatureToggle({
  productId,
  featured,
  full,
  publishable,
  limit,
}: {
  productId: string
  featured: boolean
  /** Every slot is taken by some OTHER product. */
  full: boolean
  /** The product is `active`. A draft has no page to send a shopper to. */
  publishable: boolean
  limit: number
}) {
  const { brand } = useParams<{ brand: string }>()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const blocked = !featured && (full || !publishable)
  const hint = !publishable
    ? 'Only an active product can be featured'
    : full
      ? `The landing page has ${limit} slots and they are all taken`
      : featured
        ? 'Remove from the landing page'
        : 'Show on the landing page'

  async function toggle() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/products/${productId}/featured`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featured: !featured }),
      })
      if (res.ok) {
        // Server component: re-read so this row, the other rows' disabled state
        // and the "n of 5" counter in the toolbar all move together.
        router.refresh()
        return
      }
      const body = await res.json().catch(() => ({}))
      setError(body?.error || 'Could not update the landing page.')
    } catch {
      setError('Network error - please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`adm-btn adm-btn--sm ${featured ? 'adm-btn--secondary' : 'adm-btn--ghost'}`}
        onClick={toggle}
        disabled={busy || blocked}
        title={hint}
        aria-pressed={featured}
        aria-label={`${featured ? 'Remove' : 'Feature'} on the landing page`}
        style={featured ? { color: 'var(--plum)', borderColor: 'var(--plum2)' } : undefined}
      >
        <span aria-hidden>{featured ? '★' : '☆'}</span>
        {featured ? 'Featured' : 'Feature'}
      </button>
      {error && (
        <span className="adm-error" style={{ display: 'block', marginTop: 4, maxWidth: 200 }}>
          {error}
        </span>
      )}
    </>
  )
}
