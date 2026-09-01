import 'server-only'
import type { Brand } from '@femi9/db'
import { perBrandEnv } from './env-identity'
import { mockProvidersAllowed, ProviderConfigurationError } from './runtime-mode'

/**
 * WhatsApp Cloud API transport.
 *
 * The ONLY place that knows how to talk to Meta's Graph endpoint. Everything
 * above it names a template and hands over parameters; nothing above it builds
 * a URL, a token header or a `components` array.
 *
 * ── One WABA, two brands ───────────────────────────────────────────────────
 * Femi9 and Lumi9 share the business account, the phone number and the five
 * approved templates — the copy says "Femi9" in both today, which is a known
 * and accepted state until Lumi9's own templates are approved. Credentials
 * still resolve per brand (`WHATSAPP_TOKEN_LUMI9`, else `WHATSAPP_TOKEN`), so
 * splitting them later is one variable and no code change. See env-identity.ts.
 *
 * ── Templates are the only thing we may send ───────────────────────────────
 * Outside a 24-hour customer-service window Meta accepts nothing but a
 * PRE-APPROVED template, referenced BY NAME. The names below are approved and
 * are not ours to invent: a name that does not exist on the WABA fails with a
 * 132001 at send time, which looks exactly like an outage and is not one. A new
 * message means getting a new template approved first — do not repurpose one of
 * these, because the body copy is fixed and only the variables change.
 *
 * The IDs are recorded next to each name for the ops trail — the send API keys
 * off the name, never the ID.
 */

export const WHATSAPP_TEMPLATES = {
  /** 778500351016365 — body: {customername}, {OTP} */
  signupOtp: 'signup_otp',
  /** 2031434690638770 — body: {customername}, {OTP} */
  loginOtp: 'login_otp',
  /** 1684656215504488 — body: {customername}, {ordernumber}, {orderproductlist}, {ordertotalprice} */
  orderConfirmation: 'order_status_confirmation',
  /** 1539875743298070 — body: {customername}, {ordernumber}, {status} */
  orderDelivered: 'order_status_delivered',
  /** 537281502283564 — body: {customername}, {ordernumber} */
  orderCancelled: 'order_status_cancell',
} as const

export type WhatsappTemplate = (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES]

/** `WHATSAPP_TOKEN_LUMI9`, else the shared `WHATSAPP_TOKEN`. */
export function whatsappTokenFor(brand: Brand): string | undefined {
  return perBrandEnv('WHATSAPP_TOKEN', brand)
}

/** `WHATSAPP_PHONE_NUMBER_ID_LUMI9`, else the shared `WHATSAPP_PHONE_NUMBER_ID`.
 *  This is the Cloud API's numeric sender id, NOT the phone number itself. */
export function whatsappPhoneIdFor(brand: Brand): string | undefined {
  return perBrandEnv('WHATSAPP_PHONE_NUMBER_ID', brand)
}

/** True when this brand can actually send a WhatsApp message. */
export function whatsappConfigured(brand: Brand): boolean {
  return Boolean(whatsappTokenFor(brand) && whatsappPhoneIdFor(brand))
}

/**
 * The Graph version to call. Pinned in env rather than left to a floating
 * default because Meta retires versions on a schedule, and a silently-moved
 * default changes the shape of a live, payment-adjacent notification path.
 */
function apiVersion(): string {
  return process.env.WHATSAPP_API_VERSION?.trim() || 'v22.0'
}

/**
 * The language code the templates were approved under.
 *
 * `en_US`, because that is what all five ARE — verified against the WABA's
 * template list, not assumed. This defaulted to `en` and every send failed with
 * 132001, which reads "template does not exist": Meta matches on the NAME AND
 * LANGUAGE PAIR, so `login_otp`/`en` is a different template from
 * `login_otp`/`en_US`, and the error cannot tell you which half was wrong.
 *
 * That cost a deployment to find, because the shopper saw "WhatsApp sign-in is
 * temporarily unavailable" and nothing was logged. A default that is wrong for
 * the only templates that exist is a trap, so the default is now the truth and
 * WHATSAPP_TEMPLATE_LANGUAGE remains the override for a WABA that differs.
 */
