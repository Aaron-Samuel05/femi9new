'use client'

import { useRef, useState } from 'react'
import { brandConfig, isBrand, type ProductTypeValue } from '@femi9/core/brands'
import { useRouter, useParams } from 'next/navigation'
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
  type: ProductTypeValue
  basePrice: number
  meta: string
  flow: string
  description: string
  longDescription: string
  tag: string
  status: 'active' | 'draft' | 'archived'
  /**
   * On the landing page's featured rail.
   *
   * Editable here as well as from the star in the products table, because the
   * two answer different questions: the table arranges the SET ("which five"),
   * while this is where somebody publishing a new product decides it should
   * lead. The cap belongs to neither — see @femi9/core/services/admin/products.
   */
  featured: boolean
  images: string[]
  variants: VariantValue[]
  /**
   * Key Benefits and the specs table.
   *
   * The API has accepted both since it was written and `getAdminProduct` has
   * always read them, but the FORM never sent them - so a product created here
   * got neither, and one that had them from a seed lost nothing only because a
   * PATCH that omits the field is treated as "leave them alone". Lumi9 depends
   * on the specs in particular: its storefront derives a size's display name and
   * its weight range from the `Size` and `Fits` rows, so before this the fit
   * range printed on every card was editable only by re-running a seed.
   */
  features: FeatureValue[]
  specs: SpecValue[]
}

export interface FeatureValue {
  title: string
  body: string
}

