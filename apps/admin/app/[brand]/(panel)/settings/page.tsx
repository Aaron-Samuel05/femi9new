'use client'
import { useParams } from 'next/navigation'

import { useCallback, useEffect, useRef, useState } from 'react'
// Type-only imports: erased at compile time, so this client bundle never pulls
// in the `server-only` settings service at runtime.
import type { LaunchPopup, Settings } from '@femi9/core/services/settings'
import type { ConsoleSettings } from '@femi9/core/services/admin/settings-admin'
// A VALUE import, and safe as one: `brands.ts` is plain configuration with no
// runtime imports beyond the brand union. LoginCard and the product form
// already pull it into client bundles for the same reason.
import { hasLaunchPopup, isBrand } from '@femi9/core/brands'

/**
 * Settings editor — the "customizable backend". A client component because the
 * whole surface is interactive: it loads current values from GET
 * /<brand>/api/settings on mount, edits them locally, then PATCHes on Save and
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

/**
 * The popup's duration ceiling, mirrored from `LAUNCH_POPUP_MAX_SECONDS`.
 *
 * Retyped rather than imported because that constant lives in a `server-only`
 * module: importing the VALUE here would drag the settings service — and its
 * Prisma client — into a client bundle. The server is still what enforces it;
 * this only keeps the form from offering a number the save will refuse.
 */
const MAX_POPUP_SECONDS = 60

type FormState = Record<keyof Settings, string>
type FieldErrors = Partial<Record<keyof Settings, string>>

/** The popup, as the form holds it — `seconds` is a string so the box can be
 *  transiently empty while she types, exactly like the numeric fields above. */
interface PopupState {
  enabled: boolean
  imageUrl: string
  alt: string
  seconds: string
}

