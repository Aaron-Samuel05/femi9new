import { z } from 'zod'
import { badRequest, created, handle, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import {
  createSubscription,
  listForUser,
  CadenceNotFoundError,
  VariantNotFoundError,
} from '@/lib/services/subscriptions'

/**
 * Subscriptions collection endpoint for the signed-in customer.
 *   GET  → the user's subscriptions.
 *   POST → start a subscription (from the product page's "Subscribe & save").
 *
 * Both require a customer session. The auth check runs BEFORE the body is read so
 * an unauthenticated POST returns 401 without creating anything — the product page
 * relies on that 401 to bounce guests to /login.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  variantId: z.string().min(1),
  qty: z.number().int().min(1).max(99).default(1),
  // Cadence code as seeded: 'cycle' | '4w' | '6w'. Validated against the DB in the service.
  cadenceCode: z.string().min(1),
})

export async function GET() {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()
    return ok({ subscriptions: await listForUser(u.sub) })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()

    const parsed = createSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid subscription', parsed.error.flatten())

    try {
      const subscription = await createSubscription(u.sub, parsed.data)
      return created({ subscription })
    } catch (err) {
      // Stale cadence code / product option is a client problem, not a 500.
      if (err instanceof CadenceNotFoundError || err instanceof VariantNotFoundError) {
        return badRequest(err.message)
      }
      throw err
    }
  })
}
