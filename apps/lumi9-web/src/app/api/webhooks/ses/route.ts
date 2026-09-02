import type { NextRequest } from 'next/server'
import { badRequest, ok, handle } from '@femi9/core/api'
import { recordEmailDeliveryEvent } from '@femi9/core/services/notifications'
import {
  confirmSnsSubscription,
  parseSesEvent,
  verifySnsMessage,
  type SnsEnvelope,
} from '@femi9/core/ses-notification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/webhooks/ses — what happened to a message AFTER SES accepted it.
 *
 * SES's configuration set publishes bounces, complaints and deliveries to an
 * SNS topic (infra/terraform/ses.tf), and SNS POSTs them here. This is the
 * SES-shaped equivalent of Femi9's /api/webhooks/resend, and the difference is
 * not cosmetic: there is no shared secret and no signature header. SNS signs
 * the body with a certificate it names in that body, so the whole of the
 * authentication lives in `verifySnsMessage` — including that the topic ARN is
 * OURS, since a valid AWS signature only proves AWS sent it, not that it came
 * from a topic we own.
 *
 * ── Why this endpoint has to exist ─────────────────────────────────────────
 * A send is not a delivery. SES accepts the message, queues it, and only later
 * finds the mailbox full or the domain nonexistent — so without this feed every
 * NotificationLog row says `sent` forever and the log claims every email the
 * storefront ever emitted arrived.
 *
 * It also protects the ability to send at all. SES watches the bounce and
 * complaint rates of the ACCOUNT, and a sending pause takes both brands down —
 * so a bounce is worth seeing on the day it happens, not in the month somebody
 * notices no email is going out.
 *
 * Deleting the recipient from further sends is NOT done here: SES keeps an
 * account-level suppression list of its own, on by default, and a second list
 * in this database that disagrees with it is worse than no list.
 */

export async function POST(req: NextRequest) {
  return handle(async () => {
    const expectedTopicArn = process.env.SES_EVENT_TOPIC_ARN?.trim()
    // Fail closed. With no expected topic there is nothing to check the message
    // against, and "verified" would mean "any SNS topic in any AWS account".
    if (!expectedTopicArn) return badRequest('SES event topic is not configured')

    let envelope: SnsEnvelope
    try {
      envelope = JSON.parse(await req.text())
    } catch {
      return badRequest('Body is not JSON')
    }

    const type = await verifySnsMessage(envelope, { expectedTopicArn })
    if (!type) return badRequest('Invalid SNS message')

    // A new subscription stays pending until somebody GETs the SubscribeURL, so
    // the endpoint completes its own subscription — but only after the message
    // verified, or this becomes a fetcher for any URL a stranger posts.
    if (type === 'SubscriptionConfirmation') {
      const confirmed = envelope.SubscribeURL ? await confirmSnsSubscription(envelope.SubscribeURL) : false
      return ok({ subscription: confirmed ? 'confirmed' : 'failed' })
    }
    if (type === 'UnsubscribeConfirmation') return ok({ ignored: true, type })

    const event = parseSesEvent(envelope.Message ?? '')
    if (!event || event.recipients.length === 0) return ok({ ignored: true })

    // A TRANSIENT bounce is a full mailbox or a greylist, not a dead address —
    // recording it as a bounce would mark a working customer's mail as failed.
    if (event.kind === 'bounce' && !event.permanent) {
      return ok({ ignored: true, reason: 'transient bounce', detail: event.detail })
    }

    const status =
      event.kind === 'bounce' ? 'bounced' : event.kind === 'complaint' ? 'complained' : 'delivered'
    if (event.kind === 'other') return ok({ ignored: true, type: event.detail })

    let updated = 0
    for (const recipient of event.recipients) {
      updated += await recordEmailDeliveryEvent('lumi9', recipient, status, event.detail)
    }
    return ok({ status, recipients: event.recipients.length, updated })
  })
}
