# Money-flow audit — checkout, capture, refund

Status: **audited 2026-09-04** · Lumi9-affecting defects fixed, Femi9-only
defects documented below and **not** fixed.

Scope of the read: `services/checkout.ts`, `razorpay.ts`,
`services/admin/orders.ts`, the Thara credit path in `services/thara.ts`, and
`recordSubscriptionCharge`. **Not** exhaustively audited: `pricing.ts`,
`rewards.ts`, `invoice.ts`, the full subscription lifecycle.

The point of this document is the open items in [§2](#2-open-defects). Everything
in §1 is here so the next person does not re-derive it, and §3 so nobody
"tidies" a thing that is load-bearing.

---

## 1. What is correct, and why

Recorded because each of these is a place where the obvious implementation is
wrong, and the current one is right.

| Property | Where | Why it holds |
| --- | --- | --- |
| Units are consistent | everywhere | Money is **whole rupees** in the database; `Math.round(rupees * 100)` at each gateway boundary. There is no paise anywhere except in a Razorpay payload. |
| Totals are never client-supplied | `placeOrder` | Subtotal, discount, shipping and total are recomputed from `ProductVariant.price` inside the transaction. The body is trusted for *where to ship*, never *what to charge*. |
| A signed payment cannot be redirected | `/api/payments/verify` | The order is resolved from the **verified gateway order id**, not the client's `orderNo`. Without this, a caller could sign a cheap order and claim an expensive one paid. Both storefronts do this. |
| Mock capture cannot leak into production | `/api/payments/verify` | Double-gated: the mock branch is reachable only when `isConfigured(brand)` is false **and** `mockProvidersAllowed()` is true, and the latter fails closed in production. |
| Capture is exactly-once | `markOrderPaid` | Already-paid short-circuit, a required payment-intent row, then a compare-and-swap on `status: 'pending'`. Webhook, sync verify and the reconcile cron all race for the same order and only one performs side effects. |
| The welcome bonus is not re-earnable | `markOrderPaid` | The "first paid order" count spans `PAID_ORDER_STATUSES`, not just `paid` — a previous order that has since shipped no longer reads as `paid` and used to vanish from the check. |
| Stock cannot go negative | `placeOrder` | Conditional decrement (`WHERE stock >= qty`); a count of 0 is out-of-stock and rolls the transaction back. |
| A refund cannot double-pay | `refundPayment` | Existing gateway refunds are **adopted**, not duplicated, and a partial existing refund that does not cover the request is refused rather than topped up. |
| A refund returns exactly what was captured | `refundOrder` | `order.total` is rewritten *after* Thara credit is applied, so it equals the amount the gateway actually took. Refunding `order.total` cannot over-refund a part-credit order. |
| Recurring charges book what the bank moved | `recordSubscriptionCharge` | Idempotent on `razorpayPaymentId`; `total` is always the charged amount and any drift from the current quote is absorbed into `discount` and logged. |

---

## 2. Open defects

### 2.1 Thara credit is silently burned when the gateway call fails — **Femi9 only, open**

**Severity: high.** Real customer money, lost silently, with no trace afterwards.

`applyTharaCredit` writes a `TharaCreditLedger` debit **inside** `placeOrder`'s
transaction, which commits. `razorpay.createOrder` then runs **outside** it. When
the gateway call fails, the compensation block restores stock, decrements the
coupon and **deletes the order** — but never reverses the credit.

The delete does not clean it up either: `TharaCreditLedger.sourceOrderId` is
`onDelete: SetNull`, so the debit row survives with a null link.

```
applyTharaCredit  ──▶ ledger debit committed, sourceOrderId = <order>
createOrder       ──▶ throws (outage, timeout, or a ₹0 total)
compensation      ──▶ stock back ✅  coupon back ✅  order deleted ✅
                      credit ❌ — row survives, sourceOrderId now NULL
```

Net effect: her balance stays reduced, there is no order, and nothing can ever
reverse it — `reverseTharaCreditForRefund` finds rows by `sourceOrderId`, which
is now null on an order that no longer exists. Nothing logs it.

**Trigger:** any Razorpay outage or timeout during checkout, for any customer
spending store credit.

**Why it is not fixed here:** the fix is a design choice, not a patch. Either
apply the credit *after* the gateway order succeeds (changes the order in which
`total` is known, and `total` is what the gateway order is opened for), or
reverse the debit in the compensation block (simpler, but the compensation path
is itself best-effort and can fail). Both want an integration test for the
gateway-failure case, which nothing covers today.

**Why Lumi9 is unaffected:** `THARA_ENABLED` is set only on the femi9 service in
`infra/terraform/ecs.tf`; `isTharaEnabled()` reads that global env, and **both**
entry points — `applyTharaCredit` and `computeTharaDiscount` — return zero on
their first line. Lumi9's checkout never touches the credit ledger. This is a
deployment fact, not a code boundary: setting `THARA_ENABLED` on the lumi9
service would silently start a referral programme its console cannot see, since
`thara` is absent from Lumi9's module list.

### 2.2 Store credit can still drive a total to ₹0 — **Femi9 only, open**

**Severity: medium**, but it is the most likely trigger of §2.1.

`applyTharaCredit` caps at `Math.min(balance, wantPaise)` with **no floor**, so
a customer with enough credit reaches `total = 0`. Razorpay's minimum is ₹1, the
Orders API refuses it, and §2.1 then burns the credit — so the customer with the
*most* credit is the one most likely to lose it.

The coupon route to the same zero total **is** fixed (§3.1). This one is not,
because it needs the same decision as §2.1: leave ₹1 for her to pay, or build a
settled-without-payment path.

### 2.3 `TharaCreditLedger.delta` is documented as paise but is rupees — **latent**

**Severity: latent, high if acted on.** Behaviour today is correct.

```prisma
delta  Int  // paise; +earn / -spend / +/-reversal   ← WRONG, it is rupees
```

```ts
applyTharaCredit(tx, userId, orderId, wantPaise: number)  // ← receives rupees
```

Earned as `Math.floor(order.subtotal * THARA_COMMISSION_PCT / 100)` where
`subtotal` is rupees; spent against `total`, also rupees. Earn and spend agree,
so the ledger is internally consistent and every balance shown is right.

The danger is entirely in the naming. Someone who notices the inconsistency and
"fixes" it by multiplying by 100 at either end gives every member **100× their
credit**. Rename the parameter and correct the schema comment before anyone
touches this — do not convert anything.

---

## 3. Fixed in this pass

### 3.1 A basket discounted to ₹0 was refused by the gateway, not by us — **both brands, fixed**

Reaching ₹0 needs nothing exotic. `couponDiscountFor` permits a percent coupon
of exactly 100 (the admin schema allows `value <= 100`), a flat coupon is capped
only at the subtotal, and `shippingFor` reads the **pre-discount** subtotal — so
a fully-discounted basket over the free-shipping threshold has nothing left to
charge.

The refusal used to happen at `razorpay.createOrder`, *after* the order row, the
stock reservation and (on Femi9) the credit debit. The shopper saw an opaque
gateway failure at the last step of checkout with nothing pointing at her
discount code, and the compensation path then deleted the order so no trace
remained.

Now `ZeroTotalOrderError` is thrown at the last line before anything is written
— the coupon's `usedCount` increment above it is inside the same transaction and
rolls back — and both checkout routes map it to a 400 carrying a sentence that
names the discount code. Covered by
`test/integration/checkout-money-guards.test.ts`.

**This is not a free-order flow.** A genuine ₹0 order needs a
settled-without-payment path this platform does not have: `markOrderPaid`
requires a payment intent, and the confirmation page and the receipt both assume
a capture. If a giveaway is ever wanted, that is the work.

**Lumi9 is fully covered by this**, because coupons are its only route to zero.
Femi9 keeps the credit route open — see §2.2.

### 3.2 The captured amount was never checked against the gateway — **both brands, fixed**

`markOrderPaid` compared `payment.amount` to `order.total`. Both are **our own
rows**: the payment row was written by our own checkout from our own total, so
the check catches a stale intent and cannot catch a short capture.

The only thing standing between a short capture and a paid order was Razorpay's
own rule that a payment settles its Order in full — which is an **account
setting** (partial payments), not something this code enforced, and not ours to
assume stays off.

`markOrderPaid` now takes an optional `capturedAmountPaise` and refuses a
mismatch with `PaymentAmountMismatchError`. Both webhooks pass
`payload.payment.entity.amount`. It is optional because the synchronous verify
path genuinely has no amount — Razorpay Checkout hands the browser an order id,
a payment id and a signature and nothing else — and the webhook always fires, so
the check always runs eventually.

### 3.3 A paid order that was cancelled could never be refunded — **both brands, fixed**

Shipped separately, in commit `35bd12c`; recorded here because it is the same
audit. Cancelling a paid order restored stock and released the coupon while
touching neither the gateway nor the payment row, and `refundOrder` required
`status === 'paid'` — so the money stayed with us on an order whose books
already said the sale was reversed, with no way back through the console.

`refundableFrom()` is now the single definition of what may be refunded, read by
both the service guard and `OrderDetail.refundable` (which draws the button).
A refund from `cancelled` must **not** restore stock — the cancel already did —
which is why `reverseBooksForRefund` takes the origin status rather than
inferring it.

### 3.4 A dashboard refund never reached the database — **both brands, fixed**

`refund.processed` was unhandled, so a refund issued in the Razorpay dashboard
left the order `paid`, the payment `captured`, the points unreversed and every
sales figure counting a reversed sale. `recordGatewayRefund` now books it from
both webhooks.

⚠️ **This is inert until the endpoints are subscribed to `refund.processed` in
the Razorpay dashboard.** And on Femi9 there is a second problem:
`femi9.in/api/webhooks/razorpay` returns **404** — that hostname is served by the
old single-app stack, not by the platform stack, so the handler is deployed but
unreachable there. Lumi9 is fine (`lumi9.in` is the platform's CloudFront).

### 3.5 The money story was invisible on the order screen — **both brands, fixed**

Two facts an operator needs on a dispute, neither of which the status enum can
carry:

- **Was it ever paid?** `cancelled` covered both "she never paid" and "she paid
  and we are still holding it". Only one of those owes somebody money, and until
  §3.3 there was no way back from it.
- **Which gateway refund returned it?** `refundPayment` had always *returned* the
  refund id and nothing wrote it down — it reached one `console.warn` on the
  adopt path and was discarded. Reconciling a disputed refund meant matching by
  payment id and eyeballing timestamps in the dashboard.

Migration `20260904140000_payment_refund_trail` adds `Payment.razorpayRefundId`
and `Payment.refundedAt` (both nullable, purely additive). `refundOrder` writes
them right after the gateway call and *outside* the reversal transaction — that
is the only moment the id exists — and the webhook path writes them too,
preferring the gateway's own `created_at` because a redelivered event can arrive
long after the money moved.

`OrderDetail.money` derives the rest from the Payment rows: captured amount,
gateway payment id, refund id, refunded-at, and `paidThenCancelled`. The console
renders it above the status select, loud when the money is still ours, and shows
both ids as selectable text rather than a link — the dashboard URL differs by
account and mode, and a link to the wrong account is worse than a string to
paste into its search box.

`refundedAt` is deliberately distinct from `Payment.createdAt`, which records
when the payment **intent** was opened at checkout, not when money moved in
either direction.

**A pre-existing refund has no id.** The columns are nullable and nothing
backfills them, so an order refunded before this shipped reads "no gateway
refund id was recorded for this one" — which is honest, where a blank row would
read as "there is no refund".

### 3.6 Cancelling a paid order now warns first — **both brands, fixed**

Paid orders **can** be cancelled and always could: `updateOrderStatus` accepts
`cancelled` from any status and the console's dropdown offers every one of them.
That is not itself wrong — an operator may need to mark an order cancelled after
refunding out of band — but nothing said that cancelling keeps the money.

Choosing `cancelled` on an order with a captured, unrefunded payment now asks
for confirmation, names the amount, and points at Refund instead. It is a
confirm, not a block: refusing the transition outright would strand the operator
who has already returned the money by hand.

---

## 4. If you change one thing here

Read §2.3 first. It is the only item where a well-intentioned tidy-up is worse
than leaving the code alone.
