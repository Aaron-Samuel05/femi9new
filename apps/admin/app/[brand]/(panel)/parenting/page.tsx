'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
// Type-only imports: erased at compile time, so this client bundle never pulls
// in the `server-only` parenting service at runtime.
import type { DoseRow, LeadRow } from '@femi9/core/services/admin/parenting'

/**
 * Parenting tools — Lumi9's vaccination schedule and its care-plan leads.
 *
 * Both halves of this page used to be unreachable from any console.
 *
 * The SCHEDULE was a TypeScript array in the storefront bundle. Correcting a
 * dose age — on a page that tells parents when to take a baby to a clinic —
 * meant a code change, a review and a deploy, and the IAP track was an empty tab
 * the UI had to hide because there was no way to fill it.
 *
 * The LEADS did not exist at all. `/api/parenting/care-plan` sent its email and
 * kept nothing, so the one piece of first-party data this surface collects
 * reached the outbox and no further: no list to follow up, and no way to tell
 * whether the feature was used once or ten thousand times.
 *
 * A client component because the schedule is edited inline — a dose is corrected
 * one field at a time and the row has to settle in place rather than reloading
 * the page under a moderator mid-edit.
 */

type Tab = 'schedule' | 'leads'

type Stats = { doses: number; activeDoses: number; leads: number; babies: number; families: number }

const AGE_UNITS = ['weeks', 'months', 'years'] as const

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

/** "6 weeks" · "9 months" — the way the published table states it. */
const fmtAge = (unit: string, value: number) =>
  value === 0 && unit === 'weeks' ? 'At birth' : `${value} ${value === 1 ? unit.slice(0, -1) : unit}`

