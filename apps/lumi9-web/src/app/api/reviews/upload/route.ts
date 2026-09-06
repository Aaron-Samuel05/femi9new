import type { NextRequest } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { badRequest, handle, ok, serviceUnavailable } from '@femi9/core/api'
import { clientIp, rateLimit, tooManyRequests } from '@femi9/core/rate-limit'
import { ProviderConfigurationError } from '@femi9/core/runtime-mode'

/**
 * POST /api/reviews/upload — accept ONE file (multipart, field `file`), sniff
 * its magic number, store it in the shared uploads bucket under
 * `uploads/lumi9/reviews/…`, and return { url, kind }.
 *
 * Unlike the admin upload endpoint (which requires a signed-in operator), this
 * one is PUBLIC — shoppers uploading a photo of their baby wearing the pack.
 * That widens the surface, so it is:
 *
 *   • Rate-limited per IP (6 uploads per minute — 4 images + 1 video + slack)
 *   • Magic-number sniffed — a spoofed .svg / .html / .exe never reaches disk
 *   • Size-capped per verified type — 5MB image, 25MB video, checked AFTER
 *     the sniff so a caller cannot claim `.mp4` to buy the video ceiling for
 *     an executable
 *   • Written to `uploads/lumi9/reviews/`, never elsewhere — so "purge every
 *     review upload" is a bucket-prefix delete, not a hunt
 *
 * The URL returned here goes into the review's submit call. Media is only
 * SHOWN when the parent review is approved — a moderator hides an abusive
 * review and its photos disappear with it (the storefront never queries
 * `Review.media` on unapproved rows).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 25 * 1024 * 1024
// Memory guard: nothing bigger than this is buffered, whatever the claimed
// type. Set to the highest per-type ceiling so the check works before we know
// what the file actually is.
const MAX_ANY_BYTES = MAX_VIDEO_BYTES

type MediaKind = 'image' | 'video'
interface Sniffed {
  kind: MediaKind
  ext: 'png' | 'jpg' | 'webp' | 'gif' | 'mp4' | 'mov' | 'webm'
  mime: string
  limit: number
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    // 6 per minute is enough for a real shopper who's editing their picks.
    const rl = await rateLimit(`review-upload:${clientIp(req)}`, 6, 60_000)
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return badRequest('No file uploaded')
    if (file.size === 0) return badRequest('The uploaded file is empty')
    if (file.size > MAX_ANY_BYTES) {
      return badRequest(`File is too large (max ${Math.round(MAX_ANY_BYTES / (1024 * 1024))}MB)`)
    }

    const bytes = Buffer.from(await file.arrayBuffer())
    const sniffed = sniffMedia(bytes)
    if (!sniffed) {
      return badRequest('Only JPG, PNG, WebP, GIF images or MP4/MOV/WebM videos are allowed')
    }
    if (bytes.length > sniffed.limit) {
      return badRequest(
        `${sniffed.kind === 'video' ? 'Video' : 'Image'} is too large (max ${Math.round(sniffed.limit / (1024 * 1024))}MB)`,
      )
    }

    const safeName = safeFileName(file.name, sniffed.ext)
    try {
      const url = await store(bytes, safeName, sniffed.mime)
      return ok({ url, kind: sniffed.kind })
    } catch (err) {
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable('Review upload storage is not configured.')
      }
      throw err
    }
  })
}

// ─────────────────────────────── Storage ─────────────────────────────────

async function store(bytes: Buffer, safeName: string, contentType: string): Promise<string> {
  if (process.env.UPLOADS_BUCKET) return uploadToS3(bytes, safeName, contentType)
  if (process.env.NODE_ENV === 'production') {
    throw new ProviderConfigurationError('Review upload storage')
  }
  return saveToDisk(bytes, safeName)
}

let s3: S3Client | undefined
async function uploadToS3(bytes: Buffer, safeName: string, contentType: string): Promise<string> {
  const bucket = process.env.UPLOADS_BUCKET as string
  const name = `${Date.now()}-${safeName}`
  const key = `uploads/lumi9/reviews/${name}`
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

async function saveToDisk(bytes: Buffer, safeName: string): Promise<string> {
  const name = `${Date.now()}-${safeName}`
  const dir = join(process.cwd(), 'public', 'uploads', 'lumi9', 'reviews')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), bytes)
  return `/uploads/lumi9/reviews/${name}`
}

// ─────────────────────────────── Sniffing ────────────────────────────────

/**
 * Recognise raster images and common phone-video containers by magic number,
 * NEVER by the client-declared MIME or extension. Anything else is rejected.
 *
 * Images:
 *   PNG  : 89 50 4E 47
 *   JPEG : FF D8 FF
 *   WebP : 52 49 46 46 ("RIFF") … 57 45 42 50 ("WEBP") at offset 8
 *   GIF  : "GIF87a" | "GIF89a"
 * Videos:
 *   MP4  : offset 4 = "ftyp" (isom, mp42, avc1, iso5, dash, MSNV, …)
 *   MOV  : offset 4 = "ftyp" with brand starting "qt" — iPhone .mov files
 *   WebM : 1A 45 DF A3 (Matroska/EBML header)
 */
function sniffMedia(b: Buffer): Sniffed | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { kind: 'image', ext: 'png', mime: 'image/png', limit: MAX_IMAGE_BYTES }
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { kind: 'image', ext: 'jpg', mime: 'image/jpeg', limit: MAX_IMAGE_BYTES }
  }
  if (
    b.length >= 12 &&
    b.slice(0, 4).toString('ascii') === 'RIFF' &&
    b.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { kind: 'image', ext: 'webp', mime: 'image/webp', limit: MAX_IMAGE_BYTES }
  }
  if (b.length >= 6 && b.slice(0, 6).toString('ascii').match(/^GIF8[79]a$/)) {
    return { kind: 'image', ext: 'gif', mime: 'image/gif', limit: MAX_IMAGE_BYTES }
  }
  // MP4 / MOV — 'ftyp' box at offset 4, followed by a 4-byte brand.
  if (b.length >= 12 && b.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = b.slice(8, 12).toString('ascii')
    if (brand.startsWith('qt')) {
      return { kind: 'video', ext: 'mov', mime: 'video/quicktime', limit: MAX_VIDEO_BYTES }
    }
    // Every other ftyp brand we accept as MP4 — isom, mp42, avc1, iso5, dash,
    // MSNV (phone camera output), etc. Any brand a browser can play.
    return { kind: 'video', ext: 'mp4', mime: 'video/mp4', limit: MAX_VIDEO_BYTES }
  }
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    return { kind: 'video', ext: 'webm', mime: 'video/webm', limit: MAX_VIDEO_BYTES }
  }
  return null
}

/**
 * Produce a filesystem-safe name whose extension is the SNIFFED type. The
 * caller's `name` is preserved as a slug prefix for readability — the same
 * shape the admin uploader uses — but the extension it claims is discarded.
 */
function safeFileName(raw: string, ext: string): string {
  const stem = (raw.split('.').slice(0, -1).join('.') || raw)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${stem || 'file'}.${ext}`
}
