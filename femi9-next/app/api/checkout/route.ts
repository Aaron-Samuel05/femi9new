import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { badRequest, created, handle, serviceUnavailable } from '@/lib/api'
import { getGuestToken } from '@/lib/session'
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { orderToken } from '@/lib/order-token'
import { EmptyCartError, OutOfStockError, placeOrder } from '@/lib/services/checkout'
import { ProviderConfigurationError } from '@/lib/runtime-mode'

/**
 * POST /api/checkout — turn the guest's cart into a pending order.
 *
 * Money is never taken from the body; placeOrder recomputes it from the DB.
 * We only validate the shipping/customer fields here. Domain errors map to
 * precise statuses so the storefront can show the right message inline:
 *   EmptyCartError  → 400   OutOfStockError → 409 (with the item name)
 */

// Empty optional text fields arrive as '' from the form; normalise to undefined
// so `.optional()` validators don't reject a blank the user simply left empty.
const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const CheckoutSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(120),
  phone: z.string().trim().regex(/^\d{10}$/, 'Enter a valid 10-digit mobile number'),
  email: z.preprocess(blankToUndef, z.string().trim().email('Enter a valid email').optional()),
  line: z.string().trim().min(1, 'Please enter your address').max(300),
  city: z.string().trim().min(1, 'Please enter your city').max(120),
  state: z.preprocess(blankToUndef, z.string().trim().max(120).optional()),
  pincode: z.preprocess(blankToUndef, z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit pincode').optional()),
})

/** 409 helper — api.ts has no conflict envelope, so build it inline. */
function conflict(error: string) {
  return NextResponse.json({ error }, { status: 409 })
}

export async function POST(req: NextRequest) {
  // Throttle order placement per client IP to blunt spam / double-submit abuse.
  const rl = await rateLimit('checkout:' + clientIp(req), 10, 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec)

  return handle(async () => {
    // No guest cookie means no cart was ever created — treat as empty.
    const token = await getGuestToken()
    if (!token) return badRequest('Your bag is empty.')

    const raw = await req.json().catch(() => null)
    const parsed = CheckoutSchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    try {
      // Returns { orderNo, payment } — the payment intent (razorpay order id,
      // amount, publishable key, configured flag) the client uses to open
      // Checkout or, in mock mode, to POST the dev verify call.
      const result = await placeOrder(token, parsed.data)
      // Hand back an unguessable capability token so the confirmation page can
      // authorize a guest (no session) without exposing PII to orderNo guessing.
      return created({ ...result, token: orderToken(result.orderNo) })
    } catch (err) {
      if (err instanceof EmptyCartError) return badRequest(err.message)
      if (err instanceof OutOfStockError) return conflict(err.message)
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable('Online payment is temporarily unavailable.')
      }
      throw err // unexpected → handle() turns it into a 500
    }
  })
}