export default function ParentingPage() {
  const { brand } = useParams<{ brand: string }>()
  const [tab, setTab] = useState<Tab>('schedule')

  const [doses, setDoses] = useState<DoseRow[]>([])
  const [leads, setLeads] = useState<LeadRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      // Both halves together. The stat row sits above the same tables, so two
      // independent loads would be two chances for the numbers and the lists to
      // disagree on screen.
      const [dosesRes, leadsRes] = await Promise.all([
        fetch(`/${brand}/api/parenting/doses`, { cache: 'no-store' }),
        fetch(`/${brand}/api/parenting/leads`, { cache: 'no-store' }),
      ])
      if (!dosesRes.ok || !leadsRes.ok) throw new Error()
      const d = (await dosesRes.json()) as { doses: DoseRow[] }
      const l = (await leadsRes.json()) as { leads: LeadRow[]; stats: Stats }
      setDoses(d.doses)
      setLeads(l.leads)
      setStats(l.stats)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [brand])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  const patch = useCallback(
    async (row: DoseRow, body: Partial<DoseRow>) => {
      setPending((prev) => new Set(prev).add(row.id))
      try {
        const res = await fetch(`/${brand}/api/parenting/doses/${row.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error as string | undefined
          throw new Error(msg || 'Update failed')
        }
        const { dose } = (await res.json()) as { dose: DoseRow }
        setDoses((rs) => rs.map((r) => (r.id === dose.id ? dose : r)))
        setStats((s) =>
          s === null
            ? s
            : {
                ...s,
                activeDoses: s.activeDoses + (dose.active === row.active ? 0 : dose.active ? 1 : -1),
              },
        )
      } catch (err) {
        setToast(
          `Couldn't update ${row.vaccine} ${row.dose} - ${err instanceof Error ? err.message : 'try again'}`,
        )
      } finally {
        setPending((prev) => {
          const next = new Set(prev)
          next.delete(row.id)
          return next
        })
      }
    },
    [brand],
  )

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Parenting tools
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            The vaccination schedule the storefront publishes, and the parents who asked for a care
            plan.
          </p>
        </div>
        <div className="adm-chip-group">
          {(
            [
              { label: 'Schedule', value: 'schedule' as const },
              { label: 'Care-plan leads', value: 'leads' as const },
            ]
          ).map((c) => {
            const active = c.value === tab
            return (
              <button
                key={c.value}
                type="button"
                className="adm-chip"
                aria-pressed={active}
                onClick={() => setTab(c.value)}
                style={
                  active
                    ? {
                        borderColor: 'var(--plum)',
                        background: 'var(--plum-tint)',
                        color: 'var(--plum)',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }
                    : { cursor: 'pointer' }
                }
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </div>

      {stats && (
        <div className="adm-grid" style={{ marginBottom: 18 }}>
          <Stat label="Doses published" value={`${stats.activeDoses} of ${stats.doses}`} />
          <Stat label="Children on accounts" value={String(stats.babies)} />
          <Stat label="Families" value={String(stats.families)} />
          <Stat label="Care plans requested" value={String(stats.leads)} />
        </div>
      )}

      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading…</div>
        </div>
      ) : loadError ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load the parenting tools</div>
          <p>The schedule and lead list failed to load.</p>
          <button
            type="button"
            className="adm-btn adm-btn--primary adm-btn--sm"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      ) : tab === 'schedule' ? (
        <ScheduleTable doses={doses} pending={pending} onPatch={patch} />
      ) : (
        <LeadsTable leads={leads} />
      )}

      {toast && (
        <div className="adm-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-stat">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
    </div>
  )
}

/**
 * The schedule.
 *
 * Editing is inline and per field, because that is how a correction actually
 * arrives: a revised table changes one dose's age, not a whole row. Each control
 * PATCHes on change and the row settles where it is.
 *
 * There is no Delete. Removing a dose cascades to `BabyVaccination` and would
 * erase a parent's record that their child had it — a vaccine withdrawn from the
 * published schedule is still one that was given. "Published" off is what
 * "remove it from the list" means here: it disappears from every parent's
 * schedule and the history survives.
 */
function ScheduleTable({
  doses,
  pending,
  onPatch,
}: {
  doses: DoseRow[]
  pending: Set<string>
  onPatch: (row: DoseRow, body: Partial<DoseRow>) => Promise<void>
}) {
  if (doses.length === 0) {
    return (
      <div className="adm-empty">
        <div className="adm-empty-title">No schedule yet</div>
        <p>
          Import the published schedule with <code>npm run db:seed-vaccines</code> in{' '}
          <code>apps/lumi9-web</code>, then correct it here. Until then the storefront tells parents
          the list is still being verified rather than showing an empty one.
        </p>
      </div>
    )
  }

  return (
    <div className="adm-table-wrap">
      <table className="adm-table adm-table--stack">
        <thead>
          <tr>
            <th>Vaccine</th>
            <th>Dose</th>
            <th style={{ minWidth: 170 }}>Due at</th>
            <th>Tracks</th>
            <th style={{ minWidth: 200 }}>Note</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {doses.map((d) => {
            const busy = pending.has(d.id)
            return (
              <tr key={d.id} aria-busy={busy} style={d.active ? undefined : { opacity: 0.55 }}>
                <td data-label="Vaccine" style={{ fontWeight: 600 }}>
                  {d.vaccine}
                  {/* The stable key, shown because it is what a parent's record
                      points at and what the seed matches on — the one field a
                      moderator must be able to read and must not be able to
                      change. */}
                  <div className="adm-cell-muted" style={{ fontSize: 12 }}>
                    {d.code}
                  </div>
                </td>
                <td data-label="Dose">{d.dose}</td>
                <td data-label="Due at">
                  <span className="adm-btn-cluster">
                    <input
                      type="number"
                      className="adm-input"
                      style={{ width: 72 }}
                      min={0}
                      max={100}
                      defaultValue={d.ageValue}
                      disabled={busy}
                      aria-label={`${d.vaccine} ${d.dose} age value`}
                      // On blur, not on change: a number input fires per
                      // keystroke, so "14" would PATCH a dose to 1 week before
                      // reaching 14.
                      onBlur={(e) => {
                        const value = Number(e.target.value)
                        if (!Number.isFinite(value) || value === d.ageValue) return
                        void onPatch(d, { ageValue: value })
                      }}
                    />
                    <select
                      className="adm-select"
                      style={{ width: 100 }}
                      value={d.ageUnit}
                      disabled={busy}
                      aria-label={`${d.vaccine} ${d.dose} age unit`}
                      onChange={(e) =>
                        void onPatch(d, { ageUnit: e.target.value as DoseRow['ageUnit'] })
                      }
                    >
                      {AGE_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </span>
                  <div className="adm-cell-muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {fmtAge(d.ageUnit, d.ageValue)} after birth
                  </div>
                </td>
                <td data-label="Tracks">
                  {/* A dose on NEITHER track is a row no parent can ever see, so
                      the last one cannot be unticked — the API refuses it too. */}
                  <span className="adm-btn-cluster">
                    {(['UIP', 'IAP'] as const).map((t) => {
                      const on = d.tracks.includes(t)
                      const last = on && d.tracks.length === 1
                      return (
                        <label
                          key={t}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}
                          title={last ? 'A dose must stay on at least one schedule.' : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={busy || last}
                            onChange={(e) =>
                              void onPatch(d, {
                                tracks: e.target.checked
                                  ? [...d.tracks, t]
                                  : d.tracks.filter((x) => x !== t),
                              })
                            }
                          />
                          {t}
                        </label>
                      )
                    })}
                  </span>
                </td>
                <td data-label="Note" style={{ color: 'var(--muted)' }}>
                  <input
                    type="text"
                    className="adm-input"
                    defaultValue={d.note ?? ''}
                    disabled={busy}
                    placeholder="e.g. Given between 9 and 11 months"
                    aria-label={`${d.vaccine} ${d.dose} note`}
                    onBlur={(e) => {
                      const value = e.target.value.trim()
                      if (value === (d.note ?? '')) return
                      void onPatch(d, { note: value || null })
                    }}
                  />
                </td>
                <td data-label="Published">
                  <button
                    type="button"
                    className={`adm-btn adm-btn--sm ${d.active ? 'adm-btn--secondary' : 'adm-btn--primary'}`}
                    disabled={busy}
                    onClick={() => void onPatch(d, { active: !d.active })}
                  >
                    {d.active ? 'Unpublish' : 'Publish'}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Care-plan leads.
 *
 * Read-only, deliberately. These addresses exist because a parent asked us to
 * send them one thing; nothing here creates, edits or re-sends them, and a
 * "resend" button would be a message they did not ask for.
 */
function LeadsTable({ leads }: { leads: LeadRow[] }) {
  if (leads.length === 0) {
    return (
      <div className="adm-empty">
        <div className="adm-empty-title">No care plans requested yet</div>
        <p>
          A parent who adds their email on <code>/parenting-tools</code> appears here, with the baby
          details they gave.
        </p>
      </div>
    )
  }

  return (
    <div className="adm-table-wrap">
      <table className="adm-table adm-table--stack">
        <thead>
          <tr>
            <th>Email</th>
            <th>Baby</th>
            <th>Born</th>
            <th>Account</th>
            <th>From</th>
            <th className="adm-td-num">Plans</th>
            <th className="adm-td-num">Last sent</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td data-label="Email" style={{ fontWeight: 600 }}>
                {l.email}
              </td>
              <td data-label="Baby">
                {l.babyName || <span className="adm-cell-muted">—</span>}
                {(l.sex || l.bloodGroup) && (
                  <div className="adm-cell-muted" style={{ fontSize: 12 }}>
                    {[l.sex === 'female' ? 'Girl' : l.sex === 'male' ? 'Boy' : null, l.bloodGroup]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </td>
              <td data-label="Born" className="adm-cell-muted">
                {l.dob ?? '—'}
              </td>
              <td data-label="Account">
                {/* Whether they were signed in when they asked. The difference
                    between a shopper and a stranger, and the only thing on this
                    row that says which. */}
                <span className={`adm-badge ${l.registered ? 'adm-badge--green' : 'adm-badge--gray'}`}>
                  {l.registered ? 'Registered' : 'Guest'}
                </span>
              </td>
              <td data-label="From" className="adm-cell-muted" style={{ fontSize: 12 }}>
                {l.source ?? '—'}
              </td>
              <td data-label="Plans" className="adm-td-num">
                {l.planCount}
              </td>
              <td data-label="Last sent" className="adm-td-num adm-cell-muted">
                {fmtDate(l.lastSentAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
