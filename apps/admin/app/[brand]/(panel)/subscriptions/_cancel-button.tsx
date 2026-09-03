'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

/**
 * Stop a subscription from the console.
 *
 * Only rendered for a status in `ADMIN_CANCELLABLE_STATUSES` — the list page
 * decides that server-side, so a plan that is already cancelled, or never
 * authorised (`pending_mandate`, nothing to stop), never shows a button that
 * would be refused. The route enforces the same rule regardless; this is the
 * affordance, not the gate.
 *
 * `confirm()` because there is no undo: cancelling reverses the Razorpay
 * mandate, and re-starting deliveries means the customer creating a whole new
 * plan and authorising a whole new mandate from her side.
 */
export function CancelButton({ id }: { id: string }) {
  const { brand } = useParams<{ brand: string }>()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cancel() {
    if (busy) return
    if (
      !confirm(
        'Cancel this subscription? The mandate is stopped at Razorpay and no further boxes will ship. This cannot be undone from here.',
      )
    ) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/subscriptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (res.ok) {
        // Server component: re-read so this row's badge, and the status
        // filter counts elsewhere on the page, move together.
        router.refresh()
        return
      }
      const body = await res.json().catch(() => ({}))
      setError(body?.error || 'Could not cancel this subscription.')
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
        className="adm-btn adm-btn--sm adm-btn--secondary"
        onClick={cancel}
        disabled={busy}
      >
        {busy ? 'Cancelling…' : 'Cancel'}
      </button>
      {error && (
        <span className="adm-error" style={{ display: 'block', marginTop: 4, maxWidth: 200 }}>
          {error}
        </span>
      )}
    </>
  )
}