function toPopupState(p: LaunchPopup): PopupState {
  return {
    enabled: p.enabled,
    imageUrl: p.imageUrl ?? '',
    alt: p.alt,
    seconds: String(p.seconds),
  }
}

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
  const { brand } = useParams<{ brand: string }>()
  // Only offered where a storefront renders it. `featuredSlots: 0` hides the
  // featured-products control for the same reason: a switch that changes
  // nothing a shopper sees is worse than an absent one, because an admin who
  // flips it believes the promo is live.
  const popupAvailable = isBrand(brand) && hasLaunchPopup(brand)
  const [values, setValues] = useState<FormState | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [popupError, setPopupError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch(`/${brand}/api/settings`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as ConsoleSettings
      setValues(toFormState(data))
      setPopup(toPopupState(data.launchPopup))
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

  function updatePopup(patch: Partial<PopupState>) {
    setPopup((p) => (p ? { ...p, ...patch } : p))
  }

  /**
   * The artwork is UPLOADED, never typed — same route and same reasoning as the
   * product photo and the blog cover. `/<brand>/api/upload` sniffs the magic
   * number, so a spoofed `.svg`/`.html` cannot be stored and served as active
   * content from our own origin, and it returns the `/uploads/…` URL the
   * storefront reads. We keep only that URL.
   */
  async function onUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so re-picking the same file still fires onChange.
    e.target.value = ''
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/${brand}/api/upload`, { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.url) {
        // The route's messages are already admin-readable, so surface them verbatim.
        setUploadError(body?.error || 'Upload failed. Please try again.')
        return
      }
      updatePopup({ imageUrl: body.url as string })
    } catch {
      setUploadError('Network error - please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values || !popup) return
    setSaving(true)
    setErrors({})
    setFormError(null)
    setPopupError(null)

    // Build the payload: numerics as Number (empty → 0), the rest trimmed strings.
    const payload: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const raw = values[f.key]
      payload[f.key] = f.numeric ? (raw.trim() === '' ? 0 : Number(raw)) : raw.trim()
    }

    // The popup goes as one whole object, matching the single row it is stored
    // in. An empty image box is null, not '': the server treats a blank string
    // as "no image" too, but sending the intent rather than the artefact keeps
    // the two ends agreeing about what an unset popup looks like.
    if (popupAvailable) {
      payload.launchPopup = {
        enabled: popup.enabled,
        imageUrl: popup.imageUrl.trim() || null,
        alt: popup.alt.trim(),
        seconds: popup.seconds.trim() === '' ? 0 : Number(popup.seconds),
      }
    }

    try {
      const res = await fetch(`/${brand}/api/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        // Reconcile with the server's canonical (defaulted) values.
        const data = (await res.json()) as ConsoleSettings
        setValues(toFormState(data))
        setPopup(toPopupState(data.launchPopup))
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
      // The popup is one nested object, so zod flattens its issues into a single
      // `launchPopup` entry rather than one per sub-field. Shown on the card.
      setPopupError(fieldErrors.launchPopup?.[0] ?? null)
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
            Business rules that power the storefront - shipping, subscriptions, loyalty and
            support{popupAvailable ? ', and the launch popup every visitor sees first' : ''}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading settings…</div>
        </div>
      ) : loadError || !values || !popup ? (
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

          {popupAvailable && (
          <>
          {/* ─────────────────────── Launch popup ───────────────────────
              The first thing a visitor sees. It is on this screen rather than
              under Content because it is a SWITCH, not a document: one image,
              one duration, and an on/off an admin flips the morning a campaign
              starts and back the morning it ends. */}
          <section className="adm-card" style={{ maxWidth: 560, marginTop: 20 }}>
            <div className="adm-card-head">
              <h2 className="adm-card-title">Launch popup</h2>
            </div>

            <div className="adm-field">
              <label className="adm-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={popup.enabled}
                  onChange={(e) => updatePopup({ enabled: e.target.checked })}
                />
                Show the popup on the storefront
              </label>
              <span className="adm-help">
                Shown once per visit, over the page, with a close (×) button. Switching this off
                keeps the image and the timing for next time.
              </span>
            </div>

            <div className="adm-field">
              <label className="adm-label">Popup image</label>

              {popup.imageUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  {/* Plain <img>: a runtime upload URL, and an ANIMATED one.
                      next/image would optimise the GIF into a still frame. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={popup.imageUrl}
                    alt=""
                    style={{
                      width: 104,
                      height: 104,
                      objectFit: 'contain',
                      borderRadius: 8,
                      border: '1px solid rgba(52,32,78,.13)',
                      background: 'rgba(52,32,78,.04)',
                    }}
                  />
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading…' : 'Replace'}
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => {
                      updatePopup({ imageUrl: '' })
                      setUploadError(null)
                    }}
                    disabled={uploading}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                  style={{ alignSelf: 'flex-start', marginBottom: 8 }}
                >
                  {uploading ? 'Uploading…' : 'Upload popup image'}
                </button>
              )}

              {/* Hidden native picker driven by the buttons above. `accept`
                  mirrors exactly what the upload route's magic-number sniff
                  allows, so the file dialog cannot offer a type the server will
                  reject. GIF is in both lists because an offer popup is
                  normally an animation. */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/gif,image/png,image/jpeg,image/webp"
                onChange={onUploadImage}
                style={{ display: 'none' }}
              />

              {uploadError && <span className="adm-error">{uploadError}</span>}
              <span className="adm-help">
                GIF, PNG, JPEG or WebP up to 8MB. The popup is shown at the image&rsquo;s own
                aspect ratio, capped to the screen - a tall portrait creative works best.
              </span>
            </div>

            <div className="adm-field">
              <label className="adm-label" htmlFor="s-popup-seconds">
                Show for (seconds)
              </label>
              <input
                id="s-popup-seconds"
                className="adm-input"
                inputMode="numeric"
                value={popup.seconds}
                onChange={(e) => updatePopup({ seconds: e.target.value })}
                placeholder="8"
              />
              <span className="adm-help">
                Closes itself after this many seconds. <strong>0</strong> means it stays until she
                closes it. Maximum {MAX_POPUP_SECONDS}.
              </span>
            </div>

            <div className="adm-field" style={{ marginBottom: 0 }}>
              <label className="adm-label" htmlFor="s-popup-alt">
                Image description
              </label>
              <input
                id="s-popup-alt"
                className="adm-input"
                value={popup.alt}
                onChange={(e) => updatePopup({ alt: e.target.value })}
                placeholder="Launch offer - 10% off your first order"
              />
              <span className="adm-help">
                Read aloud in place of the image, and shown if it fails to load. Say what the offer
                IS - a screen-reader user gets nothing else from a picture of it.
              </span>
            </div>

            {popupError && <span className="adm-error">{popupError}</span>}
          </section>
          </>
          )}

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
