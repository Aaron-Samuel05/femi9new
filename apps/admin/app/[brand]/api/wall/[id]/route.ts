import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@femi9/core/api'
import { moduleGate, requireConsoleApi } from '@/lib/api-guard'
import { hasModule } from '@femi9/core/brands'
import { remove, setStatus } from '@femi9/core/services/admin/wall'

/**
 * /<brand>/api/wall/[id] — single-post moderation endpoint.
 *   PATCH  → set { status } (approve / hide / re-queue).
 *   DELETE → remove the post permanently.
 * Next 14.2: `params` is a plain synchronous object, not a Promise.
 */

const PatchSchema = z.object({
  status: z.enum(['pending', 'approved', 'hidden']),
})

export async function PATCH(req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand, 'support')
  if (!auth.ok) return auth.response
  const { brand } = auth

  // A brand without this module has no rows here and must not learn it exists:
  // 404, the same answer requireConsole gives the page. Guarding only the page
  // left this endpoint answering for a brand whose console has no link to it.
  const gated = moduleGate(hasModule(brand, 'community'))
  if (gated) return gated

  return handle(async () => {
    const raw = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const row = await setStatus(brand, params.id, parsed.data.status)
    // Service returns null when the post id doesn't exist.
    if (!row) return notFound('Post not found')
    return ok({ row })
  })
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ brand: string; id: string }> }) {
  const params = await props.params;
  const auth = await requireConsoleApi((await props.params).brand, 'support')
  if (!auth.ok) return auth.response
  const { brand } = auth

  // A brand without this module has no rows here and must not learn it exists:
  // 404, the same answer requireConsole gives the page. Guarding only the page
  // left this endpoint answering for a brand whose console has no link to it.
  const gated = moduleGate(hasModule(brand, 'community'))
  if (gated) return gated

  return handle(async () => {
    const res = await remove(brand, params.id)
    if (!res) return notFound('Post not found')
    return ok(res)
  })
}
