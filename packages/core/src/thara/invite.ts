import 'server-only'
import { mockProvidersAllowed } from '../runtime-mode'

/**
 * Thara invite email — sender for referral invitations.
 *
 * Mirrors src/lib/otp.ts::sendMagicLink so ops sees the same shape and any
 * future switch from Resend to SES is a single-file swap. Configuration:
 *
 *   RESEND_API_KEY, EMAIL_FROM  → real send via api.resend.com
 *   otherwise + ALLOW_MOCK_PROVIDERS=true → returns { mock: true } and does nothing
 */

function configured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())
}

export interface TharaInviteResult {
  mock: boolean
}

export class TharaInviteProviderNotConfiguredError extends Error {
  constructor() {
    super('Email provider is not configured for Thara invites.')
    this.name = 'TharaInviteProviderNotConfiguredError'
  }
}

interface RenderInput {
  referrerName: string | null
  referralCode: string
  referralUrl: string
}

/** Render a plain HTML invite. Kept inline (no template engine) so the whole
 *  path is auditable in one file. */
export function renderInviteEmail({ referrerName, referralCode, referralUrl }: RenderInput): {
  subject: string
  html: string
  text: string
} {
  const who = referrerName?.trim() || 'A friend'
  const subject = `${who} sent you an invite to try Femi9`
  const html =
    `<p>Hi,</p>` +
    `<p><strong>${who}</strong> uses Femi9 - organic, breathable period-care pads made in India - and wanted you to try them too.</p>` +
    `<p>Tap the button below to browse. Their code <strong>${referralCode}</strong> is applied automatically.</p>` +
    `<p><a href="${referralUrl}" style="display:inline-block;padding:12px 22px;border-radius:999px;` +
    `background:#5B3FDA;color:#fff;font-weight:600;text-decoration:none">Open Femi9</a></p>` +
    `<p style="color:#7F6EB9;font-size:13px">If you weren't expecting this, you can safely ignore this email - it was sent because ${who} shared your address with us for this invitation.</p>`
  const text =
    `${who} uses Femi9 and wanted you to try it too.\n\n` +
    `Their referral code is ${referralCode}. Open ${referralUrl} to browse.\n\n` +
    `If you weren't expecting this, ignore this email.`
  return { subject, html, text }
}

interface SendInput {
  to: string
  subject: string
  html: string
  text: string
}

/** Deliver an invite via Resend. Mock-safe when the flag allows it. */
export async function sendTharaInviteEmail(input: SendInput): Promise<TharaInviteResult> {
  if (!configured()) {
    if (!mockProvidersAllowed()) throw new TharaInviteProviderNotConfiguredError()
    return { mock: true }
  }
  const apiKey = process.env.RESEND_API_KEY as string
  const from = process.env.EMAIL_FROM as string
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend sendTharaInvite failed (${res.status}): ${detail}`)
  }
  return { mock: false }
}
