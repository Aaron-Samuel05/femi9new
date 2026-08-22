'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { INDIA_STATES } from '@femi9/core/geo/india-states'

/**
 * Pricing Zones — interactive screen (table + create/edit form).
 *
 * The page shell (server component) does the first read via `listZones` and
 * hands the plain rows in as `initial`; from there this client component owns
 * everything interactive: opening the editor, the searchable multi-select of
 * states, the per-product custom prices, saving (POST create / PATCH edit),
 * deleting, and re-reading the list from GET /api/admin/pricing-zones after any
 * mutation.
 *
 * A zone prices two ways: a blanket `discountPct` off everything, and exact
 * prices typed against individual products/variants. The typed price WINS where
 * it is set — the discount is what the rest of the catalogue follows. An empty
 * price box is not "₹0", it means "this item follows the discount", which is why
 * the boxes are held as strings and only the filled ones are sent.
 *
 * We re-fetch (rather than splice) after every write because setting a zone as
 * default flips the *previous* default off too — a full re-read is the only way
 * to reflect that side effect correctly.
 *
 * The API carries a zone's attached states either as a flat `states: string[]`
 * or as `regions: [{ kind, value }]`; `toRow` normalises both so the UI only
 * ever deals with `states`.
 */

/** id → price in whole rupees. Absent = follows the zone's discount. */
export type PriceMap = Record<string, number>

export interface ZoneRow {
  id: string
  name: string
  discountPct: number
  isDefault: boolean
  active: boolean
  position: number
  states: string[]
  /** Custom prices set for this zone, by product id and by variant id. */
  productPrices: PriceMap
  variantPrices: PriceMap
}

/** A product and its variants, at STANDARD prices — what the custom price boxes
 *  override, and what their placeholders are computed from. Not-yet-live rows
 *  are included and flagged, never hidden: a price may already be set against
 *  one, and a hidden box would be deleted on the next save. */
export interface CatalogProduct {
  id: string
  name: string
  basePrice: number
  /** Draft (not published) — priceable, but nobody can buy it yet. */
  draft?: boolean
  variants: { id: string; label: string; price: number; inactive?: boolean }[]
}

/** Tolerant shape of a zone as it arrives over JSON from the admin API. */
interface ApiZone {
  id: string
  name: string
  discountPct: number
  isDefault: boolean
  active: boolean
  position?: number
  states?: string[]
  regions?: { kind: string; value: string }[]
  prices?: {
    products?: { productId: string; price: number }[]
    variants?: { variantId: string; price: number }[]
  }
}

/** Normalise an API zone (either `states` or `regions`) into a flat ZoneRow. */
export function toRow(z: ApiZone): ZoneRow {
  const states =
    z.states ?? (z.regions ?? []).filter((r) => r.kind === 'state').map((r) => r.value)
  return {
    id: z.id,
    name: z.name,
    discountPct: z.discountPct,
    isDefault: z.isDefault,
    active: z.active,
    position: z.position ?? 0,
    states: [...states],
    productPrices: Object.fromEntries((z.prices?.products ?? []).map((p) => [p.productId, p.price])),
    variantPrices: Object.fromEntries((z.prices?.variants ?? []).map((v) => [v.variantId, v.price])),
  }
}

// ─── Form state (numeric fields held as strings so a box can be empty) ────────
interface FormState {
  id: string | null
  name: string
  discountPct: string
  active: boolean
  isDefault: boolean
  states: string[]
  /** productId → what is typed in its box ('' = follow the discount). */
  productPrices: Record<string, string>
  /** variantId → what is typed in its box ('' = follow the discount). */
  variantPrices: Record<string, string>
}

const BLANK: FormState = {
  id: null,
  name: '',
  discountPct: '0',
  active: true,
  isDefault: false,
  states: [],
  productPrices: {},
  variantPrices: {},
}

type FieldErrors = Record<string, string | undefined>

