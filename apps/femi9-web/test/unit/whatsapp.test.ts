import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  WHATSAPP_TEMPLATES,
  sendWhatsappTemplate,
  sendWhatsappTemplateOrThrow,
  templateParam,
  toWhatsappNumber,
  whatsappConfigured,
} from '@femi9/core/whatsapp'

/**
 * The WhatsApp transport is the only delivery path for a sign-in OTP — there is
 * no SMS fallback any more — so the failure modes worth pinning here are the
 * silent ones: a placeholder token that looks configured, a body parameter Meta
 * rejects for containing a newline, and a mock that "succeeds" in production.
 *
 * Provider env vars are not part of the vitest env block; snapshot + clear
 * before each test and restore after so a set key never leaks across tests.
 */
const KEYS = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_TOKEN_LUMI9',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_PHONE_NUMBER_ID_LUMI9',
  'WHATSAPP_API_VERSION',
  'WHATSAPP_TEMPLATE_LANGUAGE',
  'ALLOW_MOCK_PROVIDERS',
] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

function configure() {
  process.env.WHATSAPP_TOKEN = 'EAAG-real-token'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '323448914175098'
}

/** Capture the one fetch the transport makes. */
function stubFetch(response = new Response('{"messages":[{"id":"wamid.1"}]}', { status: 200 })) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return response
  })
  return calls
}

describe('whatsappConfigured', () => {
  it('needs BOTH a token and a sender id, and treats a TODO as unset', () => {
    expect(whatsappConfigured('femi9')).toBe(false)
    process.env.WHATSAPP_TOKEN = 'EAAG-real-token'
    expect(whatsappConfigured('femi9')).toBe(false)
    process.env.WHATSAPP_PHONE_NUMBER_ID = '323448914175098'
    expect(whatsappConfigured('femi9')).toBe(true)
    // Terraform seeds every secret with a placeholder. A task holding one is
    // NOT configured, however non-empty the string is.
    process.env.WHATSAPP_TOKEN = 'TODO-change-me'
    expect(whatsappConfigured('femi9')).toBe(false)
  })

  it('falls back to the shared token for a brand with only a placeholder', () => {
    configure()
    process.env.WHATSAPP_TOKEN_LUMI9 = 'TODO-change-me'
    // The placeholder must DEFER to the working shared key, not shadow it.
    expect(whatsappConfigured('lumi9')).toBe(true)
    process.env.WHATSAPP_TOKEN_LUMI9 = 'EAAG-lumi9-token'
    expect(whatsappConfigured('lumi9')).toBe(true)
  })
})

describe('toWhatsappNumber', () => {
  it('reduces anything a human typed to E.164 digits', () => {
    expect(toWhatsappNumber('9876543210')).toBe('919876543210')
    expect(toWhatsappNumber('+91 98765 43210')).toBe('919876543210')
    expect(toWhatsappNumber('098765-43210')).toBe('919876543210')
  })

  it('refuses anything that is not ten national digits', () => {
    expect(toWhatsappNumber('98765')).toBeNull()
    expect(toWhatsappNumber('')).toBeNull()
    expect(toWhatsappNumber('not a number')).toBeNull()
  })
})

describe('templateParam', () => {
  it('collapses the whitespace Meta rejects in a body parameter', () => {
    // A multi-line order line-item list is the real case: a newline in a
    // parameter fails the whole message with a 131009.
    expect(templateParam('Pads - Regular x2\nPanty - M x1')).toBe('Pads - Regular x2 Panty - M x1')
    expect(templateParam('a\t\tb    c')).toBe('a b c')
  })

  it('never yields an empty parameter', () => {
    expect(templateParam('')).toBe('-')
    expect(templateParam(null)).toBe('-')
    expect(templateParam(undefined)).toBe('-')
    expect(templateParam(0)).toBe('0')
  })
})

