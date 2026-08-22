'use client'

import { useCallback, useEffect, useState } from 'react'
// Type-only import: erased at compile time, so this client bundle never pulls in
// the `server-only` settings service at runtime.
import type { Settings } from '@/lib/services/settings'

/**
 * Settings editor — the "customizable backend". A client component because the
 * whole surface is interactive: it loads current values from GET
 * /api/admin/settings on mount, edits them locally, then PATCHes on Save and
 * confirms with a toast. Numeric fields are held as strings so a box can be
 * transiently empty while typing; they're coerced when the payload is built.
 */

// Field definitions drive the form so labels/help stay in one place. `numeric`
// marks the ₹/%/points inputs (kept as string state, coerced on save).
interface FieldDef {
  key: keyof Settings
  label: string
  help: string
  numeric: boolean
  placeholder: string
}

const FIELDS: FieldDef[] = [
  {
    key: 'freeShipThreshold',
    label: 'Free shipping threshold (₹)',
    help: 'Orders at or above this cart value ship free.',
    numeric: true,
    placeholder: '999',
  },
  {
    key: 'subscribeSavePct',
    label: 'Subscription discount (%)',
    help: 'Percentage off for Subscribe & Save orders. 0–100.',
    numeric: true,
    placeholder: '15',
  },
  {
    key: 'whatsappNumber',
    label: 'WhatsApp number',
    help: 'Support / ordering number - digits only, with country code (e.g. 919042916499).',
    numeric: false,
    placeholder: '919042916499',
  },
  {
    key: 'pointsPerRupee',
    label: 'Loyalty points per ₹',
    help: 'Reward points a customer earns for every rupee spent.',
    numeric: true,
    placeholder: '1',
  },
  {
    key: 'firstOrderBonusPoints',
    label: 'First-order bonus points',
    help: "One-time points granted on a customer's first order.",
    numeric: true,
    placeholder: '100',
  },
]

type FormState = Record<keyof Settings, string>
type FieldErrors = Partial<Record<keyof Settings, string>>

function toFormState(s: Settings): FormState {
  return {
    freeShipThreshold: String(s.freeShipThreshold),
    subscribeSavePct: String(s.subscribeSavePct),
    whatsappNumber: s.whatsappNumber,
    pointsPerRupee: String(s.pointsPerRupee),
    firstOrderBonusPoints: String(s.firstOrderBonusPoints),
  }
}

export default function SettingsPage() {
  const [values, setValues] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as Settings
      setValues(toFormState(data))
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  function update(key: keyof Settings, value: string) {
    setValues((v) => (v ? { ...v, [key]: value } : v))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values) return
    setSaving(true)
    setErrors({})
    setFormError(null)

    // Build the payload: numerics as Number (empty → 0), the rest trimmed strings.
    const payload: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const raw = values[f.key]
      payload[f.key] = f.numeric ? (raw.trim() === '' ? 0 : Number(raw)) : raw.trim()
    }

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        // Reconcile with the server's canonical (defaulted) values.
        const data = (await res.json()) as Settings
        setValues(toFormState(data))
        setToast('Settings saved')
        return
      }

      const body = await res.json().catch(() => ({}))
      // zod's flatten() → { formErrors, fieldErrors }; surface the first of each.
      const fieldErrors = (body?.details?.fieldErrors ?? {}) as Record<string, string[]>
      const mapped: FieldErrors = {}
      for (const f of FIELDS) {
        const msg = fieldErrors[f.key]?.[0]
        if (msg) mapped[f.key] = msg
      }
      setErrors(mapped)
      setFormError(body?.details?.formErrors?.[0] || body?.error || 'Could not save. Please try again.')
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="adm-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600, margin: 0 }}>
            Settings
          </h2>
          <p className="adm-help" style={{ margin: '2px 0 0' }}>
            Business rules that power the storefront - shipping, subscriptions, loyalty and support.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading settings…</div>
        </div>
      ) : loadError || !values ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load settings</div>
          <p>The settings failed to load.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          {formError && (
            <div className="adm-card" style={{ borderColor: 'var(--red)', marginBottom: 16 }} role="alert">
              <span className="adm-error">{formError}</span>
            </div>
          )}

          <section className="adm-card" style={{ maxWidth: 560 }}>
            {FIELDS.map((f, i) => (
              <div
                className="adm-field"
                key={f.key}
                style={i === FIELDS.length - 1 ? { marginBottom: 0 } : undefined}
              >
                <label className="adm-label" htmlFor={`s-${f.key}`}>
                  {f.label}
                </label>
                <input
                  id={`s-${f.key}`}
                  className="adm-input"
                  inputMode={f.numeric ? 'numeric' : 'text'}
                  value={values[f.key]}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                />
                <span className="adm-help">{f.help}</span>
                {errors[f.key] && <span className="adm-error">{errors[f.key]}</span>}
              </div>
            ))}
          </section>

          <div className="adm-toolbar" style={{ marginTop: 20, marginBottom: 0, justifyContent: 'flex-start' }}>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button
              type="button"
              className="adm-btn adm-btn--secondary"
              onClick={load}
              disabled={saving}
            >
              Reset
            </button>
          </div>
        </form>
      )}

      {toast && (
        <div className="adm-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  )
}