/** The price a box is overriding: base minus the zone's percentage. Shown as the
 *  box's placeholder so the admin can see what happens if she leaves it empty. */
function discountedPrice(base: number, discountPct: string): number {
  const pct = Number(discountPct)
  const safe = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
  return Math.round((base * (100 - safe)) / 100)
}

/** Turn stored prices into the string boxes the form edits. */
function toBoxes(prices: PriceMap): Record<string, string> {
  return Object.fromEntries(Object.entries(prices).map(([id, price]) => [id, String(price)]))
}

/** The filled boxes only, as [id, price] pairs — an empty box is not a price. */
function filledPrices(boxes: Record<string, string>): [string, number][] {
  return Object.entries(boxes)
    .filter(([, raw]) => raw.trim() !== '')
    .map(([id, raw]) => [id, Number(raw)] as [string, number])
    .filter(([, price]) => Number.isInteger(price) && price >= 1)
}

export default function PricingZonesScreen({
  initial,
  catalog = [],
}: {
  initial: ZoneRow[]
  catalog?: CatalogProduct[]
}) {
  const [rows, setRows] = useState<ZoneRow[]>(initial)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Editor state.
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(BLANK)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  // The custom-price table is long; collapsed by default so the zone basics stay
  // the first thing on screen.
  const [pricesOpen, setPricesOpen] = useState(false)

  // Per-row busy (delete).
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/pricing-zones', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as ApiZone[]
      setRows(data.map(toRow))
    } catch {
      setToast('Could not refresh zones.')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const setField = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  function openNew() {
    setForm(BLANK)
    setErrors({})
    setFormError(null)
    setSearch('')
    setPricesOpen(false)
    setOpen(true)
  }

  function openEdit(z: ZoneRow) {
    setForm({
      id: z.id,
      name: z.name,
      discountPct: String(z.discountPct),
      active: z.active,
      isDefault: z.isDefault,
      states: [...z.states],
      productPrices: toBoxes(z.productPrices),
      variantPrices: toBoxes(z.variantPrices),
    })
    setErrors({})
    setFormError(null)
    setSearch('')
    // Opened straight away when this zone already prices by hand, so an existing
    // custom price is never hidden behind a collapsed section.
    setPricesOpen(
      Object.keys(z.productPrices).length > 0 || Object.keys(z.variantPrices).length > 0,
    )
    setOpen(true)
  }

  // ── Custom price boxes ──────────────────────────────────────────────────────
  function setProductPrice(productId: string, value: string) {
    setForm((f) => ({ ...f, productPrices: { ...f.productPrices, [productId]: value } }))
  }

  function setVariantPrice(variantId: string, value: string) {
    setForm((f) => ({ ...f, variantPrices: { ...f.variantPrices, [variantId]: value } }))
  }

  /** Clear every box for one product — back to "follows the discount". */
  function clearProductPrices(p: CatalogProduct) {
    setForm((f) => {
      const productPrices = { ...f.productPrices, [p.id]: '' }
      const variantPrices = { ...f.variantPrices }
      for (const v of p.variants) variantPrices[v.id] = ''
      return { ...f, productPrices, variantPrices }
    })
  }

  function closeEditor() {
    setOpen(false)
  }

  // ── Searchable state multi-select ───────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? INDIA_STATES.filter((s) => s.toLowerCase().includes(q)) : INDIA_STATES
  }, [search])

  function toggleState(s: string) {
    setForm((f) =>
      f.states.includes(s)
        ? { ...f, states: f.states.filter((x) => x !== s) }
        : { ...f, states: [...f.states, s] },
    )
  }

  // ── Validation (mirrors the server for fast inline errors) ──────────────────
  function validate(): FieldErrors {
    const e: FieldErrors = {}
    const name = form.name.trim()
    if (!name) e.name = 'Name is required'
    else if (name.length > 60) e.name = 'Name is too long (60 max)'

    const n = Number(form.discountPct)
    if (form.discountPct.trim() === '' || !Number.isInteger(n)) e.discountPct = 'Enter a whole number'
    else if (n < 0 || n > 100) e.discountPct = 'Must be between 0 and 100'

    // Custom prices: an empty box is valid (follow the discount); anything typed
    // must be whole rupees ≥ 1. Errors are keyed by the box's own id so they land
    // under the right input.
    const priceError = (raw: string) => {
      if (raw.trim() === '') return undefined
      const value = Number(raw)
      if (!Number.isInteger(value)) return 'Whole rupees only'
      if (value < 1) return 'At least ₹1'
      if (value > 1_000_000) return 'Too large'
      return undefined
    }
    for (const [id, raw] of Object.entries(form.productPrices)) {
      const err = priceError(raw)
      if (err) e[`product:${id}`] = err
    }
    for (const [id, raw] of Object.entries(form.variantPrices)) {
      const err = priceError(raw)
      if (err) e[`variant:${id}`] = err
    }
    return e
  }

  // ── Save (create or edit) ───────────────────────────────────────────────────
  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setFormError(null)
    const fieldErrs = validate()
    setErrors(fieldErrs)
    if (Object.keys(fieldErrs).length > 0) {
      // A bad price can be scrolled out of sight inside the collapsed section.
      if (Object.keys(fieldErrs).some((k) => k.startsWith('product:') || k.startsWith('variant:'))) {
        setPricesOpen(true)
        setFormError('Check the custom prices below.')
      }
      return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      discountPct: Number(form.discountPct),
      active: form.active,
      isDefault: form.isDefault,
      // The default zone is the "location unknown" fallback — it carries no states.
      states: form.isDefault ? [] : form.states,
      // Only the FILLED boxes are prices; the cleared ones are absent, and the
      // server deletes whatever is absent so an item goes back to the discount.
      prices: {
        products: filledPrices(form.productPrices).map(([productId, price]) => ({
          productId,
          price,
        })),
        variants: filledPrices(form.variantPrices).map(([variantId, price]) => ({
          variantId,
          price,
        })),
      },
    }
    const url = form.id ? `/api/admin/pricing-zones/${form.id}` : '/api/admin/pricing-zones'
    const method = form.id ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        setOpen(false)
        setToast(form.id ? `Zone “${payload.name}” updated` : `Zone “${payload.name}” created`)
        await load()
        return
      }

      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
      }
      if (body?.details?.fieldErrors) {
        const mapped: FieldErrors = {}
        for (const [k, v] of Object.entries(body.details.fieldErrors)) {
          if (v && v.length) mapped[k] = v[0]
        }
        setErrors(mapped)
      }
      setFormError(
        body?.details?.formErrors?.[0] || body?.error || 'Could not save the zone. Please try again.',
      )
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function onDelete(z: ZoneRow) {
    if (z.isDefault) return
    if (!confirm(`Delete the “${z.name}” zone? Shoppers there will fall back to the standard price.`))
      return
    setPendingId(z.id)
    try {
      const res = await fetch(`/api/admin/pricing-zones/${z.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Delete failed')
      setToast(`Zone “${z.name}” deleted`)
      await load()
    } catch (err) {
      setToast(`Couldn't delete “${z.name}” - ${err instanceof Error ? err.message : 'try again'}`)
    } finally {
      setPendingId(null)
    }
  }

  const editingDefault = Boolean(form.id) && form.isDefault
  const isEditing = form.id !== null

  // How many boxes are actually priced — the badge on the collapsed section, so
  // the admin can see a zone prices by hand without opening it.
  const customCount = useMemo(
    () => filledPrices(form.productPrices).length + filledPrices(form.variantPrices).length,
    [form.productPrices, form.variantPrices],
  )

  return (
    <>
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="adm-chip">{rows.length} {rows.length === 1 ? 'zone' : 'zones'}</span>
        </div>
        <div style={{ display: 'inline-flex', gap: 8 }}>
          <button
            type="button"
            className="adm-btn adm-btn--secondary adm-btn--sm"
            onClick={load}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={openNew}>
            + New zone
          </button>
        </div>
      </div>

      {/* Editor */}
      {open && (
        <section className="adm-card" style={{ marginBottom: 16 }}>
          <div className="adm-card-head">
            <h2 className="adm-card-title">{isEditing ? `Edit “${form.name || 'zone'}”` : 'New zone'}</h2>
            <button type="button" className="adm-btn adm-btn--ghost adm-btn--sm" onClick={closeEditor}>
              Cancel
            </button>
          </div>

          {formError && (
            <div className="adm-auth-error" role="alert" style={{ marginBottom: 14 }}>
              <span className="adm-error">{formError}</span>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate>
            <div className="adm-row">
              <div className="adm-field" style={{ flex: '1 1 220px' }}>
                <label className="adm-label" htmlFor="z-name">Zone name</label>
                <input
                  id="z-name"
                  className="adm-input"
                  value={form.name}
                  onChange={(e) => setField({ name: e.target.value })}
                  placeholder="Tamil Nadu"
                  spellCheck={false}
                />
                {errors.name && <span className="adm-error">{errors.name}</span>}
              </div>

              <div className="adm-field" style={{ flex: '0 1 160px' }}>
                <label className="adm-label" htmlFor="z-pct">Discount (%)</label>
                <input
                  id="z-pct"
                  className="adm-input"
                  inputMode="numeric"
                  value={form.discountPct}
                  onChange={(e) => setField({ discountPct: e.target.value })}
                  placeholder="10"
                />
                {errors.discountPct ? (
                  <span className="adm-error">{errors.discountPct}</span>
                ) : (
                  <span className="adm-help">e.g. Tamil Nadu −10% off every product</span>
                )}
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, margin: '4px 0 16px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setField({ active: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: 'var(--plum)' }}
                />
                <span>
                  <span className="adm-label">Active</span>
                  <span className="adm-help" style={{ display: 'block' }}>
                    Inactive zones fall back to the standard price.
                  </span>
                </span>
              </label>

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: editingDefault ? 'not-allowed' : 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  disabled={editingDefault}
                  onChange={(e) => setField({ isDefault: e.target.checked })}
                  style={{ width: 18, height: 18, accentColor: 'var(--plum)' }}
                />
                <span>
                  <span className="adm-label">Set as default zone</span>
                  <span className="adm-help" style={{ display: 'block' }}>
                    {editingDefault
                      ? 'Already the default - set another zone as default to move it.'
                      : 'Shown when a shopper’s location is unknown.'}
                  </span>
                </span>
              </label>
            </div>

            {/* State multi-select — hidden for the default (fallback) zone. */}
            {form.isDefault ? (
              <div className="adm-help" style={{ marginBottom: 16 }}>
                The default zone applies when a location is unknown, so it has no attached states.
              </div>
            ) : (
              <div className="adm-field">
                <label className="adm-label">Attached states</label>

                {/* Selected chips */}
                {form.states.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {form.states.map((s) => (
                      <span key={s} className="adm-chip">
                        {s}
                        {/* .adm-chip-x carries the styling so the touch-sized hit
                            box can be scoped to coarse pointers only. */}
                        <button
                          type="button"
                          className="adm-chip-x"
                          aria-label={`Remove ${s}`}
                          onClick={() => toggleState(s)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <input
                  className="adm-input"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search states…"
                  spellCheck={false}
                  style={{ marginBottom: 8 }}
                />

                <div
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-sm)',
                    maxHeight: 220,
                    overflowY: 'auto',
                    padding: 6,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
                    gap: 2,
                  }}
                >
                  {filtered.length === 0 ? (
                    <p className="adm-help" style={{ padding: 8, margin: 0 }}>
                      No states match “{search}”.
                    </p>
                  ) : (
                    filtered.map((s) => {
                      const checked = form.states.includes(s)
                      return (
                        <label
                          key={s}
                          className="adm-state-option"
                          style={{
                            background: checked ? 'var(--plum-tint)' : 'transparent',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleState(s)}
                            style={{ width: 16, height: 16, accentColor: 'var(--plum)' }}
                          />
                          <span>{s}</span>
                        </label>
                      )
                    })
                  )}
                </div>
                <span className="adm-help" style={{ marginTop: 6 }}>
                  A state maps to exactly one zone. Selected states get this zone’s discount.
                </span>
              </div>
            )}

            {/* ── Custom prices ────────────────────────────────────────────
                An exact price per product/variant for THIS zone. Leaving a box
                empty is the normal case: that item follows the discount above,
                and the placeholder shows what that comes to. */}
            {catalog.length > 0 && (
              <div className="adm-field" style={{ marginTop: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="adm-label" style={{ margin: 0 }}>
                    Custom prices
                    {customCount > 0 && (
                      <span className="adm-chip" style={{ marginLeft: 8 }}>
                        {customCount} set
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost adm-btn--sm"
                    onClick={() => setPricesOpen((v) => !v)}
                    aria-expanded={pricesOpen}
                  >
                    {pricesOpen ? 'Hide' : 'Set prices'}
                  </button>
                </div>
                <span className="adm-help" style={{ display: 'block', marginTop: 4 }}>
                  Type a price to charge exactly that in this zone - it overrides the discount for
                  that item. Leave a box empty to follow the discount.
                </span>

                {pricesOpen && (
                  <div
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 'var(--radius-sm)',
                      marginTop: 10,
                      maxHeight: 420,
                      overflowY: 'auto',
                    }}
                  >
                    {catalog.map((p) => {
                      const productBox = form.productPrices[p.id] ?? ''
                      const productErr = errors[`product:${p.id}`]
                      const touched =
                        productBox.trim() !== '' ||
                        p.variants.some((v) => (form.variantPrices[v.id] ?? '').trim() !== '')
                      return (
                        <div
                          key={p.id}
                          style={{
                            padding: '12px 12px 14px',
                            borderBottom: '1px solid var(--line-soft, var(--line))',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              flexWrap: 'wrap',
                              marginBottom: 8,
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {p.name}
                              {p.draft && (
                                <span className="adm-badge adm-badge--gray" style={{ marginLeft: 8 }}>
                                  Draft
                                </span>
                              )}
                            </span>
                            {touched && (
                              <button
                                type="button"
                                className="adm-btn adm-btn--ghost adm-btn--sm"
                                onClick={() => clearProductPrices(p)}
                              >
                                Clear
                              </button>
                            )}
                          </div>

                          <div
                            style={{
                              display: 'grid',
                              gap: 10,
                              gridTemplateColumns:
                                'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
                            }}
                          >
                            {/* The product's own (card / headline) price. */}
                            <PriceBox
                              id={`pp-${p.id}`}
                              label="Card price"
                              standard={p.basePrice}
                              placeholder={discountedPrice(p.basePrice, form.discountPct)}
                              value={productBox}
                              error={productErr}
                              onChange={(v) => setProductPrice(p.id, v)}
                            />

                            {/* Each variant — this is what a cart line is charged. */}
                            {p.variants.map((v) => (
                              <PriceBox
                                key={v.id}
                                id={`vp-${v.id}`}
                                label={v.inactive ? `${v.label} (inactive)` : v.label}
                                standard={v.price}
                                placeholder={discountedPrice(v.price, form.discountPct)}
                                value={form.variantPrices[v.id] ?? ''}
                                error={errors[`variant:${v.id}`]}
                                onChange={(val) => setVariantPrice(v.id, val)}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="submit" className="adm-btn adm-btn--primary" disabled={saving}>
                {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create zone'}
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--secondary"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <div className="adm-empty">
          <p className="adm-empty-title">No pricing zones yet</p>
          <p>Create your first zone to offer a regional discount.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={openNew}>
            + New zone
          </button>
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th className="adm-td-num">Discount</th>
                <th className="adm-td-num">Custom prices</th>
                <th>States</th>
                <th>Status</th>
                <th style={{ width: 150 }}>{/* actions */}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((z) => {
                const busy = pendingId === z.id
                const priced =
                  Object.keys(z.productPrices).length + Object.keys(z.variantPrices).length
                return (
                  <tr key={z.id} style={{ opacity: busy ? 0.6 : 1 }}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{z.name}</span>
                        {z.isDefault && <span className="adm-badge adm-badge--plum">Default</span>}
                      </span>
                    </td>
                    <td className="adm-td-num">
                      {z.discountPct > 0 ? (
                        <span className="adm-badge adm-badge--green">−{z.discountPct}%</span>
                      ) : (
                        <span className="adm-cell-muted">Standard</span>
                      )}
                    </td>
                    <td className="adm-td-num">
                      {priced > 0 ? (
                        <span className="adm-badge adm-badge--plum">
                          {priced} {priced === 1 ? 'item' : 'items'}
                        </span>
                      ) : (
                        <span className="adm-cell-muted">-</span>
                      )}
                    </td>
                    <td>
                      {z.isDefault ? (
                        <span className="adm-cell-muted">Fallback (location unknown)</span>
                      ) : z.states.length === 0 ? (
                        <span className="adm-cell-muted">-</span>
                      ) : z.states.length <= 3 ? (
                        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
                          {z.states.map((s) => (
                            <span key={s} className="adm-chip">{s}</span>
                          ))}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          {z.states.slice(0, 2).map((s) => (
                            <span key={s} className="adm-chip">{s}</span>
                          ))}
                          <span className="adm-cell-muted">+{z.states.length - 2} more</span>
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={'adm-badge ' + (z.active ? 'adm-badge--green' : 'adm-badge--gray')}>
                        {z.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          type="button"
                          className="adm-btn adm-btn--secondary adm-btn--sm"
                          onClick={() => openEdit(z)}
                          disabled={busy}
                        >
                          Edit
                        </button>
                        {!z.isDefault && (
                          <button
                            type="button"
                            className="adm-btn adm-btn--danger adm-btn--sm"
                            onClick={() => onDelete(z)}
                            disabled={busy}
                          >
                            Delete
                          </button>
                        )}
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

/**
 * One custom-price box.
 *
 * The placeholder is the price this zone charges TODAY (base minus its
 * discount), so an empty box reads as "₹203 — the discount" rather than as a
 * missing value, and the standard price is spelled out underneath. A price above
 * the standard one is allowed — that is the point of typing a number instead of
 * a percentage — but it is flagged, because it is far more often a typo than an
 * intention.
 */
function PriceBox({
  id,
  label,
  standard,
  placeholder,
  value,
  error,
  onChange,
}: {
  id: string
  label: string
  standard: number
  placeholder: number
  value: string
  error?: string
  onChange: (value: string) => void
}) {
  const typed = Number(value)
  const isAbove = value.trim() !== '' && Number.isFinite(typed) && typed > standard

  return (
    <div>
      <label className="adm-label" htmlFor={id} style={{ fontSize: 12 }}>
        {label}
      </label>
      <input
        id={id}
        className="adm-input"
        inputMode="numeric"
        value={value}
        placeholder={`₹${placeholder}`}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-help`}
      />
      <span
        id={`${id}-help`}
        className={error ? 'adm-error' : 'adm-help'}
        style={{ display: 'block', marginTop: 2 }}
      >
        {error
          ? error
          : isAbove
            ? `Above the standard ₹${standard}`
            : `Standard ₹${standard}`}
      </span>
    </div>
  )
}
