import type { NextRequest } from 'next/server'
import { badRequest, handle, notFound, ok } from '@/lib/api'
import { getByCode } from '@/lib/services/affiliate'

export const dynamic = 'force-dynamic'

/**
 * GET /api/affiliate/me?code=CODE — public stats for a creator's own code.
 * Powers the storefront "Already a creator? Check your stats" lookup. Returns
 * 404 for an unknown/not-yet-allocated code so the UI can nudge the applicant to
 * wait for approval.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const code = req.nextUrl.searchParams.get('code')?.trim()
    if (!code) return badRequest('Enter your code to see your stats.')

    const stats = await getByCode(code)
    if (!stats) return notFound('We couldn’t find that code.')
    return ok(stats)
  })
}
