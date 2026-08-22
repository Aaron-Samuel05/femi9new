'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PartnerStatus } from '@prisma/client'
// Type-only import: erased at compile time, so this client bundle never pulls in
// the `server-only` partners service at runtime.
import type { PartnerRow } from '@/lib/services/admin/partners'

/**
 * Partners — the reseller lead CRM.
 *
 * A client component (not a server component reading the service directly)
 * because the surface is interactive: the sales team filters by pipeline stage,
 * advances a lead's status (new → contacted → onboarded / rejected) and edits
 * per-lead notes inline, each mutation reconciling the affected row in place. It
 * loads from GET /api/admin/partners and PATCHes individual leads.
 */

// undefined => the "All" chip (no ?status filter).
type Filter = PartnerStatus | undefined

const FILTERS: { label: string; value: Filter }[] = [
  { label: 'All', value: undefined },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Onboarded', value: 'onboarded' },
  { label: 'Rejected', value: 'rejected' },
]

const STATUS_BADGE: Record<PartnerStatus, string> = {
  new: 'adm-badge--amber',
  contacted: 'adm-badge--plum',
  onboarded: 'adm-badge--green',
  rejected: 'adm-badge--gray',
}

// Pipeline transitions offered per row. `reject` is styled as a danger action;
// the others advance the lead forward. The button matching the current status
// is disabled so the stage is always clear.
const ACTIONS: { label: string; status: PartnerStatus; danger?: boolean }[] = [
  { label: 'Contacted', status: 'contacted' },
  { label: 'Onboarded', status: 'onboarded' },
  { label: 'Reject', status: 'rejected', danger: true },
]

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

// Present the stored 10 digits as a readable +91 mobile number.
const fmtPhone = (p: string) =>
  /^\d{10}$/.test(p) ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p

