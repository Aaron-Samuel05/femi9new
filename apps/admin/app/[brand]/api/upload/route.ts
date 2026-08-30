import type { NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { badRequest, handle, ok, serviceUnavailable } from '@femi9/core/api'
import { requireConsoleApi } from '@/lib/api-guard'
import { ProviderConfigurationError } from '@femi9/core/runtime-mode'

/**
 * POST /<brand>/api/upload — accept a single image (multipart/form-data, field
 * `file`) and return { url }. Guarded by requireAdmin.
 *
 * PROVIDER SEAM (same swap-the-provider pattern as src/lib/razorpay.ts): the
 * storage backend is chosen from env, so callers never care where the bytes
 * land. When a cloud store is configured we upload there and return its CDN URL;
 * otherwise we persist to public/uploads and return a site-relative path.
 *
 * Local disk is limited to development. Production fails closed unless the
 * private S3 uploads bucket (preferred on ECS) or Cloudinary is configured.
 */

// fs + crypto need the Node runtime (not edge). Route handlers already default to
// Node here, but we pin it so a future edge default can't silently break uploads.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ~5MB cap — enough for a product photo, small enough to reject accidental
// full-resolution originals before we buffer them into memory.
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ brand: string }> }) {
  const auth = await requireConsoleApi((await params).brand, 'support')
  if (!auth.ok) return auth.response
  const { brand } = auth

  return handle(async () => {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')

    // A missing field, or a text field masquerading as `file`, is a bad request.
    if (!(file instanceof File)) return badRequest('No file uploaded')
    if (file.size === 0) return badRequest('The uploaded file is empty')
    if (file.size > MAX_BYTES) return badRequest('Image is too large (max 5MB)')

    const bytes = Buffer.from(await file.arrayBuffer())

    // NEVER trust the client-declared file.type or extension: an evil.html /
    // evil.svg with a spoofed `image/*` MIME would otherwise be stored under
    // /uploads and served as active content from our own origin (stored XSS).
    // Sniff the magic number to confirm a genuine raster image; this rejects
    // SVG and HTML (and anything else) outright.
    const sniffed = sniffImageType(bytes)
    if (!sniffed) return badRequest('Only PNG, JPEG, or WebP images are allowed')

    // Extension comes SOLELY from the verified type — never from file.name.
    const safeName = safeFileName(file.name, sniffed.ext)

    let url: string
    try {
      // Keyed under the AUTHENTICATED brand, never the URL segment. One bucket
      // serves both brands (these are published product photographs, not
      // customer data), but a per-brand prefix is what makes "delete everything
      // Lumi9 ever uploaded" a expressible operation rather than an archaeology
      // exercise over a flat, timestamp-ordered list.
      url = await storeImage(brand, bytes, safeName, sniffed.mime)
    } catch (error) {
      if (error instanceof ProviderConfigurationError) {
        return serviceUnavailable('Product image storage is not configured.')
      }
      throw error
    }
    return ok({ url })
  })
}

/** Pick the storage backend from env. Add a branch here to introduce a new
 *  provider; the route body never changes. */
async function storeImage(
  brand: string,
  bytes: Buffer,
  safeName: string,
  contentType: string,
): Promise<string> {
  if (process.env.UPLOADS_BUCKET) return uploadToS3(brand, bytes, safeName, contentType)
  if (process.env.CLOUDINARY_URL) return uploadToCloudinary(bytes, safeName, contentType)
  if (process.env.NODE_ENV === 'production') {
    throw new ProviderConfigurationError('Durable upload storage')
  }
  return saveToDisk(brand, bytes, safeName)
}

let s3: S3Client | undefined

/**
 * Production ECS storage. Objects stay private in S3; CloudFront's `/uploads/*`
 * behavior reads them through Origin Access Control and serves the site-relative
 * URL returned here.
 */
async function uploadToS3(
  brand: string,
  bytes: Buffer,
  safeName: string,
  contentType: string,
): Promise<string> {
  const bucket = process.env.UPLOADS_BUCKET as string
  const name = `${Date.now()}-${safeName}`
  // Still under `uploads/`, which is what both the bucket policy and
  // CloudFront's `/uploads/*` behavior are scoped to — adding a brand segment
  // below that changes neither.
  const key = `uploads/${brand}/${name}`
  s3 ??= new S3Client({})
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return `/${key}`
}

/** DEV / single-instance: write under public/uploads and return `/uploads/<name>`
 *  (served statically by Next). The timestamp prefix keeps names unique so a
 *  re-upload of the same filename doesn't clobber an earlier image. */
async function saveToDisk(brand: string, bytes: Buffer, safeName: string): Promise<string> {
  const name = `${Date.now()}-${safeName}`
  // `brand` reached here through requireConsoleApi, which narrows it with
  // isBrand() — so it is one of a closed set of literals and cannot traverse.
  const dir = join(process.cwd(), 'public', 'uploads', brand)
  await mkdir(dir, { recursive: true }) // the dir may not exist on a fresh clone
  await writeFile(join(dir, name), bytes)
  return `/uploads/${brand}/${name}`
}

/**
 * PRODUCTION (Cloudinary): a signed REST upload, hand-rolled with fetch +
 * node:crypto exactly like razorpay.ts avoids its SDK — the surface we need is
 * one POST, so we skip the `cloudinary` dependency. CLOUDINARY_URL is
 * `cloudinary://<api_key>:<api_secret>@<cloud_name>`.
 */
async function uploadToCloudinary(bytes: Buffer, safeName: string, contentType: string): Promise<string> {
  const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(
    process.env.CLOUDINARY_URL as string,
  )
  const timestamp = Math.floor(Date.now() / 1000)

  // Cloudinary signs the sorted params-to-sign joined by '&' with the secret
  // appended, SHA-1 hex. We only sign `timestamp`, so the string is trivial.
  const signature = createHash('sha1').update(`timestamp=${timestamp}${apiSecret}`).digest('hex')

  const fd = new FormData()
  // Wrap in a fresh Uint8Array so the Blob part is backed by a plain ArrayBuffer
  // (a Node Buffer's ArrayBufferLike doesn't satisfy the DOM BlobPart type).
  fd.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), safeName)
  fd.append('api_key', apiKey)
  fd.append('timestamp', String(timestamp))
  fd.append('signature', signature)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`)
  const body = (await res.json()) as { secure_url?: string }
  if (!body.secure_url) throw new Error('Cloudinary upload returned no URL')
  return body.secure_url
}

/**
 * Confirm the bytes are a genuine raster image by inspecting the magic number,
 * NOT the client-declared MIME. Returns the verified extension + canonical MIME,
 * or null for anything we don't allow (SVG, HTML, scripts, other formats).
 *   PNG : 89 50 4E 47
 *   JPEG: FF D8 FF
 *   WebP: 52 49 46 46 ("RIFF") .... 57 45 42 50 ("WEBP") at offset 8
 */
function sniffImageType(bytes: Buffer): { ext: 'png' | 'jpg' | 'webp'; mime: string } | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' }
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

/** Strip any path and the client-supplied extension, keep only a sanitized base
 *  name (alphanumerics/dashes) for readability, cap the length so a hostile or
 *  odd filename can't traverse directories or blow up the path, then append the
 *  verified extension — which comes SOLELY from the sniffed type, never the
 *  client filename. */
function safeFileName(name: string, ext: 'png' | 'jpg' | 'webp'): string {
  const base =
    (name.split(/[\\/]/).pop() || 'image')
      .replace(/\.[^.]*$/, '') // drop the client-supplied extension entirely
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // only alphanumerics/dashes survive
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'image'
  return `${base}.${ext}`
}
