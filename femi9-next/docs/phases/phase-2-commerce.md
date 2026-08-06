# Phase 2 — Commerce Core + Razorpay (Implementation Spec)

> **Goal:** the store takes real, paid orders. A customer places an order, pays via
> Razorpay (test mode), stock and points update exactly once, and the order is recorded.
> WhatsApp checkout stays live as a secondary path.
>
> **Source of truth for scope:** `Femi9-Backend-Tasks.md` → Phase 2 (Epics 2.1–2.5).
> **Schema authority:** `prisma/schema.prisma`. This spec references only models/fields that exist,
> and flags every gap under **§2 Schema additions**.

---

## 0. Context you must not re-derive

Verified against the current repo so you can code directly:

| Fact | Value |
|---|---|
| App Router root | `app/` (NOT under `src/`). Route handlers live at `app/api/**/route.ts`. |
| Path alias | `@/*` → `src/*` (see `tsconfig.json`). `app/` has **no** alias; import services as `@/lib/services/...`. |
| Prisma client | `import { prisma } from '@/lib/db'` (singleton in `src/lib/db.ts`). |
| API response helpers | `src/lib/api.ts` → `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `serverError`, `handle`. Use these; do not hand-roll `NextResponse.json`. |
| Service pattern | `src/lib/services/*.ts`, first line `import 'server-only'`. Route handlers are thin wrappers (see `app/api/products/route.ts`). |
| Validation | Zod v4 is installed. Define input schemas per endpoint. |
| Money unit | **All internal money is integer rupees** (no paise). `Product.basePrice`, `ProductVariant.price`, `Order.*`, `Payment.amount`, `Coupon.value` are rupees. See **§3 Money rule**. |
| Existing cart | Client-only React reducer keyed by **product id** (`src/store/cart.tsx`). Prices read from static `src/data/products.ts`. This is what Epic 2.1 replaces. |
| WhatsApp checkout | `src/components/CartDrawer.tsx` `checkout()` opens `wa.me/${WA_NUMBER}`. `WA_NUMBER`, `FREE_SHIP` live in `src/data/products.ts`. Also referenced in `Cta.tsx`, `Footer.tsx`. |
| Settings seeded | `Setting` rows exist: `freeShipThreshold=999`, `subscribeSavePct=15`, `whatsappNumber`, `pointsPerRupee=1`, `firstOrderBonusPoints=100` (see `prisma/seed.ts` `seedSettings`). Read these at runtime — do not re-hardcode. |
| Variants seeded | Each product has `ProductVariant` rows (`kind` = `pack`|`size`, `price`, `stock`, `sku`, `active`). SKUs like `p330dw-9`, `ppanty-M`. |

### Runtime / infra facts

- Deploy target is **AWS ECS Fargate** (not Vercel). Cron is **EventBridge Scheduler → HTTPS call to a protected route**, not `vercel.json` crons.
- Razorpay signature verification uses Node `crypto` and the webhook needs the **raw request body**. Every Razorpay-touching route MUST set `export const runtime = 'nodejs'` (never edge) and, for the webhook, read `await req.text()` before parsing.

---

## 1. Dependencies & blockers (read before starting)

### Depends on earlier phases

- **↩ Phase 1 (Auth & accounts) — REQUIRED and not yet present in the repo.** There is no Auth.js install, no `auth()` helper, no session. Phase 2 needs:
  - a server `auth()` (or `getSession()`) helper to read the logged-in `User` → import assumed as `import { auth } from '@/lib/auth'`. **If Phase 1 is not merged, stub `@/lib/auth` to return `null` (guest-only) so Phase 2 is buildable, and wire the real session when Phase 1 lands.**
  - the `middleware.ts` route guards from Phase 1 (used to protect `/api/cron/*`, refund, and account order reads).
  - guest→login **cart merge** hook (Epic 2.1) fires from Phase 1's sign-in callback.
- ↩ Phase 0 (done): schema, seed, `src/lib/services/products.ts`, `app/api/products` read APIs — all present.

### Founder-action blockers (🔒)

| # | Item | Blocks | Unblocks dev with |
|---|---|---|---|
| 2 | **Razorpay account + KYC + bank** | Epics 2.3 (live), Launch | **Test keys** (`rzp_test_*`) unblock all of Phase 2 dev. Only go-live needs KYC + live keys. |
| 4 | Transactional email (Resend) | order-confirmation email | Not blocking — Phase 2 emits a notification **hook**; actual send is Phase 5. Log instead of send if unset. |

Required env (add to `.env`, `.env.example` already has the keys):
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`, plus a new `CRON_SECRET` (shared secret for the reconciliation endpoint — add to `.env.example`).

### New npm dependency

```
npm i razorpay        # official Node SDK: Orders API, Refunds API, webhook util
```
Client Checkout uses the hosted script `https://checkout.razorpay.com/v1/checkout.js` (loaded dynamically — see Task 2.3b). No client npm dep.

---

## 2. Schema additions (call-outs — not in `schema.prisma` today)

These are **required** or **recommended** for Phase 2. Add them via a Prisma migration (`npm run db:migrate -- --name phase2_commerce`). Each is small and additive (nullable / defaulted) so it is safe on seeded data.

| ID | Model.field(s) | Why | Priority |
|---|---|---|---|
| **A** | `Payment.razorpayRefundId String? @unique`, `Payment.amountRefunded Int @default(0)` | Refund flow (Epic 2.3) needs to store the Razorpay refund id (idempotency) and track partial refunds. `PaymentStatus.refunded` exists but there is nowhere to store the refund id/amount. | **Required** for refunds |
| **B** | New model `WebhookEvent { id String @id  // razorpay event id ; type String ; payload Json ; receivedAt DateTime @default(now()) }` | True webhook idempotency at the event level (Razorpay may redeliver). Insert-or-ignore on `id`; if it already exists, the webhook is a no-op. | **Recommended** (fallback below) |
| **C** | Guest-checkout shipping. Either **(C1)** add snapshot fields to `Order`: `shipName String?`, `shipPhone String?`, `shipLine String?`, `shipCity String?`, `shipState String?`, `shipPincode String?`; **or (C2)** no migration — upsert a shell `User` by phone and create an `Address`. See Task 2.2 for the trade-off. | `Address.userId` is **non-nullable**, so a truly anonymous guest cannot own an `Address`. Snapshot fields (C1) are the standard immutable-address pattern and the recommended path. | **Required** if guest checkout is enabled (open decision = allow) |
| **D** | `Order.idempotencyKey String? @unique` | De-dupe double-submitted checkouts (one order per cart+key) so a double click doesn't create two Razorpay orders. Optional if you instead reuse the cart's existing open `pending` order (see Task 2.2 idempotency). | Optional |

If you skip **B**, webhook idempotency falls back to `Payment.razorpayPaymentId @unique` + the order-status transition guard (see Task 2.3c) — acceptable but does not dedupe refund/`order.paid` events that carry no new payment id.

> Regenerate the client after migrating: `npm run db:generate`.

---

## 3. The money rule (get this right once)

- Everything internal is **integer rupees**. Do all arithmetic in rupees.
- **Convert to paise (`× 100`) only at the Razorpay HTTP boundary** (Orders API `amount`, Refunds API `amount`). Convert back (`/ 100`) only when reading Razorpay's `amount`/`amount_paid`/`amount_refunded`.
- Store the **raw Razorpay response** (which is in paise) in `Payment.raw` for audit; store our own `Payment.amount` in **rupees** (== `Order.total`).
- Reconciliation compares `Order.total * 100 === razorpay.amount_paid`.

A single helper avoids scattered `*100`:
```ts
// src/lib/services/money.ts
export const toPaise = (rupees: number) => Math.round(rupees * 100)
export const toRupees = (paise: number) => Math.round(paise / 100)
```

---

## 4. Pricing algorithm (server-authoritative — Epic 2.2)

Implemented in `computeTotals()` (Task 2.2). Client-sent prices/totals are **ignored**.

```
subtotal   = Σ (variant.price × qty)                 // variant.price from DB, live
discount   = coupon ? applyCoupon(subtotal, coupon) : 0
shipping   = (subtotal - discount) >= freeShipThreshold ? 0 : FLAT_SHIP
total      = subtotal - discount + shipping           // clamp >= 0
```
- `freeShipThreshold` from `Setting['freeShipThreshold']` (fallback 999).
- `FLAT_SHIP`: add `Setting['flatShippingFee']` (default e.g. 49). **Currently not seeded** → add it in `seedSettings` or read with a fallback constant. Call this out; it's a settings row, not a schema change.
- `applyCoupon`: `flat` → `min(coupon.value, subtotal)`; `pct` → `round(subtotal × value / 100)`. Reject if: `!coupon.active`, `expiresAt < now`, `usedCount >= maxUses` (when `maxUses != null`), or `subtotal < minOrder`.
- **Subscribe & save** (`subscribeSavePct`) is a subscription concern (Phase 5). Phase 2 checkout is one-time purchase only; do not apply sub discount to cart lines.

---

## Task 2.1 — Variant-aware, server-persisted cart (Epic 2.1)

**Replace** the client-only, product-id-keyed cart with a DB-backed, variant-keyed cart. Guest cart is keyed by an httpOnly cookie; it merges into the user cart on login.

### Data touched
`Cart` (`userId?`, `guestToken @unique`), `CartItem` (`cartId`, `variantId`, `qty`, `@@unique([cartId, variantId])`), `ProductVariant` (`price`, `stock`, `active`).

### Files
**Create**
- `src/lib/services/cart.ts` — cart service (`server-only`). Functions:
  - `resolveCart(): Promise<Cart>` — get-or-create the caller's cart. If `auth()` user → cart by `userId`; else read `femi9_cart` cookie → cart by `guestToken`; if no cookie, create cart + set cookie (httpOnly, sameSite=lax, 60-day, secure in prod).
  - `getCart()` → cart with items joined to variant + product (returns line snapshots: `variantId, productName, variantLabel, unitPrice, qty, lineTotal, stock, inStock`).
  - `addItem(variantId, qty=1)` — validate variant exists, `active`, `stock > 0`; upsert `CartItem` on `@@unique([cartId, variantId])` (increment qty, clamp to `stock`).
  - `setQty(variantId, qty)` — `qty<=0` deletes the line; else clamp to `variant.stock`.
  - `removeItem(variantId)`, `clearCart(cartId)`.
  - `mergeGuestCart(userId, guestToken)` — on login: move/sum guest `CartItem`s into the user cart (respect `@@unique`, clamp to stock), delete the guest cart, clear cookie. **Called from Phase 1 sign-in callback.**
- `app/api/cart/route.ts` — `GET` (current cart), `POST` (add item `{variantId, qty?}`).
- `app/api/cart/items/[variantId]/route.ts` — `PATCH` (`{qty}`), `DELETE`.
- `src/lib/hooks/useServerCart.ts` (client) — replaces the reducer's mutation calls with fetches to the above; keeps the same `CartApi` surface so components need minimal edits.

**Edit**
- `src/store/cart.tsx` — cut over `CartApi` to server state: on mount `GET /api/cart`; `add/setQty` call the API and re-read (optimistic update + revalidate). Keep `open`, `toast`, `openCart`, `closeCart`, `notify` local. **`items` becomes variant-keyed line objects**, not `Record<productId, qty>`. `subtotal`/`count` come from the server response (do not recompute from static `PRODUCTS`).
- `src/components/CartDrawer.tsx` — render server line items (use `productName`, `variantLabel`, `unitPrice`, `lineTotal`); qty steppers call `setQty(variantId, …)`. Keep WhatsApp button (Task 2.5) **and** add the Razorpay "Pay now" button (Task 2.3b).
- `src/components/ProductCard.tsx` — the quick-add `+` must resolve a **variant id**. A card add has no chosen pack/size → add the product's **default variant** (cheapest active `pack` for pads, or open the PDP for panties which require a size). Change `add(id)` → `add(defaultVariantId)`. The product payload from `listProducts()` already includes `variants[]` (see `toProduct`), so pick `variants.find(v => v.active)` cheapest.
- `src/screens/ProductDetail.tsx` — map the selected pack/size to its `ProductVariant.id` and call `add(variantId)` × qty (replace the current `add(product.id)` loop). Disable "Add to bag" when the selected variant `stock <= 0` (Task 2.4). The PDP already has `variants` on the product object.

### Edge cases
- Cookie missing/expired → create fresh guest cart.
- Adding a variant already in cart → increment (unique constraint), not duplicate.
- Qty request exceeds stock → clamp and toast "Only N left".
- Inactive/archived variant in an old cart → mark line "unavailable", exclude from subtotal, block checkout.
- Guest with items logs in and already has a user cart → merge sums; deleted guest cart; cookie cleared.
- Concurrent add from two tabs → unique constraint + upsert makes it safe.

### Acceptance check
Add a 6-pack to the cart, refresh the page → cart still has the 6-pack line with correct `variantLabel`/price. Add the same product's 3-pack → two distinct lines. As a guest add an item, then log in → the item appears in the logged-in cart (merge). Verified via `GET /api/cart` and a Prisma query on `CartItem`.

---

## Task 2.2 — Checkout endpoint: recompute totals, validate stock, create order (Epic 2.2)

`POST /api/checkout` turns the cart into a `pending` Order + `OrderItem` snapshots and a Razorpay Order (Razorpay creation detailed in Task 2.3a — same handler).

### Endpoint
`app/api/checkout/route.ts` → `POST` (`runtime = 'nodejs'`).

**Input (Zod):**
```ts
{ addressId?: string,                        // existing Address (logged-in)
  contact?: { name, phone, email?, line, city, state?, pincode },  // guest / new address
  couponCode?: string,
  channel?: 'web' }                          // 'whatsapp' handled separately (Task 2.5)
```
Cart is resolved **server-side** (cookie/session) — never trust a client cart body.

### Logic (in `src/lib/services/checkout.ts`)
1. `resolveCart()` + load items with `variant` (price, stock, active) and `variant.product` (name).
2. **Reject** empty cart (400), any inactive variant (409 "item unavailable"), any line with `qty > variant.stock` (409 "insufficient stock", include which variant). This is fail-fast; the **authoritative** stock guard is the conditional decrement at capture (Task 2.3d).
3. Resolve coupon by `couponCode` (case-insensitive) → validate per **§4**; 400 on invalid coupon.
4. `computeTotals()` (**§4**) → `{ subtotal, discount, shipping, total }`.
5. Resolve shipping identity:
   - Logged-in + `addressId` → verify the address belongs to `auth().userId` (ownership; 403 otherwise).
   - Guest → **(C1 recommended)** write `contact` into `Order` snapshot fields; **(C2 no-migration)** `upsert User by phone` (role `customer`) then create/attach an `Address`, set `order.userId`.
6. `orderNo = genOrderNo()` → format `FM9-YYYYMMDD-XXXX` (date + 4 base36 random or a daily counter). Must satisfy `Order.orderNo @unique` — retry on collision.
7. Create in one `prisma.$transaction`:
   - `Order` (`status: pending`, `subtotal`, `discount`, `shipping`, `total`, `addressId?`/snapshot, `couponId?`, `affiliateId?` (Task 2.3d attribution), `channel`, `userId?`).
   - `OrderItem[]` — snapshot **`productName`, `variantLabel`, `unitPrice`, `qty`, `lineTotal`** from the live variant/product (never client values).
   - **Do NOT decrement stock or increment coupon usage here** — those happen exactly once at payment capture (Task 2.3d), so abandoned checkouts don't hold stock or burn coupons.
8. Create the Razorpay Order + `Payment` row → **Task 2.3a** (same request).
9. Return `{ orderId, orderNo, amount: total, razorpayOrderId, keyId: NEXT_PUBLIC_RAZORPAY_KEY_ID, prefill }`.
10. Emit `EventLog { type: 'checkout', userId?, meta:{ orderId, total } }`.

### Idempotency
A double-submit must not create two orders/Razorpay orders. Either: reuse the cart's existing open `pending` order if one exists with an unpaid Razorpay order (recreate Razorpay order only if amount changed), or require an `idempotencyKey` (schema addition **D**) and upsert on it. Recommended: **one open pending order per cart** — on re-checkout, if a `pending` order for this cart exists and totals are unchanged, return it.

### Edge cases
- Price changed between add-to-cart and checkout → totals recomputed from DB; client sees the authoritative total (show a confirm if it differs).
- Coupon becomes invalid between apply and pay → re-validated at capture indirectly (usage incremented at capture; if `maxUses` now exceeded, still honor this order since price already computed — or re-check and fail gracefully; document choice).
- Cart mutated after order created but before payment → order is a snapshot; cart changes don't affect it. Clear cart only on successful capture.
- Guest with no `contact` and no `addressId` → 400.

### Acceptance check
`POST /api/checkout` with a tampered price in the body → response `total` matches `Σ variant.price×qty` from DB (client value ignored). An `Order` + `OrderItem[]` exist with correct snapshots; stock is **unchanged** (not yet decremented). `GET` the order shows the right line items by variant id. Overselling attempt (qty > stock) → 409 before any order is created.

---

## Task 2.3 — Razorpay: order create, Checkout modal, verify, webhook, fulfillment (Epic 2.3)

### 2.3a — Create Razorpay Order (inside `/api/checkout`)

`src/lib/services/razorpay.ts` (`server-only`):
```ts
import Razorpay from 'razorpay'
export const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! })
```
In checkout after the order tx:
- `rzp.orders.create({ amount: toPaise(order.total), currency: 'INR', receipt: order.orderNo, notes: { orderId } })`.
- Create `Payment { orderId, provider:'razorpay', razorpayOrderId: rzpOrder.id, amount: order.total, status: 'created' }`.
- Return `razorpayOrderId` to the client.

**Edge:** Razorpay API failure → mark order `pending` (leave it; reconciliation/user retry), return 502. Don't leave a half-created payment — create the `Payment` row only after `orders.create` succeeds.

### 2.3b — Client Checkout modal

**Files:** `src/lib/loadRazorpay.ts` (inject `checkout.js` once, resolve when `window.Razorpay` ready), edit `src/components/CartDrawer.tsx` (add "Pay securely" primary button beside the WhatsApp button).

Flow:
1. Button → `POST /api/checkout` → receive `{ razorpayOrderId, amount, keyId, orderNo, prefill }`.
2. `await loadRazorpay()`; `new window.Razorpay({ key: keyId, order_id: razorpayOrderId, amount: toPaise(amount), currency:'INR', name:'Femi9', prefill, handler })`.
3. `handler(resp)` → `POST /api/payments/verify` with `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`. On success → close drawer, clear cart client state, route to `/account` order view (or a confirmation screen) using `router-compat`.
4. `modal.ondismiss` → leave order `pending` (reconciliation/webhook will resolve; user can retry).

**Edge:** popup blocked / script fails to load → fall back to WhatsApp button (Task 2.5). Never show "paid" from the client alone — the confirmation UI must reflect the server's verified status.

### 2.3c — Verify endpoint + Webhook (source of truth, idempotent)

Both routes call the **same** `fulfillOrder()` (Task 2.3d). `runtime='nodejs'`.

**`app/api/payments/verify/route.ts`** (`POST`) — synchronous verification:
- HMAC: `expected = hmacSHA256(`${razorpay_order_id}|${razorpay_payment_id}`, RAZORPAY_KEY_SECRET)`; timing-safe compare to `razorpay_signature`. Mismatch → 400 (do not fulfill).
- Find `Payment` by `razorpayOrderId`; set `razorpayPaymentId`, `signatureVerified=true`.
- Call `fulfillOrder(orderId, { paymentId, method, raw })`. Return `{ status: order.status }`.

**`app/api/webhooks/razorpay/route.ts`** (`POST`) — authoritative:
- Read **raw body**: `const body = await req.text()`.
- Verify `X-Razorpay-Signature` = `hmacSHA256(body, RAZORPAY_WEBHOOK_SECRET)` (timing-safe). Invalid → 400, log.
- Parse; **idempotency**: insert `WebhookEvent { id: event.id }` (schema **B**) — on unique-conflict, return `200` no-op. (Fallback without B: dedupe via `Payment.razorpayPaymentId @unique` + status guard.)
- Route by `event`:
  - `payment.captured` / `order.paid` → resolve order via `notes.orderId` or `razorpayOrderId` → `fulfillOrder(...)` (idempotent).
  - `payment.failed` → mark `Payment.status='failed'`; leave order `pending` (user can retry) or `cancelled` after N failures.
  - `refund.processed` / `refund.created` → reconcile refund state (Task 2.3f).
- **Always return 200** for signed, understood events (even no-ops) so Razorpay stops retrying; 4xx only for bad signature/malformed.

**Idempotency guarantees:** (1) `WebhookEvent.id` unique; (2) `Payment.razorpayPaymentId @unique`; (3) `fulfillOrder` only does work on the `pending → paid` transition (see 2.3d). Any duplicate delivery is a no-op.

### 2.3d — `fulfillOrder()` — one transaction: capture, stock, points, affiliate

`src/lib/services/fulfillment.ts` → `fulfillOrder(orderId, { paymentId, method, raw })`. **The only place stock/points change.**

Guard (before tx): load order. If `order.status !== 'pending'` → **return no-op** (already fulfilled). This is the core idempotency gate.

`prisma.$transaction(async (tx) => { ... })`:
1. **Re-read order status inside tx** (`SELECT … FOR UPDATE` semantics via a conditional update). Use `tx.order.updateMany({ where:{ id, status:'pending' }, data:{ status:'paid' } })`; if `count === 0` → another worker won → throw `AlreadyFulfilled` (caught → no-op). This makes the whole routine race-safe.
2. **Payment:** `tx.payment.update` → `status:'captured'`, `razorpayPaymentId`, `method`, `signatureVerified: true`, `raw`.
3. **Stock — authoritative conditional decrement** per order item:
   `const r = tx.productVariant.updateMany({ where:{ id: variantId, stock:{ gte: qty } }, data:{ stock:{ decrement: qty } } })`; if `r.count !== 1` → **throw `OutOfStock`** (rolls back the whole tx). Overselling is impossible.
4. **Points** (only if `order.userId`): `earned = order.total * pointsPerRupee`; if this is the user's first `paid` order add `firstOrderBonusPoints`. Compute `balanceAfter = currentBalance + earned` (currentBalance = sum of prior `PointsLedger.delta` for the user, or last row's `balanceAfter`). Insert `PointsLedger { userId, delta: earned, reason:'order', orderId, balanceAfter }`. Guard: skip if a ledger row with this `orderId` and `reason:'order'` already exists.
5. **Coupon:** if `order.couponId` → `tx.coupon.update({ increment usedCount })` (once, guarded by the status transition in step 1).
6. **Affiliate attribution** (minimal; full program is Phase 4): if `order.affiliateId` set (from the `femi9_ref` attribution cookie captured at checkout) → insert `AffiliateEvent { affiliateId, type:'order', orderId, amount: order.subtotal, commission: round(subtotal × commissionPct) }`, guarded by existing event for this `orderId`. `commissionPct` from `Setting['affiliateCommissionPct']` (add setting; default e.g. 10).
7. Emit `EventLog { type:'purchase', userId?, meta:{ orderId, total } }`.

After tx (best-effort, non-transactional):
- `clearCart(order.cartId)` — clear the buyer's cart.
- **Notification hook**: `notifyOrderConfirmed(order)` — Phase 5 sends email/SMS; Phase 2 logs (or calls Resend if `RESEND_API_KEY` set). Never let a notification failure roll back fulfillment.

**Handle the `OutOfStock` rollback** (step 3): order stays `pending`, payment is captured at Razorpay but we can't fulfill → **auto-refund** via Task 2.3f (`refundOrder(orderId, reason:'oversold')`), set `Order.status='cancelled'`, notify the customer. This is the rare last-unit race and must be handled, not ignored.

### Acceptance check (2.3)
In Razorpay **test mode**, complete a UPI/card payment → `/api/payments/verify` returns `status:'paid'`; `Order.status='paid'`, `Payment.status='captured'` + `signatureVerified=true`, each ordered `ProductVariant.stock` decremented by its qty exactly once, one `PointsLedger` row (`delta = total×pointsPerRupee` [+bonus on first order], `balanceAfter` correct). **Re-deliver the same webhook** (Razorpay dashboard "resend" or replay the payload) → no second stock decrement, no second points row, endpoint returns 200. Tamper the signature on `/verify` → 400, order stays `pending`.

---

## Task 2.3e — Reconciliation cron for stuck `pending` orders

Some payments capture at Razorpay but the client never returns and the webhook is lost/delayed. A scheduled job resolves them.

### Files
- `app/api/cron/reconcile/route.ts` — `POST`/`GET`, `runtime='nodejs'`. **Auth:** require header `Authorization: Bearer ${CRON_SECRET}`; 401 otherwise (this is the only guard — it's not behind session middleware).
- `src/lib/services/reconcile.ts` → `reconcilePendingOrders({ olderThanMin = 10, limit = 200 })`.

### Logic
Select `Order` where `status='pending'` AND `placedAt < now - olderThanMin` AND has a `Payment.razorpayOrderId`. For each:
- `rzp.orders.fetch(razorpayOrderId)` and `rzp.orders.fetchPayments(razorpayOrderId)`.
- If a payment is `captured` → call `fulfillOrder(orderId, {...})` (idempotent).
- If a payment is `authorized` but not captured → capture it (`rzp.payments.capture`) then fulfill, or cancel per policy.
- If order/payment `failed`/expired and older than a longer TTL (e.g. 2h) → `Order.status='cancelled'` (nothing to restock — stock is only decremented on capture).
- Log a summary `EventLog { type:'reconcile', meta:{ scanned, fulfilled, cancelled } }`.

### Scheduling (AWS)
EventBridge Scheduler rule every **10 min** → HTTPS `POST https://<domain>/api/cron/reconcile` with the `Authorization: Bearer` header (secret from Secrets Manager). Document in `docs/phases/phase-2-commerce.md` and infra. **No `vercel.json` cron** (we're on ECS Fargate).

### Edge cases
- Cron overlaps a live webhook for the same order → both call `fulfillOrder`; the status-transition guard makes exactly one win.
- Razorpay rate limits → cap `limit`, add small delay, resume next run.
- Idempotency: safe to run repeatedly; already-paid orders are skipped by the `WHERE status='pending'`.

### Acceptance check
Create a paid-at-Razorpay order but **do not** hit `/verify` (simulate a dropped webhook). Run `POST /api/cron/reconcile` with the secret → the order flips to `paid`, stock/points update exactly once. Without the secret → 401.

---

## Task 2.3f — Refunds (Razorpay Refunds API; reverse points)

Refund is triggered by staff (Phase 3 admin UI consumes this API) or automatically on the oversold-rollback path (Task 2.3d).

### Files
- `app/api/admin/orders/[orderId]/refund/route.ts` — `POST`, `runtime='nodejs'`. **Guard:** staff/admin only (Phase 1 middleware / `auth()` role check). Body: `{ amount?: number  // rupees, default = remaining; reason?: string }`.
- `src/lib/services/refunds.ts` → `refundOrder(orderId, { amount?, reason })`.

### Logic
1. Load order + its captured `Payment`. Reject if not `captured` or already fully `refunded` (400).
2. `refundAmount = amount ?? (payment.amount - payment.amountRefunded)`; reject if `> remaining` (400).
3. `rzp.payments.refund(payment.razorpayPaymentId, { amount: toPaise(refundAmount), notes:{ orderId, reason } })`.
4. `prisma.$transaction`:
   - `Payment` → `razorpayRefundId` (schema **A**), `amountRefunded += refundAmount`, `status = amountRefunded >= amount ? 'refunded' : 'captured'`.
   - `Order.status = 'refunded'` (full) — for partial, keep prior fulfillment status and record partial via payment fields.
   - **Reverse points:** if points were awarded for this order, insert `PointsLedger { delta: -awarded, reason:'refund', orderId, balanceAfter: balance - awarded }` (idempotent: skip if a `reason:'refund'` row for this order exists). For partial refunds, reverse proportionally (`round(awarded × refundAmount/total)`).
   - **Optional restock:** on full refund/cancel, `ProductVariant.stock` increment by each item qty (policy — document; default: restock on full refund, not partial).
   - If `order.affiliateId` → reverse/zero the commission `AffiliateEvent` (insert offsetting event or mark), so affiliates aren't paid on refunded orders.
5. Emit `EventLog { type:'refund', meta:{ orderId, amount: refundAmount } }`. Notification hook (Phase 5).

### Idempotency
Keyed on `Payment.razorpayRefundId @unique` (schema **A**) — a repeated refund call for the same intent must not double-refund. The `reason:'refund'` ledger guard prevents double points reversal.

### Edge cases
- Refund already processed at Razorpay but our webhook `refund.processed` also arrives → reconcile to the same state (no double reversal).
- Partial refunds: track cumulative `amountRefunded`; block over-refund.
- Refund on an order whose points were already redeemed → balance may go negative; policy: allow negative or clamp — **document and pick clamp-at-0 with an audited note** unless finance says otherwise.

### Acceptance check
Refund a paid test order via `POST /api/admin/orders/:id/refund` → Razorpay shows the refund, `Payment.status='refunded'`, `Order.status='refunded'`, a negative `PointsLedger` row reverses the earned points (balance returns to pre-order value). Second call for the same refund → no double reversal. Non-staff caller → 403.

---

## Task 2.4 — Inventory guards (Epic 2.4)

Stock already lives on `ProductVariant.stock`. This task adds the low-stock threshold and enforces out-of-stock everywhere.

### Data
`ProductVariant.stock`, `ProductVariant.active`. Low-stock threshold from `Setting['lowStockThreshold']` (add setting, default 10) — no schema change.

### Files
- Edit `src/lib/services/products.ts` — surface `stock` + a derived `inStock: stock > 0` and `lowStock: stock <= threshold` on each variant (the mapper already carries `stock`). Filter the default-add variant to in-stock ones.
- Enforce in `src/lib/services/cart.ts` (add/setQty clamp to stock), `src/lib/services/checkout.ts` (reject `qty > stock`), `src/lib/services/fulfillment.ts` (authoritative conditional decrement — Task 2.3d step 3).
- UI: `src/components/ProductCard.tsx` + `src/screens/ProductDetail.tsx` — disable add / show "Out of stock" / "Only N left" when the resolved variant is out of/low on stock.

### Edge cases
- All variants of a product out of stock → card shows "Out of stock", PDP add disabled.
- Stock reaches 0 mid-checkout → conditional decrement fails at capture → auto-refund (Task 2.3d).
- Negative stock must be impossible (conditional `stock >= qty` guarantees it).

### Acceptance check
Set a variant `stock=0` (Prisma or admin) → it cannot be added to cart and checkout rejects it (409); the PDP add button is disabled. Two simultaneous captures for the last unit → exactly one succeeds, the other rolls back and is auto-refunded; `stock` never goes negative.

---

## Task 2.5 — Keep WhatsApp as a fallback (Epic 2.5)

Razorpay is primary; WhatsApp stays as a secondary path so a shopper is never blocked (script/popup failure, payment aversion).

### Files
- `src/components/CartDrawer.tsx` — keep the existing `checkout()` WhatsApp handler and button; **add** the Razorpay "Pay securely" button above it (Task 2.3b). Both visible.
- `src/data/products.ts` — `WA_NUMBER` stays; also expose it via `Setting['whatsappNumber']` (already seeded) for future admin edit. WhatsApp message can now enumerate **variant** lines (`productName · variantLabel × qty`) from the server cart instead of product-only lines.
- Optionally record a WhatsApp intent: `POST /api/checkout` with `channel:'whatsapp'` to create an `Order { channel:'whatsapp', status:'pending' }` **without** a Razorpay order, so WhatsApp orders appear in the admin console (Phase 3) and can be marked paid manually. Keep this optional — the minimum is the existing `wa.me` deep link.

### Edge cases
- WhatsApp order has no online payment → stays `pending`/manual; **it must not** decrement stock or award points until staff confirm (no `fulfillOrder` call). Points/stock only move through `fulfillOrder`, which WhatsApp never triggers automatically.
- Keep the free-ship hint in the drawer (`Setting['freeShipThreshold']`, not the hardcoded `FREE_SHIP`).

### Acceptance check
The cart drawer shows **both** "Pay securely" (Razorpay) and "Checkout on WhatsApp". The WhatsApp deep link opens with correct variant lines and total. A WhatsApp-channel order (if implemented) shows `channel:'whatsapp'` and does not touch stock/points until manually confirmed.

---

## 5. Cross-cutting: idempotency & consistency invariants (must hold)

1. **Stock and points change in exactly one place** — `fulfillOrder()`, inside a transaction, gated by the `pending → paid` conditional update. Verify + webhook + reconcile all funnel through it.
2. **Every external-payment side effect is idempotent** — dedupe keys: `WebhookEvent.id`, `Payment.razorpayPaymentId @unique`, `Payment.razorpayRefundId @unique`, and `PointsLedger` (orderId + reason) guards.
3. **Server is authoritative on money** — client prices/totals are never trusted; `computeTotals()` recomputes from `ProductVariant.price` + `Setting`.
4. **Overselling is impossible** — conditional `stock >= qty` decrement; failure rolls back and refunds.
5. **Node runtime + raw body** on every Razorpay route; webhook verifies signature before parsing.
6. **Ownership** — order reads and refunds check `auth().userId`/role (Phase 1).

---

## 6. Endpoint summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/cart` | session/guest cookie | current cart |
| POST | `/api/cart` | session/guest | add item `{variantId, qty?}` |
| PATCH/DELETE | `/api/cart/items/[variantId]` | session/guest | set qty / remove |
| POST | `/api/checkout` | session/guest | recompute totals, create Order + Razorpay Order |
| POST | `/api/payments/verify` | session/guest | verify signature, fulfill (sync) |
| POST | `/api/webhooks/razorpay` | Razorpay signature | fulfill / refund (source of truth) |
| POST/GET | `/api/cron/reconcile` | `CRON_SECRET` bearer | resolve stuck pending orders |
| POST | `/api/admin/orders/[orderId]/refund` | staff/admin | refund + reverse points |

---

## 7. Test / verification plan

- **Unit:** `computeTotals` (free-ship boundary, flat vs pct coupon, minOrder reject, expired/maxed coupon); `applyCoupon`; `genOrderNo` uniqueness; HMAC verify (good/bad signature) for both verify and webhook.
- **Integration (test Razorpay keys):** happy path (checkout → Checkout modal → verify → paid); dropped-webhook → reconcile; duplicate webhook → no-op; oversold last-unit race → one success + one auto-refund; refund → points reversed; guest checkout → order recorded; guest→login cart merge.
- **Manual smoke (phase-done):** a customer places a real order, pays in Razorpay test mode, stock and points update exactly once, the order is recorded and visible in `/account`. WhatsApp checkout still works.

**Phase 2 is done when:** a customer places a real order, pays via Razorpay (test mode), stock/points update exactly once (idempotent under duplicate/late webhooks), the order is recorded, and WhatsApp remains available as a fallback.
