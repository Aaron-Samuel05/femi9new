'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * Shared product editor used by both create (/products/new) and edit
 * (/products/[id]). The headline capability is the DYNAMIC VARIANT LIST: an
 * unbounded add/remove set of pack/size rows, so this one form defines every
 * future product without code changes.
 *
 * Numeric fields are held as strings in state (an <input> yields strings and we
 * want to allow a transiently-empty box); they're coerced when the payload is
 * built. Existing variants keep their `id` so the API can diff on save.
 */

// ── Public value shapes (the edit page maps a DB row into these) ──────────

export interface VariantValue {
  id?: string
  kind: 'pack' | 'size'
  label: string
  packCount: number | null
  size: string | null
  price: number
  sku: string
  stock: number
  active: boolean
}

export interface ProductFormValues {
  name: string
  slug: string
  type: 'pad' | 'panty'
  basePrice: number
  meta: string
  flow: string
  description: string
  longDescription: string
  tag: string
  status: 'active' | 'draft' | 'archived'
  images: string[]
  variants: VariantValue[]
}

// ── Internal (string-backed) row shapes with a stable React key ───────────

interface VariantRow {
  _key: string
  id?: string
  kind: 'pack' | 'size'
  label: string
  packCount: string
  size: string
  price: string
  sku: string
  stock: string
  active: boolean
}

interface ImageRow {
  _key: string
  url: string
}

type FieldErrors = Record<string, string[] | undefined>

let keySeq = 0
const nextKey = () => `r${keySeq++}`

function blankVariant(kind: 'pack' | 'size' = 'pack'): VariantRow {
  return {
    _key: nextKey(),
    kind,
    label: '',
    packCount: '',
    size: '',
    price: '',
    sku: '',
    stock: '0',
    active: true,
  }
}

function toVariantRow(v: VariantValue): VariantRow {
  return {
    _key: nextKey(),
    id: v.id,
    kind: v.kind,
    label: v.label,
    packCount: v.packCount != null ? String(v.packCount) : '',
    size: v.size ?? '',
    price: String(v.price),
    sku: v.sku ?? '',
    stock: String(v.stock),
    active: v.active,
  }
}

