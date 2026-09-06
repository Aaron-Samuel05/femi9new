'use client'
import { useParams } from 'next/navigation'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ModerationStatus } from '@prisma/client'
import { IStar } from '@/components/AppIcons'
// Type-only import: erased at compile time, so this client bundle never pulls in
// the `server-only` reviews service at runtime.
import type { ReviewRow } from '@femi9/core/services/admin/reviews'

/**
 * Reviews — the moderation queue.
 *
 * A client component (not a server component reading the service directly)
 * because the whole surface is interactive: moderators filter by status and
 * approve / hide / delete rows inline, and each action must update the affected
 * row in place without a full page reload. It loads from GET /<brand>/api/reviews
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
  const { brand } = useParams<{ brand: string }>()
  const [filter, setFilter] = useState<Filter>(undefined)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async (f: Filter) => {
    setLoading(true)
    setLoadError(false)
    try {
      const url = `/${brand}/api/reviews` + (f ? `?status=${f}` : '')
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
        const res = await fetch(`/${brand}/api/reviews/${row.id}`, {
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
        const res = await fetch(`/${brand}/api/reviews/${row.id}`, { method: 'DELETE' })
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => setCreateOpen(true)}
          >
            + New review
          </button>
        </div>
      </div>

      {createOpen && (
        <CreateReviewModal
          brand={brand}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false)
            await load(filter)
          }}
        />
      )}

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
                      {/* Media strip: a moderator approves the WHOLE row, so
                          the images and videos have to be visible here. Click
                          opens the raw asset in a new tab (no lightbox on the
                          console — deliberately kept minimal). */}
                      {r.media.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {r.media.map((m) => (
                            <a
                              key={m.url}
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={m.kind === 'video' ? 'Play video (new tab)' : 'Open photo (new tab)'}
                              style={{
                                display: 'inline-block',
                                width: 44,
                                height: 44,
                                borderRadius: 6,
                                overflow: 'hidden',
                                border: '1px solid var(--line)',
                                position: 'relative',
                              }}
                            >
                              {m.kind === 'image' ? (
                                <img
                                  src={m.url}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                <>
                                  <video
                                    src={m.url}
                                    muted
                                    preload="metadata"
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                  <span
                                    style={{
                                      position: 'absolute',
                                      inset: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: 'white',
                                      background: 'rgba(0,0,0,0.35)',
                                      fontSize: 14,
                                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                                    }}
                                  >
                                    ▶
                                  </span>
                                </>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
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

// ─────────────────────────────── New review modal ─────────────────────────

type ProductPickerRow = { id: string; slug: string; name: string }

/**
 * "New review" — admin-authored, straight to approved, verified badge on.
 *
 * The product picker is fed by GET /<brand>/api/products (same list the
 * catalogue table renders). Kept lightweight: the modal only needs id + slug
 * + name off each row, and the API returns those alongside the fuller record.
 */
function CreateReviewModal({
  brand,
  onClose,
  onCreated,
}: {
  brand: string
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [products, setProducts] = useState<ProductPickerRow[]>([])
  const [productSlug, setProductSlug] = useState('')
  const [name, setName] = useState('')
  const [place, setPlace] = useState('')
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/${brand}/api/products`, { cache: 'no-store' })
        const rows = await res.json().catch(() => [])
        if (cancelled) return
        const shaped: ProductPickerRow[] = Array.isArray(rows)
          ? rows.map((r: { id: string; slug: string; name: string }) => ({
              id: r.id,
              slug: r.slug,
              name: r.name,
            }))
          : []
        setProducts(shaped)
        if (shaped[0]) setProductSlug(shaped[0].slug)
      } catch {
        setErr('Could not load products.')
      } finally {
        if (!cancelled) setLoadingProducts(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [brand])

  const canSubmit = useMemo(
    () => Boolean(productSlug && name.trim() && body.trim() && rating >= 1 && rating <= 5),
    [productSlug, name, body, rating],
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/${brand}/api/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          productSlug,
          name: name.trim(),
          place: place.trim() || undefined,
          rating,
          title: title.trim() || undefined,
          body: body.trim(),
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr((payload as { error?: string }).error || 'Could not create review.')
        return
      }
      await onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 22, 48, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '24px 28px',
          width: '100%',
          maxWidth: 560,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(30,22,48,0.3)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontWeight: 500,
            fontSize: 22,
            margin: '0 0 4px',
          }}
        >
          New review
        </h2>
        <p className="adm-help" style={{ marginBottom: 16 }}>
          Publishes immediately as approved, with the verified-buyer badge.
        </p>
        <form onSubmit={submit}>
          <label className="adm-field">
            <span className="adm-label">Product</span>
            <select
              className="adm-select"
              value={productSlug}
              onChange={(e) => setProductSlug(e.target.value)}
              disabled={busy || loadingProducts}
              required
            >
              {loadingProducts && <option>Loading…</option>}
              {!loadingProducts &&
                products.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="adm-field">
              <span className="adm-label">Reviewer name</span>
              <input
                className="adm-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                disabled={busy}
              />
            </label>
            <label className="adm-field">
              <span className="adm-label">Place (optional)</span>
              <input
                className="adm-input"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Chennai, TN"
                maxLength={80}
                disabled={busy}
              />
            </label>
          </div>

          <div className="adm-field">
            <span className="adm-label">Rating</span>
            <div style={{ display: 'inline-flex', gap: 6, marginTop: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  disabled={busy}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`}
                  aria-pressed={rating === n}
                  style={{
                    padding: 6,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: n <= rating ? 'var(--gold, #D9A400)' : 'var(--line, #E4DBEE)',
                  }}
                >
                  <IStar style={{ width: 26, height: 26 }} />
                </button>
              ))}
              <span style={{ marginLeft: 6, alignSelf: 'center', color: 'var(--muted)', fontSize: 13 }}>
                {rating} / 5
              </span>
            </div>
          </div>

          <label className="adm-field">
            <span className="adm-label">Title (optional)</span>
            <input
              className="adm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Loved this combo"
              maxLength={120}
              disabled={busy}
            />
          </label>

          <label className="adm-field">
            <span className="adm-label">Review</span>
            <textarea
              className="adm-input"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={2000}
              disabled={busy}
              placeholder="What made this product work for the customer?"
            />
          </label>

          {err && (
            <div className="adm-auth-error" style={{ marginBottom: 8 }}>
              <span className="adm-error">{err}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              type="button"
              className="adm-btn adm-btn--ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="adm-btn adm-btn--primary"
              disabled={busy || !canSubmit || loadingProducts}
            >
              {busy ? 'Publishing…' : 'Publish review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
