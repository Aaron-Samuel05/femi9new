import type { NextRequest } from 'next/server'
import { badRequest, ok, handle, serviceUnavailable } from '@femi9/core/api'
import { webhookConfigured, verifyWebhookSignature } from '@femi9/core/razorpay'
import { markOrderPaid, orderNoForRazorpayOrderId } from '@femi9/core/services/checkout'

/**
 * POST /api/webhooks/razorpay — the ASYNCHRONOUS capture path, for LUMI9.
 *
 * Each brand has its OWN webhook endpoint, and that is not tidiness. Razorpay
 * signs an event with the secret of the account that raised the charge, so once
 * the brands are on separate merchant accounts a Lumi9 payment verified against
 * Femi9's secret fails its signature check here — the order is never marked
 * paid, money has been taken, nothing ships, and nobody sees an error. Point
 * each brand's Razorpay dashboard at its own URL.
 *
 * Razorpay POSTs signed events here. We authenticate with
 * HMAC_SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) against the x-razorpay-signature
 * header, so the body MUST be read as raw text (a re-serialized JSON would not
 * match the signature byte-for-byte). On a payment.captured / order.paid event
 * we resolve our order from the gateway order id and mark it paid idempotently —
 * this is the source of truth even if the shopper closed the tab before the sync
 * verify call ran.
 *
 * Unverified calls are rejected (400). Unconfigured (no keys) → no real webhooks
 * can arrive and there's no secret to verify with, so we just 200 and do nothing.
 */

export const dynamic = 'force-dynamic'

// Minimal shape of the events we act on. Razorpay sends the payment entity on
// payment.captured, and both the order and payment entities on order.paid.
type RazorpayWebhookEvent = {
  event?: string
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; method?: string } }
    order?: { entity?: { id?: string } }
  }
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    // Read the exact bytes ONCE — required for a correct signature check.
    const rawBody = await req.text()

    // No keys → no genuine webhook and nothing to verify against. Acknowledge so
    // any stray/probe call isn't treated as an error.
    if (!webhookConfigured('lumi9')) {
      if (process.env.NODE_ENV === 'production') {
        return serviceUnavailable('Payment webhook is not configured.')
      }
      return ok({ ok: true, ignored: true })
    }

    const signature = req.headers.get('x-razorpay-signature')
    if (!verifyWebhookSignature('lumi9', rawBody, signature)) {
      return badRequest('Invalid webhook signature')
    }

    // Signature is good → safe to parse the (now trusted) body.
    let event: RazorpayWebhookEvent
    try {
      event = JSON.parse(rawBody) as RazorpayWebhookEvent
    } catch {
      return badRequest('Malformed webhook body')
    }

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const paymentEntity = event.payload?.payment?.entity
      const orderEntity = event.payload?.order?.entity
      const razorpayOrderId = paymentEntity?.order_id ?? orderEntity?.id
      const razorpayPaymentId = paymentEntity?.id
      const method = paymentEntity?.method

      if (razorpayOrderId) {
        const orderNo = await orderNoForRazorpayOrderId('lumi9', razorpayOrderId)
        if (orderNo) {
          await markOrderPaid('lumi9', {
            orderNo,
            // Fall back to a deterministic id if the event omitted the payment id
            // (e.g. an order.paid without an entity), so the @unique column is set.
            razorpayPaymentId: razorpayPaymentId ?? `whook_${razorpayOrderId}`,
            razorpayOrderId,
            signatureVerified: true,
            method,
          })
        }
      }
    }

    // 200 for any verified event we understood (even an unhandled type) so
    // Razorpay stops retrying.
    return ok({ ok: true })
  })
}