export interface SpecValue {
  key: string
  value: string
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

interface FeatureRow extends FeatureValue {
  _key: string
}

interface SpecRow extends SpecValue {
  _key: string
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

/** What each type means to whoever is filling the form in. */
const TYPE_LABELS: Record<ProductTypeValue, string> = {
  pad: 'Pad (sold by pack)',
  panty: 'Panty (sold by size)',
  diaper: 'Diaper (sold by pack)',
}

export default function ProductForm({
  mode,
  productId,
  initial,
  featuredUsed = 0,
}: {
  mode: 'create' | 'edit'
  productId?: string
  initial?: Partial<ProductFormValues>
  /**
   * How many OTHER products are already featured, read on the server when this
   * page rendered. A hint for the checkbox's disabled state and nothing more:
   * it is stale the moment another admin saves, and the API is what actually
   * holds the cap.
   */
  featuredUsed?: number
}) {
  const { brand } = useParams<{ brand: string }>()
  // Only what THIS brand sells. The routes reject anything else anyway, but a
  // dropdown offering a product the brand cannot file is a bug report waiting.
  const allowedTypes = (isBrand(brand) ? brandConfig(brand).productTypes : ['pad']) as
    readonly ProductTypeValue[]
  // How many products this brand's landing page leads with. `0` hides the
  // control entirely: Lumi9's homepage product section is the size run, so
  // featuring a subset there is a hole in the size chart, not a feature.
  const featuredSlots = isBrand(brand) ? brandConfig(brand).featuredSlots : 0
  const router = useRouter()

  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [type, setType] = useState<ProductTypeValue>(initial?.type ?? allowedTypes[0])
  const [basePrice, setBasePrice] = useState(
    initial?.basePrice != null ? String(initial.basePrice) : '',
  )
  const [status, setStatus] = useState<'active' | 'draft' | 'archived'>(
    initial?.status ?? 'draft',
  )
  const [featured, setFeatured] = useState(initial?.featured ?? false)
  const [tag, setTag] = useState(initial?.tag ?? '')
  const [meta, setMeta] = useState(initial?.meta ?? '')
  const [flow, setFlow] = useState(initial?.flow ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [longDescription, setLongDescription] = useState(initial?.longDescription ?? '')

  const [images, setImages] = useState<ImageRow[]>(
    (initial?.images ?? []).map((url) => ({ _key: nextKey(), url })),
  )
  const [features, setFeatures] = useState<FeatureRow[]>(
    (initial?.features ?? []).map((f) => ({ _key: nextKey(), ...f })),
  )
  const [specs, setSpecs] = useState<SpecRow[]>(
    (initial?.specs ?? []).map((sp) => ({ _key: nextKey(), ...sp })),
  )
  const [variants, setVariants] = useState<VariantRow[]>(
    (initial?.variants ?? []).map(toVariantRow),
  )

  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Product images are UPLOADED, never typed. This used to sit beside a column
  // of free-text "Image URL" boxes, which meant an editor had to get the bytes
  // onto some host by other means first — and a typo shipped a product with a
  // broken photo. The picked file goes to /<brand>/api/upload, which verifies
  // the magic number (so a spoofed .svg/.html cannot be stored and served as
  // active content from our own origin), caps the size at 5MB, and puts the
  // object in the private S3 uploads bucket that CloudFront reads through
  // Origin Access Control. We keep only the URL it returns.
  //
  // The API enforces the same rule (see isManagedImageUrl in
  // @femi9/core/image-url): removing the box is the UI half, and a form is not
  // an authorisation boundary.
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

  /**
   * Reorder, which used to happen implicitly: the rows were free-text boxes, so
   * changing the order meant retyping the URLs into different rows. With the
   * boxes gone that is no longer possible, and position is not cosmetic — the
   * first image is the storefront thumbnail.
   */
  function moveImage(key: string, delta: number) {
    setImages((rows) => {
      const from = rows.findIndex((r) => r._key === key)
      const to = from + delta
      if (from < 0 || to < 0 || to >= rows.length) return rows
      const next = [...rows]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved!)
      return next
    })
  }
  /**
   * Move a keyed row within its list. Generic over the two editors below, which
   * both persist their ORDER as `position` - so dragging a benefit up is the
   * edit, not a cosmetic reshuffle.
   */
  function moveRow<T extends { _key: string }>(
    setter: React.Dispatch<React.SetStateAction<T[]>>,
    key: string,
    delta: number,
  ) {
    setter((rows) => {
      const i = rows.findIndex((r) => r._key === key)
      const j = i + delta
      if (i < 0 || j < 0 || j >= rows.length) return rows
      const next = [...rows]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
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
      const res = await fetch(`/${brand}/api/upload`, { method: 'POST', body: fd })
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
      // Sent only by a brand that HAS a rail. The field is optional on the
      // server and absent means "leave it alone", so a console without the
      // control can never quietly unfeature anything.
      ...(featuredSlots > 0 ? { featured } : {}),
      images: images.map((i) => i.url.trim()).filter(Boolean),
      // A row with no title (or no name) is an editor mid-thought; the service
      // requires one, so send only the complete rows rather than failing the
      // whole save on a blank line somebody was about to fill in.
      features: features
        .map((f) => ({ title: f.title.trim(), body: f.body.trim() }))
        .filter((f) => f.title),
      specs: specs
        .map((sp) => ({ key: sp.key.trim(), value: sp.value.trim() }))
        .filter((sp) => sp.key),
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
      const url = mode === 'create' ? `/${brand}/api/products` : `/${brand}/api/products/${productId}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        router.push(`/${brand}/products`)
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
      const res = await fetch(`/${brand}/api/products/${productId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push(`/${brand}/products`)
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
                onChange={(e) => setType(e.target.value as ProductTypeValue)}
              >
                {allowedTypes.map((value) => (
                  <option key={value} value={value}>
                    {TYPE_LABELS[value]}
                  </option>
                ))}
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
                onChange={(e) => {
                  const next = e.target.value as 'active' | 'draft' | 'archived'
                  setStatus(next)
                  // Un-publishing gives the rail slot back. Leaving the box
                  // ticked would send `featured: true` with a draft status and
                  // the save would be REFUSED — the admin changed one field and
                  // got an error about another, with no obvious way out.
                  if (next !== 'active') setFeatured(false)
                }}
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

          {featuredSlots > 0 && (
            <div className="adm-field" style={{ marginBottom: 0 }}>
              <label
                className="adm-label"
                htmlFor="p-featured"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <input
                  id="p-featured"
                  type="checkbox"
                  checked={featured}
                  // The two reasons it cannot be ticked, in the order they
                  // matter: a draft has no page to send a shopper to, and the
                  // rail only has so many slots. Unticking is never blocked —
                  // that is how a slot is given back.
                  disabled={!featured && (status !== 'active' || featuredUsed >= featuredSlots)}
                  onChange={(e) => setFeatured(e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--plum)' }}
                />
                Feature on the landing page
              </label>
              <span className="adm-help">
                {status !== 'active' && !featured
                  ? 'Only an active product can be featured.'
                  : `The landing page leads with ${featuredSlots} products. ${featuredUsed} of ${featuredSlots} ${
                      featuredUsed === 1 ? 'slot is' : 'slots are'
                    } taken by other products.`}
              </span>
              {err('featured') && <span className="adm-error">{err('featured')}</span>}
            </div>
          )}
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

      {/* Images — ordered, and every one of them uploaded here */}
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
            No images yet. Upload a PNG, JPEG or WebP (max 5MB) — the first image
            is used as the thumbnail.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {images.map((img, i) => (
              <div key={img._key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Plain <img>: the source is a runtime upload URL (S3 through
                    CloudFront, /uploads on a dev box), not a build-time asset
                    next/image could size. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt=""
                  style={{
                    width: 40,
                    height: 40,
                    flex: 'none',
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                    background: 'var(--canvas)',
                  }}
                />
                {/* The URL is shown, never typed. It is whatever /<brand>/api/upload
                    returned; the products API refuses anything else, so an
                    editable box here would only ever produce a rejected save. */}
                <code
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    color: 'var(--ink-soft, #666)',
                  }}
                  title={img.url}
                >
                  {img.url}
                </code>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={() => moveImage(img._key, -1)}
                  disabled={i === 0}
                  aria-label={`Move image ${i + 1} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--ghost adm-btn--sm"
                  onClick={() => moveImage(img._key, 1)}
                  disabled={i === images.length - 1}
                  aria-label={`Move image ${i + 1} later`}
                >
                  ↓
                </button>
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
      {/* Key Benefits + Specs - both were accepted by the API and read back into
          this editor long before anything here could SEND them. */}
      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">Benefits &amp; specs</h2>
        </div>

        <div className="adm-field" style={{ marginBottom: 0 }}>
          <div className="adm-card-head" style={{ marginBottom: 8 }}>
            <span className="adm-label" style={{ marginBottom: 0 }}>Key benefits</span>
            <button
              type="button"
              className="adm-btn adm-btn--secondary adm-btn--sm"
              onClick={() => setFeatures((rows) => [...rows, { _key: nextKey(), title: '', body: '' }])}
            >
              Add benefit
            </button>
          </div>

          {features.length === 0 ? (
            <span className="adm-help">No benefits yet. These are the panel beside the product photograph; order is what decides which side each one lands on.</span>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {features.map((row, i) => (
                <div key={row._key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    className="adm-input"
                    value={row.title}
                    onChange={(e) =>
                      setFeatures((rows) =>
                        rows.map((r) => (r._key === row._key ? { ...r, title: e.target.value } : r)),
                      )
                    }
                    placeholder="Title"
                    aria-label={`benefit ${i + 1} Title`}
                    style={{ flex: '0 0 34%' }}
                  />
                  <input
                    className="adm-input"
                    value={row.body}
                    onChange={(e) =>
                      setFeatures((rows) =>
                        rows.map((r) => (r._key === row._key ? { ...r, body: e.target.value } : r)),
                      )
                    }
                    placeholder="Description"
                    aria-label={`benefit ${i + 1} Description`}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => moveRow(setFeatures, row._key, -1)}
                    disabled={i === 0}
                    aria-label={`Move benefit ${i + 1} earlier`}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => moveRow(setFeatures, row._key, 1)}
                    disabled={i === features.length - 1}
                    aria-label={`Move benefit ${i + 1} later`}
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => setFeatures((rows) => rows.filter((r) => r._key !== row._key))}
                    aria-label={`Remove benefit ${i + 1}`}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 16 }} />

        <div className="adm-field" style={{ marginBottom: 0 }}>
          <div className="adm-card-head" style={{ marginBottom: 8 }}>
            <span className="adm-label" style={{ marginBottom: 0 }}>Specifications</span>
            <button
              type="button"
              className="adm-btn adm-btn--secondary adm-btn--sm"
              onClick={() => setSpecs((rows) => [...rows, { _key: nextKey(), key: '', value: '' }])}
            >
              Add spec
            </button>
          </div>

          {specs.length === 0 ? (
            <span className="adm-help">No specs yet. On Lumi9 these are load-bearing: the storefront reads the Size and Fits rows for every card, chip and size-guide entry.</span>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {specs.map((row, i) => (
                <div key={row._key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input
                    className="adm-input"
                    value={row.key}
                    onChange={(e) =>
                      setSpecs((rows) =>
                        rows.map((r) => (r._key === row._key ? { ...r, key: e.target.value } : r)),
                      )
                    }
                    placeholder="Name"
                    aria-label={`spec ${i + 1} Name`}
                    style={{ flex: '0 0 34%' }}
                  />
                  <input
                    className="adm-input"
                    value={row.value}
                    onChange={(e) =>
                      setSpecs((rows) =>
                        rows.map((r) => (r._key === row._key ? { ...r, value: e.target.value } : r)),
                      )
                    }
                    placeholder="Value"
                    aria-label={`spec ${i + 1} Value`}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => moveRow(setSpecs, row._key, -1)}
                    disabled={i === 0}
                    aria-label={`Move spec ${i + 1} earlier`}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => moveRow(setSpecs, row._key, 1)}
                    disabled={i === specs.length - 1}
                    aria-label={`Move spec ${i + 1} later`}
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => setSpecs((rows) => rows.filter((r) => r._key !== row._key))}
                    aria-label={`Remove spec ${i + 1}`}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

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
        <Link className="adm-btn adm-btn--secondary" href={`/${brand}/products`}>
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
