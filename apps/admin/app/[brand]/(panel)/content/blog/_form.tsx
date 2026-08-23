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
  // Already newline-joined from the DB String[] by the edit page.
  body: string
}

interface Category {
  id: string
  name: string
}

type FieldErrors = Record<string, string[] | undefined>

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
            placeholder={'One block per line.\n## Start a line with two hashes for a heading\n> Start a line with a chevron for a pull-quote'}
            style={{ minHeight: 260, fontFamily: 'var(--sans)' }}
          />
          <span className="adm-help">
            Each line is one paragraph. Prefix a line with “## ” for a heading or “&gt; ” for a
            pull-quote. Blank lines are ignored.
          </span>
        </div>
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
