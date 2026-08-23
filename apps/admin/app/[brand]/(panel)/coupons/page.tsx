'use client'
import { useParams } from 'next/navigation'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

/**
 * Coupons — list + create in one surface.
 *
 * This is a client component (not a server component reading the service) because
 * every part is interactive: a create form, per-row active toggles and deletes,
 * all posting to /<brand>/api/coupons. It loads the list on mount and mutates via
 * the API, reconciling with the server's returned rows.
 *
 * Dates arrive as ISO strings over JSON (not Date objects), so the row shape is
 * declared locally with string dates rather than importing Prisma's Coupon type.
 */

interface CouponRow {
  id: string
  code: string
  type: 'flat' | 'pct'
  value: number
  minOrder: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  active: boolean
  createdAt: string
}

const rupees = (n: number): string => '₹' + n.toLocaleString('en-IN')

/** Render a coupon's discount in its own units: rupees off vs. a percentage. */
function formatValue(c: Pick<CouponRow, 'type' | 'value'>): string {
  return c.type === 'pct' ? `${c.value}%` : rupees(c.value)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Expired = has an expiry that's already passed. */
function isExpired(iso: string | null): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now()
}

// ─── Client-side validation (mirrors the server schema for fast field errors) ──
// The API re-validates authoritatively; this is purely for inline UX. Empty
// optional fields normalise to null so a blank box reads as "unset", not 0.
const emptyToNull = (v: unknown) => (v === '' || v == null ? null : v)

const CreateSchema = z
  .object({
    code: z.string().trim().min(1, 'Code is required').max(40, 'Code is too long'),
    type: z.enum(['flat', 'pct']),
    value: z.coerce.number().int('Whole numbers only').min(1, 'Value must be at least 1'),
    minOrder: z.coerce.number().int('Whole numbers only').min(0, 'Can’t be negative'),
    maxUses: z.preprocess(emptyToNull, z.coerce.number().int().min(1, 'Must be at least 1').nullable()),
    expiresAt: z.preprocess(emptyToNull, z.coerce.date({ message: 'Invalid date' }).nullable()),
  })
  .refine((v) => v.type !== 'pct' || v.value <= 100, {
    message: 'A percentage can’t exceed 100',
    path: ['value'],
  })

type FieldErrors = Record<string, string[] | undefined>

const BLANK_FORM = {
  code: '',
  type: 'flat' as 'flat' | 'pct',
  value: '',
  minOrder: '0',
  maxUses: '',
  expiresAt: '',
  active: true,
}

