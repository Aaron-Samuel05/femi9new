'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ModerationStatus } from '@prisma/client'
import { IStar } from '@/components/AppIcons'
// Type-only import: erased at compile time, so this client bundle never pulls in
// the `server-only` reviews service at runtime.
import type { ReviewRow } from '@/lib/services/admin/reviews'

/**
 * Reviews — the moderation queue.
 *
 * A client component (not a server component reading the service directly)
 * because the whole surface is interactive: moderators filter by status and
 * approve / hide / delete rows inline, and each action must update the affected
 * row in place without a full page reload. It loads from GET /api/admin/reviews
 * and PATCHes/DELETEs individual reviews.
 */

// undefined => the "All" chip (no ?status filter).
type Filter = ModerationStatus | undefined

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Hidden', value: 'hidden' },
]

const STATUS_BADGE: Record<ModerationStatus, string> = {
  pending: 'adm-badge--amber',
  approved: 'adm-badge--green',
  hidden: 'adm-badge--gray',
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

// Trim the body for the table; the full text is exposed via the cell's title.
const EXCERPT_LEN = 140
const excerpt = (body: string) =>
  body.length > EXCERPT_LEN ? body.slice(0, EXCERPT_LEN).trimEnd() + '…' : body

/** Five stars, filled up to `rating` (clamped 0–5). Gold for legibility. */
function Stars({ rating }: { rating: number }) {
  const n = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <span
      aria-label={`${n} out of 5 stars`}
      title={`${n} / 5`}
      style={{ display: 'inline-flex', gap: 2, color: 'var(--gold)', whiteSpace: 'nowrap' }}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <IStar key={i} aria-hidden="true" style={{ width: 14, height: 14, color: i < n ? 'var(--gold)' : 'var(--line)' }} />
      ))}
    </span>
  )
}

export default function ReviewsPage() {
  const [filter, setFilter] = useState<Filter>(undefined)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async (f: Filter) => {
    setLoading(true)
    setLoadError(false)
    try {
      const url = '/api/admin/reviews' + (f ? `?status=${f}` : '')
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setRows((await res.json()) as ReviewRow[])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reload whenever the active filter changes (and on mount).
  useEffect(() => {
    load(filter)
  }, [filter, load])

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  const setPendingFor = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  /** PATCH a review's status, then reconcile the row (or drop it if it no longer
   * matches the active filter — e.g. approving a row while viewing "Pending"). */
  const moderate = useCallback(
    async (row: ReviewRow, status: ModerationStatus) => {
      setPendingFor(row.id, true)
      try {
        const res = await fetch(`/api/admin/reviews/${row.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error as string | undefined
          throw new Error(msg || 'Update failed')
        }
        const { row: updated } = (await res.json()) as { row: ReviewRow }
        setRows((rs) =>
          filter && updated.status !== filter
            ? rs.filter((r) => r.id !== updated.id)
            : rs.map((r) => (r.id === updated.id ? updated : r)),
        )
      } catch (err) {
        setToast(
          `Couldn't update ${row.name}'s review - ${err instanceof Error ? err.message : 'try again'}`,
        )
      } finally {
        setPendingFor(row.id, false)
      }
    },
    [filter, setPendingFor],
  )

  /** DELETE a review after confirmation, removing it from the list on success. */
  const remove = useCallback(
    async (row: ReviewRow) => {
      if (!window.confirm(`Delete ${row.name}'s review permanently? This can't be undone.`)) return
      setPendingFor(row.id, true)
      try {
        const res = await fetch(`/api/admin/reviews/${row.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error as string | undefined
          throw new Error(msg || 'Delete failed')
        }
        setRows((rs) => rs.filter((r) => r.id !== row.id))
      } catch (err) {
        setToast(
          `Couldn't delete ${row.name}'s review - ${err instanceof Error ? err.message : 'try again'}`,
        )
      } finally {
        setPendingFor(row.id, false)
      }
    },
    [setPendingFor],
  )

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
            Reviews
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            Moderate customer reviews - approve, hide, or delete.
          </p>
        </div>
        {/* Status filter chips (client buttons — the list refetches per filter). */}
        <div className="adm-chip-group">
          {FILTERS.map((c) => {
            const active = c.value === filter
            return (
              <button
                key={c.label}
                type="button"
                className="adm-chip"
                aria-pressed={active}
                onClick={() => setFilter(c.value)}
                style={
                  active
                    ? { borderColor: 'var(--plum)', background: 'var(--plum-tint)', color: 'var(--plum)', fontWeight: 600, cursor: 'pointer' }
                    : { cursor: 'pointer' }
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading reviews…</div>
        </div>
      ) : loadError ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load reviews</div>
          <p>The review list failed to load.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => load(filter)}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-title">No reviews {filter ? `(${filter})` : 'yet'}</div>
          <p>{filter ? 'Try a different status filter.' : 'Customer reviews will appear here for moderation.'}</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          {/* --stack: below 900px each row becomes a labelled block so the
              moderation buttons in the last column stay on screen. */}
          <table className="adm-table adm-table--stack">
            <thead>
              <tr>
                <th>Product</th>
                <th>Reviewer</th>
                <th>Rating</th>
                <th style={{ minWidth: 260 }}>Review</th>
                <th>Status</th>
                <th className="adm-td-num">Date</th>
                <th style={{ width: 1 }}>{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = pending.has(r.id)
                return (
                  <tr key={r.id} aria-busy={busy}>
                    <td data-label="Product" style={{ fontWeight: 600 }}>{r.productName}</td>
                    <td data-label="Reviewer">
                      {r.name}
                      {r.place && (
                        <div className="adm-cell-muted" style={{ fontSize: 12 }}>
                          {r.place}
                        </div>
                      )}
                    </td>
                    <td data-label="Rating">
                      <Stars rating={r.rating} />
                    </td>
                    <td data-label="Review" style={{ maxWidth: 380, color: 'var(--muted)' }} title={r.body}>
                      {/* The headline publishes above the body on the product
                          page, so it is shown here too — approving a review
                          means approving its title. */}
                      {r.title && (
                        <b style={{ display: 'block', color: 'var(--ink)', marginBottom: 2 }}>{r.title}</b>
                      )}
                      {excerpt(r.body)}
                    </td>
                    <td data-label="Status">
                      <span className={`adm-badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                    </td>
                    <td data-label="Date" className="adm-td-num adm-cell-muted">{fmtDate(r.createdAt)}</td>
                    <td>
                      <span className="adm-btn-cluster" style={{ justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="adm-btn adm-btn--secondary adm-btn--sm"
                          onClick={() => moderate(r, 'approved')}
                          disabled={busy || r.status === 'approved'}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn--secondary adm-btn--sm"
                          onClick={() => moderate(r, 'hidden')}
                          disabled={busy || r.status === 'hidden'}
                        >
                          Hide
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn--danger adm-btn--sm"
                          onClick={() => remove(r)}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="adm-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  )
}
