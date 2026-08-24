import { NextResponse } from 'next/server'
import { BRANDS, dbFor, type Brand } from '@femi9/db'
import { platformDb } from '@femi9/db-platform'

/**
 * The console's health check — unauthenticated, and deliberately so.
 *
 * The ALB has no credentials and never will, so this route is excluded from the
 * matcher in proxy.ts. That means it is worth being explicit about what it does
 * NOT return: no admin names, no brand totals, no secret values — only whether
 * a connection opened. Nothing here is more sensitive than the fact that the
 * console exists, which the DNS name already gives away.
 *
 * ── What blocks ────────────────────────────────────────────────────────────
 * The platform database. It holds who may sign in; without it nobody can, and
 * every page is a redirect to a login that cannot succeed. AUTH_SECRET, for the
 * same reason — it signs the admin cookie.
 *
 * ── What only warns ────────────────────────────────────────────────────────
 * A brand's own schema. If Lumi9's database is unreachable the Lumi9 sections
 * break, but the Femi9 sections are fine and an admin can still sign in and
 * work. Failing the probe would take the whole console down to report that half
 * of it is degraded, which trades a partial outage for a total one.
 */

export const dynamic = 'force-dynamic'

async function brandReachable(brand: Brand): Promise<boolean> {
  try {
    await dbFor(brand).product.count()
    return true
  } catch (err) {
    console.error(`[health] ${brand} schema unreachable`, err)
    return false
  }
}

export async function GET() {
  // The platform client resolves its URL lazily and throws when it is missing,
  // so constructing it is itself part of the check.
  let platform = false
  try {
    await platformDb().adminUser.count()
    platform = true
  } catch (err) {
    console.error('[health] platform db check failed', err)
  }

  const reachable = await Promise.all(BRANDS.map(brandReachable))
  const brands = Object.fromEntries(BRANDS.map((b, i) => [b, reachable[i]])) as Record<Brand, boolean>

  const blocking: string[] = []
  if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SECRET?.trim()) {
    blocking.push('AUTH_SECRET')
  }

  const degradedBrands = BRANDS.filter((_, i) => !reachable[i])
  const ready = platform && blocking.length === 0

  return NextResponse.json(
    {
      status: ready ? (degradedBrands.length ? 'ok-degraded-brand' : 'ok') : 'degraded',
      platform,
      brands,
      ...(blocking.length ? { missingOrInvalid: blocking } : {}),
      ...(degradedBrands.length ? { warnings: degradedBrands.map((b) => `${b} schema unreachable`) } : {}),
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  )
}