export default function CouponsPage() {
  const { brand } = useParams<{ brand: string }>()
  const [rows, setRows] = useState<CouponRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // Create-form state (string-backed so numeric boxes can be transiently empty).
  const [form, setForm] = useState(BLANK_FORM)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/${brand}/api/coupons`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setRows((await res.json()) as CouponRow[])
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  const setField = (patch: Partial<typeof BLANK_FORM>) => setForm((f) => ({ ...f, ...patch }))

  // ── Create ────────────────────────────────────────────────────────────────
  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setErrors({})

    const parsed = CreateSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as FieldErrors)
      setSaving(false)
      return
    }

    try {
      // Send the raw string form — the server schema uppercases + coerces. Empty
      // maxUses/expiresAt map to null server-side (unlimited / never expires).
      const res = await fetch(`/${brand}/api/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        const created = (await res.json()) as CouponRow
        setRows((rs) => [created, ...rs])
        setForm(BLANK_FORM)
        setToast(`Coupon ${created.code} created`)
        return
      }

      const body = await res.json().catch(() => ({}))
      if (body?.details?.fieldErrors) setErrors(body.details.fieldErrors as FieldErrors)
      setFormError(body?.details?.formErrors?.[0] || body?.error || 'Could not create the coupon.')
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────────
  async function onToggle(row: CouponRow) {
    setPendingFor(row.id, true)
    try {
      const res = await fetch(`/${brand}/api/coupons/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toggle: true }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Update failed')
      const updated = (await res.json()) as CouponRow
      setRows((rs) => rs.map((r) => (r.id === row.id ? updated : r)))
    } catch (err) {
      setToast(`Couldn't update ${row.code} - ${err instanceof Error ? err.message : 'try again'}`)
    } finally {
      setPendingFor(row.id, false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function onDelete(row: CouponRow) {
    if (!confirm(`Delete coupon ${row.code}? This can’t be undone.`)) return
    setPendingFor(row.id, true)
    try {
      const res = await fetch(`/${brand}/api/coupons/${row.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Delete failed')
      setRows((rs) => rs.filter((r) => r.id !== row.id))
      setToast(`Coupon ${row.code} deleted`)
    } catch (err) {
      setToast(`Couldn't delete ${row.code} - ${err instanceof Error ? err.message : 'try again'}`)
    } finally {
      setPendingFor(row.id, false)
    }
  }

  const err = (k: string) => errors[k]?.[0]
  const activeCount = useMemo(() => rows.filter((r) => r.active).length, [rows])

  return (
    <>
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Coupons
          </h2>
          {!loading && !loadError && (
            <>
              <span className="adm-chip">{rows.length} total</span>
              <span className={'adm-badge' + (activeCount ? ' adm-badge--green' : ' adm-badge--gray')}>
                {activeCount} active
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          className="adm-btn adm-btn--secondary adm-btn--sm"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Create form */}
      <section className="adm-card" style={{ marginBottom: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">New coupon</h2>
        </div>

        {formError && (
          <div className="adm-auth-error" role="alert" style={{ marginBottom: 14 }}>
            <span className="adm-error">{formError}</span>
          </div>
        )}

        <form onSubmit={onCreate} noValidate>
          <div className="adm-row">
            <div className="adm-field" style={{ flex: '1 1 160px' }}>
              <label className="adm-label" htmlFor="c-code">Code</label>
              <input
                id="c-code"
                className="adm-input"
                value={form.code}
                // Uppercase as you type — the codes are stored uppercase anyway.
                onChange={(e) => setField({ code: e.target.value.toUpperCase() })}
                placeholder="SAVE10"
                autoCapitalize="characters"
                spellCheck={false}
              />
              {err('code') && <span className="adm-error">{err('code')}</span>}
            </div>

            <div className="adm-field" style={{ flex: '0 1 140px' }}>
              <label className="adm-label" htmlFor="c-type">Type</label>
              <select
                id="c-type"
                className="adm-select"
                value={form.type}
                onChange={(e) => setField({ type: e.target.value as 'flat' | 'pct' })}
              >
                <option value="flat">Flat (₹ off)</option>
                <option value="pct">Percentage (%)</option>
              </select>
            </div>

            <div className="adm-field" style={{ flex: '0 1 130px' }}>
              <label className="adm-label" htmlFor="c-value">
                {form.type === 'pct' ? 'Value (%)' : 'Value (₹)'}
              </label>
              <input
                id="c-value"
                className="adm-input"
                inputMode="numeric"
                value={form.value}
                onChange={(e) => setField({ value: e.target.value })}
                placeholder={form.type === 'pct' ? '10' : '50'}
              />
              {err('value') && <span className="adm-error">{err('value')}</span>}
            </div>

            <div className="adm-field" style={{ flex: '0 1 140px' }}>
              <label className="adm-label" htmlFor="c-min">Min order (₹)</label>
              <input
                id="c-min"
                className="adm-input"
                inputMode="numeric"
                value={form.minOrder}
                onChange={(e) => setField({ minOrder: e.target.value })}
                placeholder="0"
              />
              {err('minOrder') && <span className="adm-error">{err('minOrder')}</span>}
            </div>

            <div className="adm-field" style={{ flex: '0 1 130px' }}>
              <label className="adm-label" htmlFor="c-max">Max uses</label>
              <input
                id="c-max"
                className="adm-input"
                inputMode="numeric"
                value={form.maxUses}
                onChange={(e) => setField({ maxUses: e.target.value })}
                placeholder="Unlimited"
              />
              {err('maxUses') && <span className="adm-error">{err('maxUses')}</span>}
            </div>

            <div className="adm-field" style={{ flex: '0 1 160px' }}>
              <label className="adm-label" htmlFor="c-exp">Expires</label>
              <input
                id="c-exp"
                className="adm-input"
                type="date"
                value={form.expiresAt}
                onChange={(e) => setField({ expiresAt: e.target.value })}
              />
              {err('expiresAt') && <span className="adm-error">{err('expiresAt')}</span>}
            </div>

            <div className="adm-field" style={{ flex: '0 0 auto', alignItems: 'flex-start' }}>
              <label className="adm-label" htmlFor="c-active">Active</label>
              <input
                id="c-active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setField({ active: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: 'var(--plum)', marginTop: 8 }}
              />
            </div>

            <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create coupon'}
            </button>
          </div>
          <p className="adm-help" style={{ margin: '4px 0 0' }}>
            Leave max uses or expiry blank for unlimited / no expiry.
          </p>
        </form>
      </section>

      {/* List */}
      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading coupons…</div>
        </div>
      ) : loadError ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load coupons</div>
          <p>The coupon list failed to load.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No coupons yet</p>
          <p>Create your first coupon with the form above.</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Type</th>
                <th className="adm-td-num">Value</th>
                <th className="adm-td-num">Min order</th>
                <th className="adm-td-num">Uses / Max</th>
                <th>Expiry</th>
                <th>Status</th>
                <th style={{ width: 150 }}>{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const busy = pending.has(c.id)
                const expired = isExpired(c.expiresAt)
                return (
                  <tr key={c.id} style={{ opacity: busy ? 0.6 : 1 }}>
                    <td style={{ fontWeight: 600, letterSpacing: '0.02em' }}>{c.code}</td>
                    <td>
                      <span className="adm-badge adm-badge--plum">
                        {c.type === 'pct' ? 'Percentage' : 'Flat'}
                      </span>
                    </td>
                    <td className="adm-td-num">{formatValue(c)}</td>
                    <td className="adm-td-num">{c.minOrder > 0 ? rupees(c.minOrder) : '-'}</td>
                    <td className="adm-td-num">
                      {c.usedCount} / {c.maxUses ?? '∞'}
                    </td>
                    <td>
                      <span className={expired ? 'adm-error' : undefined}>
                        {formatDate(c.expiresAt)}
                        {expired && ' (expired)'}
                      </span>
                    </td>
                    <td>
                      <span className={'adm-badge ' + (c.active ? 'adm-badge--green' : 'adm-badge--gray')}>
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          className="adm-btn adm-btn--secondary adm-btn--sm"
                          onClick={() => onToggle(c)}
                          disabled={busy}
                        >
                          {c.active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn--danger adm-btn--sm"
                          onClick={() => onDelete(c)}
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
