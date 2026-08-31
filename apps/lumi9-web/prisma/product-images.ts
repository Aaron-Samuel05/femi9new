/**
 * Putting a product photo into S3, and getting back the URL the storefront reads.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * The console has uploaded to S3 for a while (`/<brand>/api/upload` → the
 * private uploads bucket, served back through CloudFront's `/uploads/*`
 * behavior over Origin Access Control). The SEED did not: it wrote
 * `packImage(size, count)` - `/assets/products/M-24.jpeg`, a file baked into the
 * container - straight into `ProductImage.url`. So every seeded row pointed at
 * the image rather than at object storage, and `catalog.server.ts` fell back to
 * the same bundled path for a product with no rows at all.
 *
 * That is two separate ways for a product photo to come from somewhere other
 * than S3, and neither reports anything: the page renders a perfectly good
 * image, it is just one nobody can replace without a redeploy.
 *
 * Both halves are closed now - the loader has no fallback, and this module is
 * how bytes reach the bucket from a script.
 *
 * ── Keys ────────────────────────────────────────────────────────────────────
 * `uploads/<brand>/<name>`, matching the console byte for byte. The `uploads/`
 * prefix is what both the bucket policy and the CloudFront behavior are scoped
 * to, and the brand segment is what makes "everything Lumi9 ever uploaded" an
 * expressible operation. The returned URL is site-relative for the same reason
 * the console's is: the bucket is private and is only ever reached through the
 * distribution in front of it.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/** Where `public/` is, relative to this file - the seed runs from the app root. */
const PUBLIC_DIR = join(process.cwd(), 'public')

let s3: S3Client | undefined

export function uploadsBucket(): string | undefined {
  return process.env.UPLOADS_BUCKET || undefined
}

/**
 * Upload one bundled `public/…` file and return its `/uploads/…` URL.
 *
 * The key is derived from the file's CONTENT, not from the clock: a seed is
 * meant to be re-runnable, and `Date.now()` would write a fresh object on every
 * run and leave the previous one orphaned in the bucket with nothing pointing
 * at it. Same bytes, same key, so a re-seed overwrites in place and is free.
 */
export async function uploadPublicFile(brand: string, publicPath: string): Promise<string> {
  const bucket = uploadsBucket()
  if (!bucket) throw new Error('UPLOADS_BUCKET is not set')

  const bytes = await readFile(join(PUBLIC_DIR, publicPath.replace(/^\//, '')))
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
  const base = publicPath.split('/').pop() ?? 'image.jpeg'
  const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : 'jpeg'
  const stem = base.replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const key = `uploads/${brand}/${stem}-${digest}.${ext}`

  s3 ??= new S3Client({})
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentTypeFor(ext),
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  )
  return `/${key}`
}

function contentTypeFor(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/** Already in object storage? Rows the console wrote look like this. */
export function isUploaded(url: string): boolean {
  return url.startsWith('/uploads/') || url.startsWith('http')
}
