'use client'

import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'

/**
 * Adjust a customer's Bloom points balance.
 *
 * `adjustCustomerPoints` and its PATCH route already existed with no way to
 * reach them from the console, so support had no way to make a goodwill credit
 * or reverse a mistaken award without a psql session.
 *
 * The API takes a signed DELTA (never an absolute balance) and requires a
 * reason, because every adjustment lands in PointsLedger as an auditable row.
 * Both constraints are mirrored here so an invalid combination cannot be sent.
 */
export function AdjustPoints({ customerId, balance }: { customerId: string; balance: number }) {
  const { brand } = useParams<{ brand: string }>()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed = Number(delta)
  // Guard the exact shape the zod schema enforces: a non-zero integer in range.
  const valid =
    delta.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed !== 0 &&
    Math.abs(parsed) <= 100000 &&
    reason.trim().length >= 3

  function reset() {
    setOpen(false)
    setDelta('')
    setReason('')
    setError(null)
  }

  async function submit() {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'adjust-points', delta: parsed, reason: reason.trim() }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not adjust the balance.')
        return
      }
      reset()
      // The balance and the ledger both live in the server component above.
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" onClick={() => setOpen(true)}>
        Adjust points
      </button>
    )
  }

  return (
    <div className="adm-row">
      <label className="adm-field">
        <span className="adm-label">Change</span>
        <input
          className="adm-input"
          inputMode="numeric"
          autoFocus
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="e.g. 250 or -100"
          aria-label="Points to add or remove"
        />
      </label>
      <label className="adm-field">
        <span className="adm-label">Reason</span>
        <input
          className="adm-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Goodwill credit for late delivery"
          maxLength={160}
          aria-label="Reason for the adjustment"
        />
      </label>
      <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" disabled={!valid || busy} onClick={() => void submit()}>
        {busy ? 'Saving…' : 'Apply'}
      </button>
      <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={reset} disabled={busy}>
        Cancel
      </button>
      {valid && (
        <p className="adm-help">
          New balance: {(balance + parsed).toLocaleString('en-IN')}
        </p>
      )}
      {error && (
        <p className="adm-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
