/**
 * Move Lumi9's product photos out of the container and into S3.
 *
 * Every `ProductImage.url` the seed ever wrote is `/assets/products/M-24.jpeg`
 * — a file inside the image. The storefront rendered it happily, so nothing
 * looked wrong; it just meant a product photo could not be changed without a
 * redeploy, and the console's uploader (which has always written to S3) was
 * only reachable by replacing an image that already existed.
 *
 * This uploads each bundled file to the uploads bucket and repoints the row.
 *
 *   DATABASE_URL_LUMI9=… UPLOADS_BUCKET=… npx tsx prisma/migrate-images-to-s3.ts
 *
 * Run it as a one-off ECS task the same way the seeds are launched (see
 * infra/terraform/README.md) — the bucket is private and the database is in the
 * VPC, so it cannot be run from a laptop.
 *
 * IDEMPOTENT, and safe to run before or after the deploy that removes the
 * bundled fallback: rows already on `/uploads/` are skipped, and the key is
 * derived from the file's content so re-running overwrites in place rather than
 * littering the bucket. `--dry-run` prints the plan and writes nothing.
 */
import { dbFor } from '@femi9/db'
import { isUploaded, uploadPublicFile, uploadsBucket } from './product-images'

const BRAND = 'lumi9' as const
const dryRun = process.argv.includes('--dry-run')

async function main() {
  if (!uploadsBucket() && !dryRun) {
    throw new Error('UPLOADS_BUCKET is not set — nothing to upload to.')
  }

  // dbFor, never a bare PrismaClient: isolation lives in the connection string,
  // and a bare client would read DATABASE_URL — which is Femi9's transitional
  // fallback, i.e. the other brand's rows.
  const db = dbFor(BRAND)
  try {
    const rows = await db.productImage.findMany({
      orderBy: [{ productId: 'asc' }, { position: 'asc' }],
      select: { id: true, url: true },
    })

    const stale = rows.filter((r) => !isUploaded(r.url))
    console.log(`${rows.length} image rows · ${stale.length} still on a bundled path`)
    if (stale.length === 0) {
      console.log('Nothing to do — every product photo is already in object storage.')
      return
    }

    // The same bundled file backs several rows (a product with fewer photos than
    // pack tiers repeats one), and the key is content-derived, so uploading once
    // per DISTINCT path keeps this to one PUT per actual image.
    const byPath = new Map<string, string>()

    for (const row of stale) {
      let url = byPath.get(row.url)
      if (!url) {
        if (dryRun) {
          console.log(`would upload ${row.url}`)
          byPath.set(row.url, row.url)
          continue
        }
        url = await uploadPublicFile(BRAND, row.url)
        byPath.set(row.url, url)
        console.log(`uploaded ${row.url} -> ${url}`)
      }
      if (!dryRun) await db.productImage.update({ where: { id: row.id }, data: { url } })
    }

    if (dryRun) {
      console.log(`\n--dry-run: ${byPath.size} distinct files, ${stale.length} rows would be repointed.`)
    } else {
      console.log(`\nDone: ${byPath.size} files uploaded, ${stale.length} rows repointed.`)
    }
  } finally {
    await db.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
