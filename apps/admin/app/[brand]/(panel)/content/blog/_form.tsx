'use client'

import { useRef, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Shared blog-post editor used by both create (/content/blog/new) and edit
 * (/content/blog/[id]). The body is authored as a single textarea — one block
 * per line, a leading "## " marking a heading and "> " a pull-quote — and the
 * service splits/joins that to the String[] column, so the form only ever holds
 * a plain string.
 *
 * readTime is held as a string (an <input> yields strings and we want to allow a
 * transiently-empty box); it's coerced when the payload is built.
 */

export interface BlogFormValues {
  title: string
  slug: string
  categoryId: string
  excerpt: string
  author: string
  readTime: number
  tone: string
  image: string
  featured: boolean
  status: 'pending' | 'approved' | 'hidden'
  // Already joined from the DB String[] by the edit page — with joinBody, which
  // separates blocks by a BLANK line. Joining with a single newline instead
  // collapses the whole article into one block on the next save.
  body: string
  // ── The <head> layer ───────────────────────────────────────────────────
  // Optional everywhere: a post saved without them renders exactly as before,
  // because the storefront falls back to the title and the excerpt.
  metaTitle: string
  imageAlt: string
  /** Comma-separated in the form; a string[] column in the database. */
  keywords: string
  cta: string
  faqs: { question: string; answer: string }[]
}

interface Category {
  id: string
  name: string
}

interface FaqRow {
  _key: string
  question: string
  answer: string
}

type FieldErrors = Record<string, string[] | undefined>

/** Blocks are separated by a BLANK line - see splitBody in blog-admin.ts. */
const PLACEHOLDER_BODY = [
  'One block per blank-line-separated chunk.',
  '## Two hashes start a heading',
  '> A chevron starts a pull-quote',
  '\u2022 A bullet\n\u2022 and another, in the SAME block',
].join('\n\n')

let faqKeySeq = 0
const nextKey = () => `faq-${++faqKeySeq}`

export default function PostForm({
  mode,
  postId,
  categories,
  initial,
}: {
  mode: 'create' | 'edit'
  postId?: string
  categories: Category[]
  initial?: Partial<BlogFormValues>
}) {
  const { brand } = useParams<{ brand: string }>()
  const router = useRouter()

  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? categories[0]?.id ?? '',
  )
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [readTime, setReadTime] = useState(
    initial?.readTime != null ? String(initial.readTime) : '4',
  )
  const [tone, setTone] = useState(initial?.tone ?? '')
  const [image, setImage] = useState(initial?.image ?? '')
  const [featured, setFeatured] = useState(initial?.featured ?? false)
  const [status, setStatus] = useState<'pending' | 'approved' | 'hidden'>(
    initial?.status ?? 'approved',
  )
  const [body, setBody] = useState(initial?.body ?? '')
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? '')
  const [imageAlt, setImageAlt] = useState(initial?.imageAlt ?? '')
  const [keywords, setKeywords] = useState(initial?.keywords ?? '')
  const [cta, setCta] = useState(initial?.cta ?? '')
  // Rows carry a stable key so React does not reorder inputs by index when one
  // is removed — the same reason the product form's variant rows have one.
  const [faqs, setFaqs] = useState<FaqRow[]>(
    (initial?.faqs ?? []).map((faq) => ({ _key: nextKey(), ...faq })),
  )

  function updateFaq(key: string, patch: Partial<FaqRow>) {
    setFaqs((rows) => rows.map((row) => (row._key === key ? { ...row, ...patch } : row)))
  }

  /** Order is what `position` persists, so moving a row IS the edit. */
  function moveFaq(key: string, delta: number) {
    setFaqs((rows) => {
      const i = rows.findIndex((row) => row._key === key)
      const j = i + delta
      if (i < 0 || j < 0 || j >= rows.length) return rows
      const next = [...rows]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // The cover image is UPLOADED, never typed. This field used to be a free-text
  // "Image URL" box, which meant an editor had to get the bytes onto a host by
  // some other means first — and a typo silently shipped a post with a broken
  // cover. The picked file now goes to /<brand>/api/upload, which verifies the
  // magic number (so a spoofed .svg/.html can't be stored and served as active
  // content from our origin), caps the size at 5MB, and persists to S3 —
  // Cloudinary or public/uploads being the other provider branches. We keep only
  // the URL it returns, so the save path is identical to what it always was.
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  async function onUploadCover(e: React.ChangeEvent<HTMLInputElement>) {
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
        // The route's messages are already editor-readable ("Image is too large
        // (max 5MB)", "Only PNG, JPEG, or WebP images are allowed", and the
        // 503 when storage is unconfigured), so surface them verbatim.
        setUploadError(body?.error || 'Upload failed. Please try again.')
        return
      }
      setImage(body.url as string)
    } catch {
      setUploadError('Network error - please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    setErrors({})

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      categoryId,
      excerpt: excerpt.trim(),
      author: author.trim(),
      readTime: readTime.trim() === '' ? 4 : Number(readTime),
      tone: tone.trim(),
      image: image.trim() || null,
      featured,
      status,
      // Raw textarea text — the service splits it into the String[] column.
      body,
      metaTitle: metaTitle.trim(),
      imageAlt: imageAlt.trim(),
      // Sent as typed; the service splits, trims and de-duplicates. One
      // definition of "what a keyword list is", on the side that enforces it.
      keywords,
      cta: cta.trim(),
      // Half-filled rows are dropped by the service rather than refused — an
      // editor mid-thought should not be blocked from saving the rest.
      faqs: faqs.map((row) => ({ question: row.question, answer: row.answer })),
    }

    try {
      const url = mode === 'create' ? `/${brand}/api/blog` : `/${brand}/api/blog/${postId}`
      const res = await fetch(url, {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        router.push(`/${brand}/content/blog`)
        router.refresh()
        return
      }

      const resBody = await res.json().catch(() => ({}))
      // zod's flatten() → { formErrors, fieldErrors }; surface both.
      if (resBody?.details?.fieldErrors) setErrors(resBody.details.fieldErrors as FieldErrors)
      setFormError(
        resBody?.details?.formErrors?.[0] || resBody?.error || 'Could not save. Please try again.',
      )
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!postId) return
    if (!confirm('Delete this post? This cannot be undone.')) return
    setDeleting(true)
    setFormError(null)
    try {
      const res = await fetch(`/${brand}/api/blog/${postId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push(`/${brand}/content/blog`)
        router.refresh()
        return
      }
      const resBody = await res.json().catch(() => ({}))
      setFormError(resBody?.error || 'Could not delete this post.')
    } catch {
      setFormError('Network error - please try again.')
    } finally {
      setDeleting(false)
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

      {/* Two-column core: Details + Publishing. Collapses to one column when narrow. */}
      <div
        style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))' }}
      >
        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Details</h2>
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="b-title">Title</label>
            <input
              id="b-title"
              className="adm-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Understanding your cycle"
            />
            {err('title') && <span className="adm-error">{err('title')}</span>}
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="b-slug">Slug</label>
            <input
              id="b-slug"
              className="adm-input"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Auto-generated from title if left blank"
            />
            <span className="adm-help">Used in the storefront URL. Must be unique.</span>
            {err('slug') && <span className="adm-error">{err('slug')}</span>}
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="b-category">Category</label>
            <select
              id="b-category"
              className="adm-select"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categories.length === 0 && <option value="">No categories available</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {err('categoryId') && <span className="adm-error">{err('categoryId')}</span>}
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="b-excerpt">Excerpt</label>
            <textarea
              id="b-excerpt"
              className="adm-textarea"
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="A one-line summary shown on the blog index."
              style={{ minHeight: 72 }}
            />
            {err('excerpt') && <span className="adm-error">{err('excerpt')}</span>}
          </div>

          <div className="adm-field" style={{ marginBottom: 0 }}>
            {/* Not a <label htmlFor>: the control is a button driving a hidden
                picker, so there is no single input for a label to address. */}
            <span className="adm-label">Cover image</span>

            {image ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                {/* Plain <img>: the source is a runtime upload URL (S3/CDN or
                    /uploads in dev), not a build-time known asset. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt=""
                  style={{
                    width: 104,
                    height: 68,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid rgba(52,32,78,.13)',
                    background: 'rgba(52,32,78,.04)',
                  }}
                />
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Replace'}
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--secondary adm-btn--sm"
                  onClick={() => {
                    setImage('')
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
                onClick={() => coverInputRef.current?.click()}
                disabled={uploading}
                style={{ alignSelf: 'flex-start', marginBottom: 8 }}
              >
                {uploading ? 'Uploading…' : 'Upload cover image'}
              </button>
            )}

            {/* Hidden native picker driven by the buttons above. `accept` mirrors
                exactly what the route's magic-number sniff allows, so the file
                dialog cannot offer a type the server will reject. */}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onUploadCover}
              style={{ display: 'none' }}
            />

            {uploadError && <span className="adm-error">{uploadError}</span>}
            <span className="adm-help">
              Optional. PNG, JPEG or WebP up to 5MB, stored in S3 and served through the CDN.
            </span>
          </div>

          {/* Beside the upload it describes, not in the SEO card: alt text is a
              property of THIS picture, and an editor who replaces the cover has
              to be looking at the sentence that no longer matches it. */}
          <div className="adm-field" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="adm-label" htmlFor="b-image-alt">Cover alt text</label>
            <input
              id="b-image-alt"
              className="adm-input"
              value={imageAlt}
              onChange={(e) => setImageAlt(e.target.value)}
              placeholder="What the photograph shows"
            />
            <span className="adm-help">
              Read aloud in place of the image. Falls back to the title - never to an empty
              string, which would tell a screen reader the cover is decorative.
            </span>
          </div>
        </section>

        <section className="adm-card">
          <div className="adm-card-head">
            <h2 className="adm-card-title">Publishing</h2>
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="b-author">Author</label>
            <input
              id="b-author"
              className="adm-input"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Dr. Meera Rao"
            />
            {err('author') && <span className="adm-error">{err('author')}</span>}
          </div>

          <div className="adm-row">
            <div className="adm-field">
              <label className="adm-label" htmlFor="b-readtime">Read time (min)</label>
              <input
                id="b-readtime"
                className="adm-input"
                inputMode="numeric"
                value={readTime}
                onChange={(e) => setReadTime(e.target.value)}
                placeholder="4"
              />
              {err('readTime') && <span className="adm-error">{err('readTime')}</span>}
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="b-tone">Tone</label>
              <input
                id="b-tone"
                className="adm-input"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Warm · reassuring"
              />
            </div>
          </div>

          <div className="adm-field">
            <label className="adm-label" htmlFor="b-status">Status</label>
            <select
              id="b-status"
              className="adm-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'pending' | 'approved' | 'hidden')}
            >
              <option value="approved">Approved (published)</option>
              <option value="pending">Pending (in review)</option>
              <option value="hidden">Hidden</option>
            </select>
          </div>

          <div className="adm-field" style={{ marginBottom: 0 }}>
            <label className="adm-label" htmlFor="b-featured">Featured</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="b-featured"
                type="checkbox"
                checked={featured}
                onChange={(e) => setFeatured(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--plum)' }}
              />
              <span className="adm-help">Highlight this post on the blog landing.</span>
            </div>
          </div>
        </section>
      </div>

      {/* Body — one block per line */}
      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">Body</h2>
        </div>
        <div className="adm-field" style={{ marginBottom: 0 }}>
          <label className="adm-label" htmlFor="b-body">Content</label>
          <textarea
            id="b-body"
            className="adm-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={PLACEHOLDER_BODY}
            style={{ minHeight: 260, fontFamily: 'var(--sans)' }}
          />
          <span className="adm-help">
            Separate blocks with a BLANK LINE. Prefix a block with “## ” for a heading, “### ”
            for a sub-heading or “&gt; ” for a pull-quote. A bullet list is ONE block: put every
            “• ” on its own line with no blank line between them, or the storefront renders
            each bullet as a list of its own.
          </span>
        </div>
      </section>

      {/* SEO - drives <title>, Open Graph and JSON-LD, never the card */}
      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">Search &amp; social</h2>
        </div>

        <div className="adm-field">
          <label className="adm-label" htmlFor="b-meta-title">Meta title</label>
          <input
            id="b-meta-title"
            className="adm-input"
            value={metaTitle}
            onChange={(e) => setMetaTitle(e.target.value)}
            placeholder="Leave blank to use the post title"
          />
          <span className="adm-help">
            The &lt;title&gt; and the Open Graph headline. Write it to carry the brand - the
            storefront does not append one to this field.
          </span>
          {err('metaTitle') && <span className="adm-error">{err('metaTitle')}</span>}
        </div>

        <div className="adm-field">
          <label className="adm-label" htmlFor="b-keywords">Keywords</label>
          <textarea
            id="b-keywords"
            className="adm-textarea"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="baby diapers, breathable baby diapers, diaper pants for baby"
            style={{ minHeight: 72 }}
          />
          <span className="adm-help">
            Comma- or line-separated. Emitted as the keywords meta tag and in the article&rsquo;s
            JSON-LD. Duplicates and blanks are dropped on save.
          </span>
        </div>

        <div className="adm-field" style={{ marginBottom: 0 }}>
          <label className="adm-label" htmlFor="b-cta">Closing call-to-action</label>
          <textarea
            id="b-cta"
            className="adm-textarea"
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="Leave blank to use the site's standard closing paragraph"
            style={{ minHeight: 72 }}
          />
          <span className="adm-help">
            The paragraph in the block at the foot of the article, above the shop buttons.
          </span>
        </div>
      </section>

      {/* FAQs - rendered on the page AND emitted as FAQPage structured data */}
      <section className="adm-card" style={{ marginTop: 16 }}>
        <div className="adm-card-head">
          <h2 className="adm-card-title">Frequently asked questions</h2>
          <button
            type="button"
            className="adm-btn adm-btn--secondary adm-btn--sm"
            onClick={() => setFaqs((rows) => [...rows, { _key: nextKey(), question: '', answer: '' }])}
          >
            Add question
          </button>
        </div>

        {faqs.length === 0 ? (
          <span className="adm-help">
            No questions. Any you add appear under the article AND as FAQPage structured data -
            which is why they are always visible on the page: markup for an answer a crawler
            cannot find in the document is a manual-action risk, not a shortcut to a rich result.
          </span>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {faqs.map((faq, i) => (
              <div
                key={faq._key}
                style={{
                  display: 'grid',
                  gap: 8,
                  padding: 12,
                  border: '1px solid rgba(52,32,78,.13)',
                  borderRadius: 8,
                }}
              >
                <input
                  className="adm-input"
                  value={faq.question}
                  onChange={(e) => updateFaq(faq._key, { question: e.target.value })}
                  placeholder={`Question ${i + 1}`}
                  aria-label={`Question ${i + 1}`}
                />
                <textarea
                  className="adm-textarea"
                  value={faq.answer}
                  onChange={(e) => updateFaq(faq._key, { answer: e.target.value })}
                  placeholder="Answer"
                  aria-label={`Answer ${i + 1}`}
                  style={{ minHeight: 72 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => moveFaq(faq._key, -1)}
                    disabled={i === 0}
                    aria-label={`Move question ${i + 1} earlier`}
                  >
                    &uarr;
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => moveFaq(faq._key, 1)}
                    disabled={i === faqs.length - 1}
                    aria-label={`Move question ${i + 1} later`}
                  >
                    &darr;
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--secondary adm-btn--sm"
                    onClick={() => setFaqs((rows) => rows.filter((row) => row._key !== faq._key))}
                    aria-label={`Remove question ${i + 1}`}
                    style={{ marginLeft: 'auto' }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <span className="adm-help" style={{ marginTop: 8 }}>
          A row missing its question or its answer is dropped on save.
        </span>
      </section>

      {/* Actions */}
      <div
        className="adm-toolbar"
        style={{ marginTop: 20, marginBottom: 0, justifyContent: 'flex-start' }}
      >
        <button type="submit" className="adm-btn adm-btn--primary" disabled={saving || deleting}>
          {saving ? 'Saving…' : mode === 'create' ? 'Create post' : 'Save changes'}
        </button>
        <Link className="adm-btn adm-btn--secondary" href={`/${brand}/content/blog`}>
          Cancel
        </Link>
        {mode === 'edit' && (
          <button
            type="button"
            className="adm-btn adm-btn--danger"
            onClick={onDelete}
            disabled={saving || deleting}
            style={{ marginLeft: 'auto' }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </form>
  )
}