describe('sendWhatsappTemplate', () => {
  it('posts the approved template name and its parameters in order', async () => {
    configure()
    const calls = stubFetch()

    const result = await sendWhatsappTemplate('femi9', {
      to: '+91 98765 43210',
      template: WHATSAPP_TEMPLATES.orderCancelled,
      params: ['Priya', 'FM-00042'],
    })

    expect(result).toEqual({ sent: true, mock: false })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://graph.facebook.com/v22.0/323448914175098/messages')
    const body = JSON.parse(calls[0].init.body as string)
    expect(body.to).toBe('919876543210')
    expect(body.template.name).toBe('order_status_cancell')
    // en_US is what all five templates are actually approved under on the WABA.
    // The default used to be 'en' and every send failed 132001 — Meta matches on
    // the name AND language pair, so this is not cosmetic.
    expect(body.template.language.code).toBe('en_US')
    expect(body.template.components[0].parameters).toEqual([
      { type: 'text', text: 'Priya' },
      { type: 'text', text: 'FM-00042' },
    ])
  })

  it('honours the pinned API version and approved template language', async () => {
    configure()
    process.env.WHATSAPP_API_VERSION = 'v23.0'
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'en_US'
    const calls = stubFetch()

    await sendWhatsappTemplate('femi9', {
      to: '9876543210',
      template: WHATSAPP_TEMPLATES.loginOtp,
      params: ['Priya', '123456'],
    })

    expect(calls[0].url).toContain('/v23.0/')
    expect(JSON.parse(calls[0].init.body as string).template.language.code).toBe('en_US')
  })

  it('reports a rejected send instead of throwing', async () => {
    configure()
    stubFetch(new Response('{"error":{"code":132001}}', { status: 400 }))

    const result = await sendWhatsappTemplate('femi9', {
      to: '9876543210',
      template: WHATSAPP_TEMPLATES.orderConfirmation,
      params: ['Priya', 'FM-1', 'Pads x1', 'Rs.499'],
    })

    // Never throws: an order path must not roll back a captured payment
    // because Meta answered 400.
    expect(result.sent).toBe(false)
    expect(result.reason).toContain('132001')
  })

  it('sends nothing for a number that is not a valid mobile', async () => {
    configure()
    const calls = stubFetch()

    const result = await sendWhatsappTemplate('femi9', {
      to: '12345',
      template: WHATSAPP_TEMPLATES.orderDelivered,
      params: ['Priya', 'FM-1', 'delivered'],
    })

    expect(result.sent).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('sendWhatsappTemplateOrThrow', () => {
  it('never mocks a sign-in code in production', async () => {
    const previous = process.env.NODE_ENV
    const mutableEnv = process.env as Record<string, string | undefined>
    mutableEnv.NODE_ENV = 'production'
    mutableEnv.ALLOW_MOCK_PROVIDERS = 'true'
    try {
      await expect(
        sendWhatsappTemplateOrThrow('femi9', {
          to: '9876543210',
          template: WHATSAPP_TEMPLATES.signupOtp,
          params: ['there', '123456'],
        }),
      ).rejects.toThrow('WhatsApp is not configured')
    } finally {
      if (previous === undefined) delete mutableEnv.NODE_ENV
      else mutableEnv.NODE_ENV = previous
    }
  })

  it('throws when the send fails, so the route can say "try again"', async () => {
    configure()
    stubFetch(new Response('{"error":{"message":"rate limit"}}', { status: 429 }))

    await expect(
      sendWhatsappTemplateOrThrow('femi9', {
        to: '9876543210',
        template: WHATSAPP_TEMPLATES.signupOtp,
        params: ['there', '123456'],
      }),
    ).rejects.toThrow(/429/)
  })

  it('mocks outside production so the flow is exercisable with no WABA', async () => {
    process.env.ALLOW_MOCK_PROVIDERS = 'true'
    const calls = stubFetch()

    const result = await sendWhatsappTemplateOrThrow('femi9', {
      to: '9876543210',
      template: WHATSAPP_TEMPLATES.loginOtp,
      params: ['Priya', '123456'],
    })

    expect(result.mock).toBe(true)
    expect(calls).toHaveLength(0)
  })
})
