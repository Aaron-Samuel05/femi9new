import type { NextRequest } from 'next/server'
import { badRequest, conflict, handle, ok, serviceUnavailable, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit'
import { ProviderConfigurationError } from '@/lib/runtime-mode'
import {
  assertIdentityFree,
  IdentityConflictError,
  InvalidPhoneError,
  normalizePhone,
  requestOtp,
} from '@/lib/services/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/account/phone/request — { phone } → send an OTP to a number the
 * signed-in customer wants to ATTACH to their account (magic-link and Google
 * signups have no reachable number, so their orders have nowhere to be
 * delivered and no way to be confirmed).
 *
 * Same rate-limit buckets as sign-in, deliberately: the abuse being prevented
 * is SMS-bombing a number, and it does not matter which endpoint sent it.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireUser()
    if (!session) return unauthorized()

    const body = (await req.json().catch(() => ({}))) as { phone?: unknown }
    const phone = typeof body.phone === 'string' ? body.phone : ''

    const ipHit = await rateLimit('otp:req:ip:' + clientIp(req), 5, 60_000)
    if (!ipHit.ok) return tooManyRequests(ipHit.retryAfterSec)
    const phHit = await rateLimit('otp:req:ph:' + normalizePhone(phone), 5, 3_600_000)
    if (!phHit.ok) return tooManyRequests(phHit.retryAfterSec)

    try {
      // Refuse a number owned by another account BEFORE spending an SMS on it.
      await assertIdentityFree(session.sub, 'phone', phone)
      const { mock, devCode } = await requestOtp(phone)
      return ok({ ok: true, mock, ...(devCode ? { devCode } : {}) })
    } catch (err) {
      if (err instanceof IdentityConflictError) {
        return conflict(err.message, { code: 'identity_conflict', field: err.field })
      }
      if (err instanceof InvalidPhoneError) return badRequest(err.message)
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable('SMS verification is temporarily unavailable.')
      }
      throw err
    }
  })
}