function templateLanguage(): string {
  return process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en_US'
}

/**
 * A bare national 10-digit number to the E.164 digits Meta wants (no `+`).
 *
 * Every customer number in both databases is Indian and stored as 10 digits by
 * `normalizePhone`, but an address row is free text a human typed, so `+91`,
 * a leading `0`, spaces and dashes all turn up. Reduce to digits, keep the last
 * ten, prefix 91.
 */
export function toWhatsappNumber(phone: string): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  const national = digits.length > 10 ? digits.slice(-10) : digits
  if (national.length !== 10) return null
  return `91${national}`
}

/**
 * Make a value safe to put in a template parameter.
 *
 * Meta rejects the whole message (131009) when a body parameter contains a
 * newline, a tab, or four-plus consecutive spaces — which is exactly what a
 * multi-line order line-item list is. Collapsing whitespace here, once, keeps
 * that failure out of every caller. An empty parameter is rejected too, so an
 * absent value becomes a dash rather than a 400.
 */
export function templateParam(value: string | number | null | undefined): string {
  const flat = String(value ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > 0 ? flat : '-'
}

/** What happened to a send. `sent:false` with a reason is an honest "we could
 *  not tell her", which callers log rather than swallow. */
export interface WhatsappSendResult {
  sent: boolean
  mock: boolean
  reason?: string
}

export interface WhatsappTemplateInput {
  /** Any form of the customer's number; normalised here. */
  to: string
  template: WhatsappTemplate
  /** Body variables, IN THE ORDER THEY APPEAR IN THE APPROVED TEMPLATE. */
  params: (string | number | null | undefined)[]
}

/**
 * Send one approved template message.
 *
 * Never throws — a Meta outage must not roll back a captured payment or block an
 * ops status change. The one caller with nothing to fall back on uses
 * `sendWhatsappTemplateOrThrow` below.
 *
 * MOCK: an explicit local/test mode does nothing and reports mock:true, so the
 * whole flow is exercisable without a live WABA or a per-message bill.
 */
export async function sendWhatsappTemplate(
  brand: Brand,
  input: WhatsappTemplateInput,
): Promise<WhatsappSendResult> {
  if (!whatsappConfigured(brand)) {
    if (mockProvidersAllowed()) return { sent: true, mock: true }
    return { sent: false, mock: false, reason: 'WhatsApp is not configured' }
  }

  const to = toWhatsappNumber(input.to)
  if (!to) return { sent: false, mock: false, reason: 'Not a valid 10-digit mobile number' }

  const url = `https://graph.facebook.com/${apiVersion()}/${whatsappPhoneIdFor(brand)}/messages`
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: input.template,
      language: { code: templateLanguage() },
      components: [
        {
          type: 'body',
          parameters: input.params.map((p) => ({ type: 'text', text: templateParam(p) })),
        },
      ],
    },
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${whatsappTokenFor(brand)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return {
        sent: false,
        mock: false,
        reason: `WhatsApp ${input.template} failed (${res.status}): ${detail.slice(0, 300)}`,
      }
    }
    return { sent: true, mock: false }
  } catch (err) {
    return {
      sent: false,
      mock: false,
      reason: `WhatsApp ${input.template} threw: ${String(err).slice(0, 300)}`,
    }
  }
}

/**
 * As above, but a failure is an exception.
 *
 * For the OTP challenge only. `requestOtp` has already written the code's hash
 * to VerificationToken by the time we get here, so reporting success on a failed
 * send would leave a shopper on a code-entry screen with no code ever arriving
 * and the route answering 200. Throwing lets the route tell her to try again.
 */
export async function sendWhatsappTemplateOrThrow(
  brand: Brand,
  input: WhatsappTemplateInput,
): Promise<{ mock: boolean }> {
  if (!whatsappConfigured(brand)) {
    if (!mockProvidersAllowed()) throw new ProviderConfigurationError('WhatsApp')
    return { mock: true }
  }
  const result = await sendWhatsappTemplate(brand, input)
  if (!result.sent) throw new Error(result.reason ?? `WhatsApp ${input.template} failed`)
  return { mock: result.mock }
}