export default function PartnersPage() {
  const [filter, setFilter] = useState<Filter>(undefined)
  const [rows, setRows] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  // Per-lead notes drafts, keyed by id. Absent => the textarea mirrors row.notes.
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({})

  const load = useCallback(async (f: Filter) => {
    setLoading(true)
    setLoadError(false)
    try {
      const url = '/api/admin/partners' + (f ? `?status=${f}` : '')
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setRows((await res.json()) as PartnerRow[])
      // Drop stale drafts so reloaded rows re-sync to their saved notes.
      setNotesDraft({})
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

  // Auto-dismiss the toast.
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

  /** Reconcile a returned row: drop it if it no longer matches the active filter
   * (e.g. marking a lead contacted while viewing "New"), else update in place. */
  const reconcile = useCallback(
    (updated: PartnerRow) => {
      setRows((rs) =>
        filter && updated.status !== filter
          ? rs.filter((r) => r.id !== updated.id)
          : rs.map((r) => (r.id === updated.id ? updated : r)),
      )
    },
    [filter],
  )

  /** PATCH a lead's pipeline status. */
  const setStatus = useCallback(
    async (row: PartnerRow, status: PartnerStatus) => {
      setPendingFor(row.id, true)
      try {
        const res = await fetch(`/api/admin/partners/${row.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ status }),
        })
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error as string | undefined
          throw new Error(msg || 'Update failed')
        }
        const { row: updated } = (await res.json()) as { row: PartnerRow }
        reconcile(updated)
      } catch (err) {
        setToast(
          `Couldn't update ${row.name} - ${err instanceof Error ? err.message : 'try again'}`,
        )
      } finally {
        setPendingFor(row.id, false)
      }
    },
    [reconcile, setPendingFor],
  )

  /** PATCH a lead's notes (call outcomes etc.). */
  const saveNotes = useCallback(
    async (row: PartnerRow, notes: string) => {
      setPendingFor(row.id, true)
      try {
        const res = await fetch(`/api/admin/partners/${row.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ notes }),
        })
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error as string | undefined
          throw new Error(msg || 'Save failed')
        }
        const { row: updated } = (await res.json()) as { row: PartnerRow }
        // Clear the draft so the textarea re-syncs to the saved value.
        setNotesDraft((d) => {
          const next = { ...d }
          delete next[row.id]
          return next
        })
        reconcile(updated)
        setToast(`Notes saved for ${row.name}`)
      } catch (err) {
        setToast(
          `Couldn't save notes for ${row.name} - ${err instanceof Error ? err.message : 'try again'}`,
        )
      } finally {
        setPendingFor(row.id, false)
      }
    },
    [reconcile, setPendingFor],
  )

  // Draft value for a row's notes box, falling back to the saved value.
  const draftFor = (r: PartnerRow) => notesDraft[r.id] ?? r.notes ?? ''
  const isDirty = (r: PartnerRow) => draftFor(r) !== (r.notes ?? '')

  const counts = useMemo(() => {
    const c = { new: 0, contacted: 0, onboarded: 0, rejected: 0 } as Record<PartnerStatus, number>
    for (const r of rows) c[r.status] += 1
    return c
  }, [rows])

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', margin: 0 }}>
            Partners
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            Reseller lead pipeline - advance each lead from new to onboarded, and keep call notes.
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
          <div className="adm-empty-title">Loading leads…</div>
        </div>
      ) : loadError ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load leads</div>
          <p>The partner lead list failed to load.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={() => load(filter)}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-title">No leads {filter ? `(${filter})` : 'yet'}</div>
          <p>{filter ? 'Try a different status filter.' : 'Partner applications from the storefront will appear here.'}</p>
        </div>
      ) : (
        <>
          {/* Pipeline summary — quick read on where leads sit across stages. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            <span className="adm-chip">{rows.length} shown</span>
            <span className="adm-badge adm-badge--amber">{counts.new} new</span>
            <span className="adm-badge adm-badge--plum">{counts.contacted} contacted</span>
            <span className="adm-badge adm-badge--green">{counts.onboarded} onboarded</span>
            <span className="adm-badge adm-badge--gray">{counts.rejected} rejected</span>
          </div>

          <div className="adm-table-wrap">
            {/* --stack: below 900px each row renders as a labelled block, so the
                notes editor in the last column is not 600px off-screen inside
                the horizontal scroller. */}
            <table className="adm-table adm-table--stack">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Phone</th>
                  <th>City</th>
                  <th>Situation</th>
                  <th>Status</th>
                  <th className="adm-td-num">Applied</th>
                  <th style={{ minWidth: 320 }}>Notes &amp; actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const busy = pending.has(r.id)
                  const dirty = isDirty(r)
                  return (
                    <tr key={r.id} aria-busy={busy}>
                      <td data-label="Applicant" style={{ fontWeight: 600 }}>
                        {r.name}
                        {r.reason && (
                          <div className="adm-cell-muted" style={{ fontSize: 12, fontWeight: 400, maxWidth: 220 }} title={r.reason}>
                            {r.reason.length > 60 ? r.reason.slice(0, 60).trimEnd() + '…' : r.reason}
                          </div>
                        )}
                      </td>
                      <td data-label="Phone" style={{ whiteSpace: 'nowrap' }}>{fmtPhone(r.phone)}</td>
                      <td data-label="City">{r.city || <span className="adm-cell-muted">-</span>}</td>
                      <td data-label="Situation">{r.situation || <span className="adm-cell-muted">-</span>}</td>
                      <td data-label="Status">
                        <span className={`adm-badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
                      </td>
                      <td data-label="Applied" className="adm-td-num adm-cell-muted">{fmtDate(r.createdAt)}</td>
                      <td data-label="Notes & actions">
                        {/* minWidth 0: the <th> already floors this column at 320px
                            on desktop, and a floor here would force the stacked
                            mobile row wider than the phone. */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                          {/* Status controls */}
                          <div className="adm-btn-cluster" style={{ display: 'flex', flexWrap: 'wrap' }}>
                            {ACTIONS.map((a) => (
                              <button
                                key={a.status}
                                type="button"
                                className={`adm-btn adm-btn--sm ${a.danger ? 'adm-btn--danger' : 'adm-btn--secondary'}`}
                                onClick={() => setStatus(r, a.status)}
                                disabled={busy || r.status === a.status}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                          {/* Editable notes */}
                          <textarea
                            className="adm-textarea"
                            style={{ minHeight: 60 }}
                            placeholder="Call notes - who spoke, next step, follow-up date…"
                            value={draftFor(r)}
                            onChange={(e) =>
                              setNotesDraft((d) => ({ ...d, [r.id]: e.target.value }))
                            }
                            disabled={busy}
                          />
                          <div>
                            <button
                              type="button"
                              className="adm-btn adm-btn--primary adm-btn--sm"
                              onClick={() => saveNotes(r, draftFor(r))}
                              disabled={busy || !dirty}
                            >
                              {busy ? 'Saving…' : dirty ? 'Save notes' : 'Saved'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {toast && (
        <div className="adm-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  )
}
