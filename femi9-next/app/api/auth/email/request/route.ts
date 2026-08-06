import type { NextRequest } from 'next/server'
import { ok, badRequest, handle, serviceUnavailable } from '@/lib/api'
import { requestMagicLink, InvalidEmailError } from '@/lib/services/auth'
import { ProviderConfigurationError } from '@/lib/runtime-mode'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** POST /api/auth/email/request — { email } → mint + send a magic link.
 *  In mock mode the response includes devLink so the flow is testable now. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { email?: unknown }
    const email = typeof body.email === 'string' ? body.email : ''
    try {
      const { mock, devLink } = await requestMagicLink(email)
      return ok({ ok: true, mock, ...(devLink ? { devLink } : {}) })
    } catch (err) {
      if (err instanceof InvalidEmailError) return badRequest(err.message)
      if (err instanceof ProviderConfigurationError) {
        return serviceUnavailable('Email sign-in is temporarily unavailable.')
      }
      throw err
    }
  })
}