export default function ProductForm({
  mode,
  productId,
  initial,
}: {
  mode: 'create' | 'edit'
  productId?: string
  initial?: Partial<ProductFormValues>
}) {
  const router = useRouter()

  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [type, setType] = useState<'pad' | 'panty'>(initial?.type ?? 'pad')
  const [basePrice, setBasePrice] = useState(
    initial?.basePrice != null ? String(initial.basePrice) : '',
  )
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>(
    initial?.status ?? 'draft',
  )
  const [tag, setTag] = useState(initial?.tag ?? '')
  const [meta, setMeta] = useState(initial?.meta ?? '')
  const [flow, setFlow] = useState(initial?.flow ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [longDescription, setLongDescription] = useState(initial?.longDescription ?? '')

  const [images, setImages] = useState<ImageRow[]>(
    (initial?.images ?? []).map((url) => ({ _key: nextKey(), url })),
  )
  const [variants, setVariants] = useState<VariantRow[]>(
    (initial?.variants ?? []).map(toVariantRow),
  )

  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // File upload lives beside the manual URL rows. It POSTs the picked image to
  // /api/admin/upload and appends the returned URL as a normal image row, so the
  // uploaded file flows through the exact same save path as a hand-typed URL.
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // ── Variant/image row mutators ──────────────────────────────────────────
  function updateVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)))
  }
  function addVariant() {
    // Default a new row to the kind that matches the product type for less typing.
    setVariants((rows) => [...rows, blankVariant(type === 'panty' ? 'size' : 'pack')])
  }
  function removeVariant(key: string) {
    setVariants((rows) => rows.filter((r) => r._key !== key))
  }

  function updateImage(key: string, url: string) {
    setImages((rows) => rows.map((r) => (r._key === key ? { ...r, url } : r)))
  }
  function addImage() {
    setImages((rows) => [...rows, { _key: nextKey(), url: '' }])
  }
  function removeImage(key: string) {
    setImages((rows) => rows.filter((r) => r._key !== key))
  }

  async function onUploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset the input so re-picking the same file still fires onChange.
    e.target.value = ''
    if (!file) return

    setUploadError(null)
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.url) {
        setUploadError(body?.error || 'Upload failed. Please try again.')
        return
      }
      setImages((rows) => [...rows, { _key: nextKey(), url: body.url as string }])
    } catch {
      setUploadError('Network error - please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setErrors({})

    const payload = {
      name: name.trim(),
      slug: slug.trim(),
      type,
      basePrice: basePrice.trim() === '' ? 0 : Number(basePrice),
      meta: meta.trim(),
      flow: flow.trim(),
      description: description.trim(),
      longDescription: longDescription.trim() || null,
      tag: tag.trim() || null,
      status,
      images: images.map((i) => i.url.trim()).filter(Boolean),
      variants: variants.map((v) => ({
        id: v.id,
        kind: v.kind,
        label: v.label.trim(),
        // Only the field that matches the kind is sent; the API nulls the rest.
        packCount: v.kind === 'pack' ? (v.packCount.trim() === '' ? null : Number(v.packCount)) : null,
        size: v.kind === 'size' ? v.size.trim() : null,
        price: v.price.trim() === '' ? 0 : Number(v.price),
        sku: v.sku.trim() || null,
        stock: v.stock.trim() === '' ? 0 : Number(v.stock),
        active: v.active,
      })),
    }

    try {
      const url = mode === 'create' ? '/api/admin/products' : `/api/admin/products/${productId}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        router.push('/admin/products')
        router.refresh()
        return
      }

      const body = await res.json().catch(() => ({}))
      // zod's flatten() → { formErrors, fieldErrors }; surface both.
      if (body?.details?.fieldErrors) setErrors(body.details.fieldErrors as FieldErrors)
      setFormError(
        body?.details?.formErrors?.[0] || body?.error || 'Could not save. Please try again.',
      )
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function onArchive() {
    if (!productId) return
    if (!confirm('Archive this product? It will be hidden from the storefront.')) return
    setArchiving(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/admin/products/${productId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/admin/products')
        router.refresh()
        return
      }
      const body = await res.json().catch(() => ({}))
      setFormError(body?.error || 'Could not archive this product.')
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setArchiving(false)
    }
  }

  const err = (k: string) => errors[k]?.[0]

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate>
      {formError && (
        <div className="adm-card" style={{ borderColor: 'var(--red)', marginBottom: 16 }} role="alert">
          <span className="adm-error">{formError}</span>
        </div>
      )}

      {/* Two-column core: Details + Copy. Collapses to one column when narrow. */}
      <div
        style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}
      >
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Details</h2>
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="p-name">Name</label>
            <input
              id="p-name"
              className="adm-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="330mm Double Wings"
            />
            {err('name') && <span className="adm-error">{err('name')}</span>}
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="p-slug">Slug</label>
            <input
              id="p-slug"
              className="adm-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Auto-generated from name if left blank"
            />
            <span className="adm-help">Used in the storefront URL. Must be unique.</span>
            {err('slug') && <span className="adm-error">{err('slug')}</span>}
          </div>

          <div className="adm-row">
            <div className="adm-field">
              <label className="adm-label" htmlFor="p-type">Type</label>
              <select
                id="p-type"
                className="adm-select"
                value={type}
                onChange={(e) => setType(e.target.value as 'pad' | 'panty')}
              >
                <option value="pad">Pad (sold by pack)</option>
                <option value="panty">Panty (sold by size)</option>
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="p-price">Base price (₹)</label>
              <input
                id="p-price"
                className="adm-input"
                inputMode="numeric"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                placeholder="225"
              />
              {err('basePrice') && <span className="adm-error">{err('basePrice')}</span>}
            </div>
          </div>

          <div className="adm-row">
            <div className="adm-field">
              <label className="adm-label" htmlFor="p-status">Status</label>
              <select
                id="p-status"
                className="adm-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'draft' | 'archived')}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="p-tag">Tag</label>
              <input
                id="p-tag"
                className="adm-input"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="Bestseller"
              />
              <span className="adm-help">Optional storefront ribbon.</span>
            </div>
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Copy</h2>
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="p-meta">Meta</label>
            <input
              id="p-meta"
              className="adm-input"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              placeholder="9 pads · 330mm"
            />
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="p-flow">Flow</label>
            <input
              id="p-flow"
              className="adm-input"
              value={flow}
              onChange={(e) => setFlow(e.target.value)}
              placeholder="Heavy · Night + Day"
            />
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="p-desc">Short description</label>
            <textarea
              id="p-desc"
              className="adm-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Extra-length with double wings for overnight security."
              style={{ minHeight: 72 }}
            />
          </div>

          <div className="adm-field" style={{ marginBottom: 0 }}>
            <label className="adm-label" htmlFor="p-long">Long description</label>
            <textarea
              id="p-long"
              className="adm-textarea"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder="Full product detail shown on the product page."
            />
          </div>
        </section>
      </div>

      {/* Images — ordered URL list */}
      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">Images</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="adm-btn adm-btn--secondary adm-btn--sm"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Upload image'}
            </button>
            <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" onClick={addImage}>
              + Add image
            </button>
          </div>
          {/* Hidden native picker driven by the button above. */}
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            onChange={onUploadFile}
            style={{ display: 'none' }}
          />
        </div>

        {uploadError && (
          <span className="adm-error" style={{ display: 'block', marginBottom: 10 }}>
            {uploadError}
          </span>
        )}

        {images.length === 0 ? (
          <p className="adm-help" style={{ margin: 0 }}>
            No images yet. The first image is used as the thumbnail.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {images.map((img, i) => (
              <div key={img._key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    flex: 'none',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: img.url
                      ? `center / cover no-repeat url(${JSON.stringify(img.url)})`
                      : 'var(--canvas)',
                  }}
                />
                <input
                  className="adm-input"
                  value={img.url}
                  onChange={(e) => updateImage(img._key, e.target.value)}
                  placeholder="/assets/img/prod-330-double.webp"
                  aria-label={`Image URL ${i + 1}`}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={() => removeImage(img._key)}
                  aria-label={`Remove image ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Variants — the dynamic pack/size list */}
      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">Variants</h2>
          <button type="button" className="adm-btn adm-btn--secondary adm-btn--sm" onClick={addVariant}>
            + Add variant
          </button>
        </div>

        {variants.length === 0 ? (
          <p className="adm-help" style={{ margin: 0 }}>
            No variants yet. Add at least one purchasable pack or size.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {variants.map((v, i) => (
              <div
                key={v._key}
                style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', padding: 12 }}
              >
                <div className="adm-row">
                  <div className="adm-field" style={{ flex: '0 1 150px' }}>
                    <label className="adm-label" htmlFor={`v-kind-${i}`}>Kind</label>
                    <select
                      id={`v-kind-${i}`}
                      className="adm-select"
                      value={v.kind}
                      onChange={(e) =>
                        updateVariant(v._key, { kind: e.target.value as 'pack' | 'size' })
                      }
                    >
                      <option value="pack">Pack</option>
                      <option value="size">Size</option>
                    </select>
                  </div>

                  <div className="adm-field" style={{ flex: '1 1 130px' }}>
                    <label className="adm-label" htmlFor={`v-label-${i}`}>Label</label>
                    <input
                      id={`v-label-${i}`}
                      className="adm-input"
                      value={v.label}
                      onChange={(e) => updateVariant(v._key, { label: e.target.value })}
                      placeholder={v.kind === 'pack' ? '9 pcs' : 'M'}
                    />
                  </div>

                  {v.kind === 'pack' ? (
                    <div className="adm-field" style={{ flex: '0 1 110px' }}>
                      <label className="adm-label" htmlFor={`v-count-${i}`}>Pack count</label>
                      <input
                        id={`v-count-${i}`}
                        className="adm-input"
                        inputMode="numeric"
                        value={v.packCount}
                        onChange={(e) => updateVariant(v._key, { packCount: e.target.value })}
                        placeholder="9"
                      />
                    </div>
                  ) : (
                    <div className="adm-field" style={{ flex: '0 1 110px' }}>
                      <label className="adm-label" htmlFor={`v-size-${i}`}>Size</label>
                      <input
                        id={`v-size-${i}`}
                        className="adm-input"
                        value={v.size}
                        onChange={(e) => updateVariant(v._key, { size: e.target.value })}
                        placeholder="M"
                      />
                    </div>
                  )}

                  <div className="adm-field" style={{ flex: '0 1 110px' }}>
                    <label className="adm-label" htmlFor={`v-price-${i}`}>Price (₹)</label>
                    <input
                      id={`v-price-${i}`}
                      className="adm-input"
                      inputMode="numeric"
                      value={v.price}
                      onChange={(e) => updateVariant(v._key, { price: e.target.value })}
                      placeholder="225"
                    />
                  </div>

                  <div className="adm-field" style={{ flex: '0 1 100px' }}>
                    <label className="adm-label" htmlFor={`v-stock-${i}`}>Stock</label>
                    <input
                      id={`v-stock-${i}`}
                      className="adm-input"
                      inputMode="numeric"
                      value={v.stock}
                      onChange={(e) => updateVariant(v._key, { stock: e.target.value })}
                      placeholder="0"
                    />
                  </div>

                  <div className="adm-field" style={{ flex: '1 1 140px' }}>
                    <label className="adm-label" htmlFor={`v-sku-${i}`}>SKU</label>
                    <input
                      id={`v-sku-${i}`}
                      className="adm-input"
                      value={v.sku}
                      onChange={(e) => updateVariant(v._key, { sku: e.target.value })}
                      placeholder="Optional"
                    />
                  </div>

                  <div
                    className="adm-field"
                    style={{ flex: '0 0 auto', alignItems: 'flex-start' }}
                  >
                    <label className="adm-label" htmlFor={`v-active-${i}`}>Active</label>
                    <input
                      id={`v-active-${i}`}
                      type="checkbox"
                      checked={v.active}
                      onChange={(e) => updateVariant(v._key, { active: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: 'var(--plum)', marginTop: 8 }}
                    />
                  </div>

                  <button
                    type="button"
                    className="adm-btn adm-btn--danger adm-btn--sm"
                    onClick={() => removeVariant(v._key)}
                    aria-label={`Remove variant ${i + 1}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {err('variants') && (
          <span className="adm-error" style={{ display: 'block', marginTop: 8 }}>
            {err('variants')}
          </span>
        )}
      </section>

      {/* Actions */}
      <div
        className="adm-toolbar"
        style={{ marginTop: 20, marginBottom: 0, justifyContent: 'flex-start' }}
      >
        <button type="submit" className="adm-btn adm-btn--primary" disabled={saving || archiving}>
          {saving ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
        </button>
        <Link className="adm-btn adm-btn--secondary" href="/admin/products">
          Cancel
        </Link>
        {mode === 'edit' && (
          <button
            type="button"
            className="adm-btn adm-btn--danger"
            onClick={onArchive}
            disabled={saving || archiving}
            style={{ marginLeft: 'auto' }}
          >
            {archiving ? 'Archiving…' : 'Archive'}
          </button>
        )}
      </div>
    </form>
  )
}
