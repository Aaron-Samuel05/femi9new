# Phase 5 — Lifecycle & Content — Implementation Spec

> **Goal (from `Femi9-Backend-Tasks.md`):** retention + content self‑serve. Subscriptions renew,
> cycle predictions are real, and blog/homepage content is editable without a deploy.
>
> **Scope of this spec (Epics 5.1–5.4):**
> 1. Subscription CRUD + renewal cron (EventBridge Scheduler) that generates orders.
> 2. `CyclePredictionService` computing predictions from `PeriodLog`/`SymptomLog`, encrypted at rest, ownership‑restricted.
> 3. Blog + homepage CMS editing in `/admin`.
> 4. Notification service (SES email / SNS **or** MSG91 SMS / WhatsApp templates).
>
> This document is written to be executed **without further design work**. Every task lists the exact files,
> endpoints/functions, tables/fields touched, edge cases, and a testable acceptance check.

---

## 0. Conventions this phase must follow (already established in Phase 0)

These are load‑bearing — new code must match them exactly.

- **Path alias:** `@/*` → `./src/*` (see `tsconfig.json`). Services live in `src/lib/services/`, imported as `@/lib/services/<name>`. API route handlers live under `app/api/**/route.ts`.
- **Service layer:** every service file starts with `import 'server-only'` then `import { prisma } from '@/lib/db'`. Business rules live in services; route handlers are thin. Server is always the source of truth on price (see `src/lib/services/cart.ts`).
- **Response envelope:** use `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `serverError`, and the `handle()` wrapper from `src/lib/api.ts`. Do not hand‑roll `NextResponse.json`.
- **Validation:** Zod (`zod@4`) `safeParse` on every mutation body; on failure return `badRequest('...', parsed.error.flatten())`. Pattern: `app/api/events/route.ts`.
- **Dynamic routes:** any handler that reads a session/cookie or must not be statically cached gets `export const dynamic = 'force-dynamic'`.
- **Prisma singleton:** always import `prisma` from `@/lib/db` (never `new PrismaClient()`).
- **Runtime:** these routes call the AWS SDK, Prisma, and Node crypto → add `export const runtime = 'nodejs'` to every new route handler in this phase (never `edge`).

### Stack note (this phase deviates from the Phase‑0 env comments)

The fixed production stack is **AWS ECS Fargate + Aurora Serverless v2 + Prisma**. Cron is **EventBridge Scheduler**; mail is **SES**; SMS is **SNS or MSG91**; WhatsApp via a template provider. The current `.env.example` still names Resend / Vercel Blob / Upstash (Phase‑0 placeholders). Update `.env.example` as part of this phase (see §3). On Fargate, AWS credentials come from the **ECS task IAM role** — do **not** add `AWS_ACCESS_KEY_ID`/`SECRET` env vars; grant the task role `ses:SendEmail`, `sns:Publish`, `kms:Encrypt`, `kms:Decrypt`, `kms:GenerateDataKey`.

---

## 1. Dependencies on earlier phases

| Needs | From | Used by |
|---|---|---|
| `auth()` session + `role` on `User`; `/account`, `/dashboard` login guard; `/admin` staff/admin guard; ownership checks | **Phase 1** | All of 5.1, 5.2, 5.3 (admin), 5.4 |
| `Order`/`OrderItem`/`Payment` write path, `orderNo` generator, pricing rules (free‑ship threshold, subscribe‑save %), Razorpay client + webhook handler, stock decrement | **Phase 2** | 5.1 renewal cron reuses the order‑creation service and extends the Razorpay webhook for Payment Links |
| `/admin` shell + admin route guard; editable `Setting` rows | **Phase 3** | 5.3 CMS lives inside the admin shell and reuses the settings pattern |
| Notification provider accounts wired for partner/affiliate emails; `PointsLedger`/`Coupon`/`RewardOption` for redemption emails | **Phase 4** | 5.4 generalizes the provider work Phase 4 started; several 5.4 triggers fire from Phase‑1/2/4 code paths |

> **Phase‑1 helpers assumed to exist** (import, don't re‑create): a server helper that returns the authenticated user or throws/redirects, e.g. `getSessionUser()` and `requireStaff()`. If Phase 1 named them differently, adapt imports — the contract used below is:
> - `getSessionUser(): Promise<{ id: string; role: Role } | null>`
> - `requireStaff(): Promise<{ id: string; role: Role }>` (throws → 403 for non‑staff/admin).
>
> If these are not yet present, add them to `src/lib/session.ts` (which today only holds the guest‑cart cookie helpers) before starting 5.1.

> **Phase‑2 helper assumed to exist:** an order‑creation service that snapshots line items and generates `orderNo`. If Phase 2 left checkout logic inline in the route handler, **extract** a reusable function `createOrder(...)` into `src/lib/services/orders.ts` first (renewal calls it). See Task 5.1.2.

---

## 2. Founder‑action blockers (🔒 — cannot be created on your behalf)

Build proceeds on test credentials; go‑live is gated on these.

| # | Item | Blocks | Notes |
|---|---|---|---|
| A | **Razorpay** account + KYC (already needed in Phase 2). **Payment Links** must be enabled on the account. | 5.1 renewal pay‑link | Test keys are enough to build; live keys gated at Launch. |
| B | **Amazon SES**: verify sending domain (DKIM/SPF DNS records) **and** request production access (move out of the SES sandbox). | 5.4 email | In sandbox, SES only sends to verified addresses — fine for dev, blocks real customers. Requires DNS access. |
| C | **SMS provider decision + registration**: **SNS SMS** (needs India DLT entity + sender‑ID + template registration) **or** **MSG91** (DLT sender ID + approved template IDs). | 5.4 SMS/OTP | India TRAI DLT template approval is the long‑pole; start early. This is PRD open decision "OTP provider". |
| D | **WhatsApp Business** template provider (Meta Cloud API directly, or via MSG91/Gupshup/Twilio) + **approved message templates**. | 5.4 WhatsApp | Templates need Meta approval (24–48h). |
| E | **AWS KMS key** for cycle‑data encryption (symmetric, key‑policy grants the ECS task role encrypt/decrypt). | 5.2 encryption | Dev can create it if they have AWS console/IAM access; otherwise founder provisions. |
| F | **Subscription payment model decision** (PRD open decision #2): **pay‑link reminder** (this spec's default) vs **auto‑charge** (Razorpay subscriptions/mandates, e‑NACH/UPI Autopay). | 5.1 | This spec implements **pay‑link**. Auto‑charge is a larger, separate build; noted as a variant at the end of 5.1. |

---

## 3. Schema additions required (before writing feature code)

`schema.prisma` today has **no** link from `Order` to `Subscription`, **no** notification log, **no** consent flag, and stores cycle logs in **plaintext**. The following additions are required. Add them, then `npm run db:migrate -- --name phase5_lifecycle` (dev) — this generates a migration under `prisma/migrations/`. Regenerate the client with `npm run db:generate`.

### 3.1 Link renewal orders to their subscription (5.1)

```prisma
// model Order — ADD these two lines
  subscriptionId String?
  subscription   Subscription? @relation(fields: [subscriptionId], references: [id])

// model Subscription — ADD back‑relation
  orders Order[]
```
Renewal orders also set `channel = "subscription"` (the `Order.channel` field already exists; no change needed there).

### 3.2 Cycle data: encrypt at rest + consent flag (5.2)

**Recommended (defense‑in‑depth): application‑level field encryption via KMS.** Replace the plaintext sensitive columns with an opaque ciphertext blob. Per‑user row counts are tiny (dozens), so the prediction service fetches all of a user's rows and decrypts in memory — no DB‑side filtering on the sensitive fields is needed.

```prisma
model PeriodLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Bytes    // KMS ciphertext of JSON { startDate: ISO8601, lengthDays: number }
  createdAt DateTime @default(now())

  @@index([userId])
}

model SymptomLog {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Bytes    // KMS ciphertext of JSON { date: ISO8601, symptom: string, level: 0..3 }
  createdAt DateTime @default(now())

  @@index([userId])
}

model User {
  // ... existing fields ...
  healthDataConsentAt DateTime? // set when the user opts in to de‑identified aggregate use; null = no consent
}
```

Removed from `PeriodLog`: `startDate`, `lengthDays`. Removed from `SymptomLog`: `date`, `symptom`, `level`.

**Tradeoff to accept:** you can no longer `ORDER BY startDate` / `WHERE date >` in SQL for these tables. That is deliberate — those values are the sensitive signal. Sorting happens in the service after decrypt.

**Migration note:** if any real cycle rows already exist (unlikely at Phase 5 — cycle tracking ships here), write a one‑off backfill script that reads plaintext, encrypts, writes `data`. In practice this is a clean cutover.

**Baseline fallback (only if the KMS work must be deferred):** rely on Aurora's at‑rest KMS volume encryption + strict ownership + zero admin read of these tables, keeping the plaintext columns. This satisfies "encrypted at rest" at the storage layer but **not** field‑level. Document the decision if you take it; the recommended path is field‑level.

### 3.3 Notification audit + idempotency log (5.4)

```prisma
enum NotificationChannel {
  email
  sms
  whatsapp
}

enum NotificationStatus {
  queued
  sent
  failed
}

model NotificationLog {
  id         String              @id @default(cuid())
  userId     String?
  user       User?               @relation(fields: [userId], references: [id], onDelete: SetNull)
  channel    NotificationChannel
  template   String              // e.g. "order_confirmation"
  to         String              // destination email / E.164 phone
  dedupeKey  String?             @unique // idempotency, e.g. "order_confirmation:<orderId>"
  status     NotificationStatus  @default(queued)
  providerId String?             // SES MessageId / MSG91 request id / WA message id
  error      String?
  payload    Json?               // template variables actually sent
  createdAt  DateTime            @default(now())
  sentAt     DateTime?

  @@index([userId])
  @@index([template])
}

// model User — ADD back‑relation
  notifications NotificationLog[]
```

### 3.4 Homepage content — **no schema addition**

Homepage sections (hero, impact stats) are stored as `Setting` rows (`key`/`value: Json`) — the existing "customizable backend" pattern (`src/lib/services/settings.ts`). Blog posts already have a model (`BlogPost`) and status enum (`ModerationStatus`), which we reuse for draft→publish. Do **not** invent a `ContentBlock` table.

### 3.5 (Optional) Payment‑link id on `Payment`

Payment Links can be tracked by storing the link id in `Payment.raw` (Json) and reusing `razorpayOrderId`. If you prefer a first‑class column, add `razorpayLinkId String?` to `Payment`. This spec uses `raw` + `razorpayOrderId` to avoid churn; the optional column is noted for the implementer.

### 3.6 Environment variables to add (`.env.example` + real `.env`)

```bash
# Cron (EventBridge Scheduler → protected route)
CRON_SECRET=""                       # shared secret; EventBridge injects it as x-cron-secret

# AWS (region only — creds come from the ECS task role on Fargate)
AWS_REGION="ap-south-1"

# KMS (cycle-data field encryption)
KMS_CYCLE_KEY_ID=""                  # key id or ARN of the symmetric CMK

# SES (transactional email)
SES_FROM_EMAIL="hello@femi9.in"
SES_CONFIGURATION_SET=""             # optional, for bounce/complaint tracking

# SMS — pick ONE provider (decision C)
SMS_PROVIDER="msg91"                 # "sns" | "msg91"
SNS_SMS_SENDER_ID=""                 # if SMS_PROVIDER=sns
MSG91_AUTH_KEY=""                    # if SMS_PROVIDER=msg91 (already stubbed in Phase 1)
MSG91_SENDER_ID=""
MSG91_OTP_TEMPLATE_ID=""             # DLT template ids per message type
MSG91_ORDER_TEMPLATE_ID=""

# WhatsApp (Meta Cloud API, or provider passthrough)
WHATSAPP_PROVIDER="meta"             # "meta" | "msg91"
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_TOKEN=""
WHATSAPP_TEMPLATE_ORDER="femi9_order_confirmation"

# Razorpay Payment Links (reuses existing RAZORPAY_* keys from Phase 2)
```

---

## Epic 5.1 — Subscriptions

**Acceptance (from tasks doc):** *Due subscriptions generate orders; "saved so far" computed from real orders. Subscription CRUD (pause/skip/change/cancel) from `/account`.*

Data model recap (`Subscription`): `userId`, `variantId`, `qty`, `cadenceId`, `status` (`active|paused|cancelled`), `nextDeliveryAt`, `savedTotal`, timestamps. `Cadence` has `days` (`cycle`=25, `4w`=28, `6w`=42 per `src/data/products.ts`). Subscribe‑save % is `Setting.subscribeSavePct` (default 15); per‑unit sub price = `round(price * (100 - pct) / 100)` (mirror `subPrice()` in `src/data/products.ts`).

### Task 5.1.1 — Subscription CRUD service + endpoints

**Files to create:**
- `src/lib/services/subscriptions.ts` — service.
- `app/api/subscriptions/route.ts` — `GET` (list own), `POST` (create).
- `app/api/subscriptions/[id]/route.ts` — `GET` (one), `PATCH` (change/pause/resume/cancel), `DELETE` (cancel).
- `app/api/subscriptions/[id]/skip/route.ts` — `POST` (skip next delivery).

**Service functions (`src/lib/services/subscriptions.ts`):**
- `listSubscriptions(userId): Promise<SubscriptionDTO[]>` — own subs, newest first, include `variant → product (+first image)` and `cadence`. DTO carries: id, product name/slug/image, variantLabel, qty, cadence label/sub/days, status, `nextDeliveryAt`, per‑order price + full‑price, `savedTotal` (from real orders — see 5.1.3).
- `createSubscription(userId, { variantId, qty, cadenceId }): Promise<SubscriptionDTO>` — validate variant is `active`, cadence is `active`; compute `nextDeliveryAt = now + cadence.days` (00:00 UTC of that day); `qty >= 1`. Reject a duplicate active sub for the same `variantId` (return existing or `409`).
- `changeSubscription(userId, id, patch)` — patch may set `qty`, `variantId`, `cadenceId`, `status` (`paused`/`active`/`cancelled`). Ownership‑checked. On `variantId` change validate active; on `cadenceId` change validate active and (optionally) recompute `nextDeliveryAt` only if caller passes `recomputeNext: true`, else keep. Pause sets `status=paused`. Resume sets `status=active` and, if `nextDeliveryAt` is in the past, bumps it to `now + cadence.days`.
- `skipNext(userId, id)` — advance `nextDeliveryAt` by one `cadence.days` **without** creating an order; only valid when `status=active`.
- `cancelSubscription(userId, id)` — set `status=cancelled` (soft; keep row for history). Idempotent.

All mutating functions **must** re‑read the row scoped by `{ id, userId }` and throw a typed `NotOwnerError`/`NotFoundError` if it doesn't belong to the caller (mirror `UnknownVariantError` in `cart.ts`). Route maps these to `403`/`404`.

**Endpoints:**
| Method | Path | Auth | Body (Zod) | Returns |
|---|---|---|---|---|
| GET | `/api/subscriptions` | login | — | `{ subscriptions: SubscriptionDTO[] }` |
| POST | `/api/subscriptions` | login | `{ variantId, qty>=1, cadenceId }` | `201 SubscriptionDTO` |
| GET | `/api/subscriptions/:id` | login+owner | — | `SubscriptionDTO` |
| PATCH | `/api/subscriptions/:id` | login+owner | `{ qty?, variantId?, cadenceId?, status? , recomputeNext? }` | `SubscriptionDTO` |
| POST | `/api/subscriptions/:id/skip` | login+owner | — | `SubscriptionDTO` |
| DELETE | `/api/subscriptions/:id` | login+owner | — | `{ ok: true }` (status→cancelled) |

Every handler: `export const runtime = 'nodejs'`, `export const dynamic = 'force-dynamic'`, resolve `getSessionUser()` → 401 if null, pass `user.id` into the service.

**Data touched:** `Subscription` (all fields), reads `ProductVariant`, `Product`, `ProductImage`, `Cadence`, `Setting`.

**Edge cases:**
- Anonymous request → `401`.
- Subscription belongs to another user → `404` (do not leak existence via `403` vs `404` distinction — prefer `404`).
- `variantId`/`cadenceId` inactive or missing → `400`.
- Cancel a paused sub → allowed. Cancel an already‑cancelled sub → `200` no‑op (idempotent).
- Skip on a `paused`/`cancelled` sub → `400`.
- `qty` non‑integer / `<1` → `400`.
- Concurrent PATCH/skip races — always mutate via `updateMany({ where: { id, userId } })` or a `prisma.$transaction` re‑read, never a blind `update` on `id` alone.

**Acceptance check:**
```bash
# create, then verify it is owner-scoped and mutable
curl -sX POST /api/subscriptions -H 'content-type: application/json' \
  -d '{"variantId":"<v>","qty":2,"cadenceId":"<4w>"}'   # 201, status "active", nextDeliveryAt ~28d out
curl -sX POST /api/subscriptions/<id>/skip                # nextDeliveryAt jumps ~28d, no Order created
curl -sX PATCH /api/subscriptions/<id> -d '{"status":"paused"}'   # status paused
curl -sX DELETE /api/subscriptions/<id>                   # status cancelled
# ownership: as user B, GET /api/subscriptions/<A's id> → 404
```
Prisma assertion: `prisma.order.count({ where: { subscriptionId: '<id>' } })` is `0` after a `skip`.

### Task 5.1.2 — Renewal cron (EventBridge Scheduler → order generation + pay‑link)

**Files to create:**
- `src/lib/cron-auth.ts` — `assertCronRequest(req: Request): void` throws `UnauthorizedError` unless header `x-cron-secret === process.env.CRON_SECRET`.
- `src/lib/services/subscription-renewal.ts` — `runRenewals({ now?, limit? }): Promise<RenewalReport>`.
- `app/api/cron/subscriptions/renew/route.ts` — `POST`, guarded by `assertCronRequest`.
- (reuse/extract) `src/lib/services/orders.ts` — `createOrder(...)` (see Phase‑2 dependency note).
- `src/lib/services/razorpay.ts` — extend (or add) `createPaymentLink({ amount, orderNo, customer, notes })` using the Razorpay Payment Links API. If Phase 2 already created a Razorpay client module, add the function there.

**Function `runRenewals`:**
1. Select due subs: `status='active' AND nextDeliveryAt <= now`, ordered by `nextDeliveryAt asc`, `take: limit` (default 200; loop/paginate for larger batches). Uses index `@@index([status, nextDeliveryAt])`.
2. For **each** sub, in its own `prisma.$transaction`:
   a. Re‑read the sub `FOR` the guard: `updateMany({ where: { id, status:'active', nextDeliveryAt: { lte: now } }, data: { nextDeliveryAt: <next> } })`. If `count === 0`, another run already handled it → **skip** (this is the idempotency guard — advancing `nextDeliveryAt` and generating the order happen atomically).
   b. Compute `next = advance(nextDeliveryAt, cadence.days)` — advance from the **scheduled** date, not `now`, so cadence doesn't drift.
   c. Recompute price server‑side from `variant.price` and `Setting.subscribeSavePct`: `unit = subPrice(variant.price)`, `lineTotal = unit * qty`. Apply free‑ship threshold from settings.
   d. `createOrder(...)` with `channel:'subscription'`, `subscriptionId: sub.id`, one `OrderItem` snapshot (`productName`, `variantLabel`, `unitPrice=unit`, `qty`, `lineTotal`), `status:'pending'`, `userId`, primary `addressId` (the user's `isPrimary` address if any).
   e. Create a `Payment` row (`provider:'razorpay'`, `status:'created'`, `amount:total`) and a **Razorpay Payment Link**; store the link id in `razorpayOrderId` (or `razorpayLinkId` if you added it) and the link URL in `payment.raw`.
   f. Enqueue notification `subscription_renewal` (see 5.4) with the pay‑link URL, `dedupeKey = "subscription_renewal:" + order.id`.
3. Return `{ processed, ordersCreated, skipped, failed: [{subId, error}] }`. A single sub failing must **not** abort the batch — catch per‑sub, log, continue.

**Endpoint:** `POST /api/cron/subscriptions/renew` — `assertCronRequest(req)` → 401 on bad/missing secret; then `ok(await runRenewals({}))`. `export const runtime='nodejs'`, `export const dynamic='force-dynamic'`.

**EventBridge Scheduler wiring (infra, document in the PR / IaC):**
- Create an **EventBridge Scheduler** schedule, e.g. `rate(1 day)` at 02:00 IST, target = an **API destination** (HTTPS) pointing at `https://<domain>/api/cron/subscriptions/renew`, with a **Connection** that injects header `x-cron-secret: <CRON_SECRET>` (API‑key auth). Method `POST`.
- **Alternative** (no public cron endpoint): Scheduler target = **ECS RunTask** running the same service image with command override `["node","--import","tsx","scripts/cron/renew-subscriptions.ts"]`, where that script imports and calls `runRenewals`. Choose this if you'd rather not expose an HTTP trigger. Either way the business logic is the one `runRenewals` function.

**Data touched:** reads `Subscription`, `ProductVariant`, `Setting`, `Address`; writes `Order`, `OrderItem`, `Payment`, `Subscription.nextDeliveryAt`, `NotificationLog`.

**Payment completion (extends Phase 2 webhook):** in the existing Razorpay webhook route, handle `payment_link.paid` (and `payment.captured` referencing the link). On verified capture: mark `Payment.status='captured'`, `Order.status='paid'`, decrement stock, award points, update `Subscription.savedTotal` — reuse the Phase‑2 post‑payment transaction. Idempotent on `razorpayPaymentId` (unique) — duplicate webhooks are no‑ops.

**Edge cases:**
- Cron runs twice (Scheduler retry / overlap) → guard in step 2a makes the second run a no‑op (`count===0`).
- Sub paused/cancelled between selection and transaction → guard's `status='active'` predicate skips it.
- Variant went inactive / out of stock → still generate the pending order but flag it; **do not** decrement stock at renewal (stock moves only on payment capture, per Phase 2). If variant is inactive, skip renewal, notify the user to update the sub, and leave `nextDeliveryAt` advanced so it isn't retried every run (or leave unadvanced and alert — pick one; default: advance + notify "action needed").
- User has no address → still create the order (address collected on the pay‑link/checkout) — `addressId` nullable already.
- Razorpay/API failure creating the link → the whole per‑sub transaction rolls back (including the `nextDeliveryAt` advance) so it's retried next run; record the failure in the report.
- Large batch (>limit) → paginate until no due rows remain, or cap per run and let the next daily run catch up.
- `CRON_SECRET` unset in an environment → endpoint returns 401 for everyone (fail closed).

**Acceptance check:**
```bash
# seed a due sub, then invoke the cron with the secret
prisma: update one Subscription set nextDeliveryAt = now()-1d, status='active'
curl -sX POST /api/cron/subscriptions/renew -H "x-cron-secret: $CRON_SECRET"
# → report shows ordersCreated:1; a pending Order exists with channel='subscription', subscriptionId set,
#   one OrderItem snapshot, a Payment(status=created) with a razorpay link, and the sub's nextDeliveryAt advanced.
curl -sX POST /api/cron/subscriptions/renew -H "x-cron-secret: $CRON_SECRET"  # second run: ordersCreated:0 (idempotent)
curl -sX POST /api/cron/subscriptions/renew                                   # no header → 401
```

### Task 5.1.3 — "Saved so far" computed from real orders

**Requirement:** `savedTotal` (the "saved so far" the account page shows) must derive from real orders, not a hardcoded number.

**Implementation:** compute per‑order savings at renewal and on payment capture. Per subscription order, `savedThisOrder = (variant.price - subPrice(variant.price)) * qty` (full price minus sub price). On payment capture (Phase‑2 post‑payment txn), `Subscription.savedTotal += savedThisOrder`. In `listSubscriptions`, **verify** against real orders: sum `savedThisOrder` across `order.status IN (paid, processing, shipped, delivered)` where `order.subscriptionId = sub.id`. Expose the ledger‑derived value as the source of truth; keep the cached `savedTotal` column as a denormalized fast path but reconcile from orders on read.

Because line items snapshot only the *paid* unit price, store the full (non‑sub) unit price at order time in `OrderItem`? — it isn't in the schema. Instead compute savings from the settings %: `savedThisOrder = round(lineTotal * pct / (100 - pct))` (invert the discount), using the `subscribeSavePct` in effect. Simpler and avoids a snapshot column. Document which method you use; the % inversion is preferred (no schema change).

**Data touched:** reads `Order` (filtered by `subscriptionId` + paid‑ish status) and `OrderItem`; writes `Subscription.savedTotal`.

**Edge cases:** refunded/cancelled subscription orders must be **excluded** from the sum (and, if a paid order is later refunded, decrement `savedTotal` in the refund path — Phase 2 refund flow). Only count orders that actually shipped/were paid.

**Acceptance check:** after one renewal is paid, `/api/subscriptions` shows `savedTotal === round(lineTotal*15/85)` for that sub; after a second paid renewal it doubles; a cancelled order does not count.

### Wiring (storefront `/account`)

- `src/screens/Account.tsx` currently imports the static `subscription` from `src/data/account.ts`. Replace with a `GET /api/subscriptions` fetch (the "active subscription" card + "saved so far"). The pause/skip/change/cancel buttons (currently stubs) call the endpoints above. Keep the same visual card; only the data source changes.

---

## Epic 5.2 — Cycle tracking & predictions

**Acceptance:** *`period_log` + `symptom_log` CRUD; `CyclePredictionService.predict(userId)` computes all predictions server‑side; dashboard predictions come from the user's real logs. Encrypt cycle data at rest; strict ownership; consent flag for aggregate use; aggregates de‑identified.*

The existing static logic in `src/data/cycle.ts` (mean cycle gap, avg period, std‑dev → regularity → confidence, next start, ovulation = start−14, fertile window, PMS window, upcoming events, phase lookup) is the **exact algorithm to port** into the server service. Reuse its math verbatim.

### Task 5.2.1 — PeriodLog / SymptomLog CRUD (encrypted, owner‑only)

**Files to create:**
- `src/lib/crypto/cycle-crypto.ts` — KMS field encryption helpers.
- `src/lib/services/cycle.ts` — CRUD + prediction service (or split predictions into 5.2.2; single file is fine).
- `app/api/cycle/periods/route.ts` — `GET` (own list), `POST` (create).
- `app/api/cycle/periods/[id]/route.ts` — `PATCH`, `DELETE`.
- `app/api/cycle/symptoms/route.ts` — `GET`, `POST`.
- `app/api/cycle/symptoms/[id]/route.ts` — `PATCH`, `DELETE`.
- `app/api/cycle/consent/route.ts` — `PATCH` (set/clear `healthDataConsentAt`).

**`src/lib/crypto/cycle-crypto.ts`:** use `@aws-sdk/client-kms` (add dependency). Small payloads (<4 KB) → direct KMS `Encrypt`/`Decrypt` (no per‑row data key needed).
```ts
// encryptJson(obj): Promise<Buffer>  — KMS Encrypt(plaintext=JSON.stringify(obj), KeyId=KMS_CYCLE_KEY_ID) → CiphertextBlob
// decryptJson<T>(buf: Buffer): Promise<T> — KMS Decrypt(CiphertextBlob=buf) → JSON.parse
```
On Fargate the KMS client uses the task‑role credentials (no static keys). Cache the KMS client module‑level like `prisma`. If a decrypt ever fails (key rotation/mismatch), throw — never fall back to plaintext.

**Service functions (`src/lib/services/cycle.ts`):** all take `userId` first and scope every query by it.
- `addPeriod(userId, { startDate: ISO, lengthDays: 1..14 })` → `prisma.periodLog.create({ data: { userId, data: await encryptJson(...) } })`.
- `listPeriods(userId)` → fetch `{ id, data, createdAt }`, decrypt each → `{ id, startDate, lengthDays }`, sort by `startDate` in memory.
- `updatePeriod(userId, id, patch)` / `deletePeriod(userId, id)` — scoped by `{ id, userId }` via `updateMany`/`deleteMany`; 0 rows → 404.
- `addSymptom(userId, { date, symptom, level: 0..3 })`, `listSymptoms(userId)`, `updateSymptom`, `deleteSymptom` — same shape.
- `setConsent(userId, on: boolean)` → set `User.healthDataConsentAt = on ? new Date() : null`.

**Endpoints** (all `runtime='nodejs'`, `dynamic='force-dynamic'`, `getSessionUser()` → 401 if null):
| Method | Path | Body (Zod) |
|---|---|---|
| GET/POST | `/api/cycle/periods` | POST `{ startDate: ISO date, lengthDays: int 1..14 }` |
| PATCH/DELETE | `/api/cycle/periods/:id` | PATCH `{ startDate?, lengthDays? }` |
| GET/POST | `/api/cycle/symptoms` | POST `{ date: ISO, symptom: string(1..40), level: int 0..3 }` |
| PATCH/DELETE | `/api/cycle/symptoms/:id` | PATCH `{ date?, symptom?, level? }` |
| PATCH | `/api/cycle/consent` | `{ consent: boolean }` |

**Data touched:** `PeriodLog.data`, `SymptomLog.data`, `User.healthDataConsentAt`; KMS `Encrypt`/`Decrypt`.

**Edge cases:**
- Anonymous → 401 on every cycle route (health data is never public).
- Cross‑user access → 404 (never 403 with existence leak). This is the "strict ownership" acceptance — cover it with a test: user B cannot read/patch/delete user A's logs.
- `startDate` in the future → 400 (a period can't start in the future). `lengthDays` outside 1..14 → 400. `level` outside 0..3 → 400.
- Duplicate period for the same `startDate` → allow but the prediction service should de‑dupe/ignore overlaps (see 5.2.2 robustness).
- Admin/staff must **not** get a read path to these tables — no `/api/admin/cycle*` endpoint exists, by design. Note this explicitly in the admin scope.
- KMS unavailable → 5xx (do not silently store plaintext).

**Acceptance check:**
```bash
curl -sX POST /api/cycle/periods -d '{"startDate":"2026-06-17","lengthDays":5}'   # 201
# DB proof of encryption:
prisma: select convert_from(data,'UTF8') from "PeriodLog"   -> ciphertext bytes, NOT "2026-06-17"
# ownership:
as user B: GET /api/cycle/periods/<A's id> -> 404
```

### Task 5.2.2 — `CyclePredictionService.predict(userId)`

**File:** `src/lib/services/cycle.ts` — add `predict(userId): Promise<CyclePredictionDTO>`.

**Algorithm (port `src/data/cycle.ts` exactly):**
1. `periods = await listPeriods(userId)` sorted ascending by `startDate`. Require ≥2 to predict a cycle length; with <2, return a `{ enoughData: false }` DTO the dashboard renders as "log 2+ periods to see predictions".
2. `gaps[i] = daysBetween(periods[i].startDate, periods[i+1].startDate)`; `avgCycle = round(mean(gaps))`; `avgPeriod = round(mean(lengths))`.
3. `regularity = std(gaps)`; `confidence = round(max(0.6, 1 - regularity/8) * 100)`.
4. `lastStart = periods[last].startDate`; `nextStart = lastStart + avgCycle`; `cycleDay = daysBetween(lastStart, today)+1`; `daysUntilNext = daysBetween(today, nextStart)`.
5. Per predicted cycle: `ovulation = start - 14`, `fertileStart = ovulation - 4`, `fertileEnd = ovulation`, `pmsStart = start - 5`, `pmsEnd = start - 1`.
6. Build `upcomingEvents` (PMS window, next period, fertile window, ovulation) and a `cycleLengthTrend` (labels = last N month abbreviations, values = gaps). Build a symptom summary from decrypted `SymptomLog` rows (group by `symptom`, latest cycle intensity).
7. `today` = server `new Date()` (the static file's frozen `TODAY` was only for the mock — use real now in production; allow an injectable `now` param for tests).

**DTO** mirrors what `src/screens/UserDashboard.tsx` + `src/charts/CycleCalendar.tsx` already consume: `{ enoughData, avgCycle, avgPeriod, confidence, cycleDay, nextStart, daysUntilNext, ovulation, fertileStart, fertileEnd, pmsStart, pmsEnd, lastStart, upcomingEvents[], cycleLengthTrend, symptoms[], insights[] }`. Keep field names identical to `src/data/cycle.ts`'s `prediction` object so the UI is a drop‑in swap.

**Endpoint:** `GET /api/cycle/prediction` → `getSessionUser()` → 401 if null → `ok(await predict(user.id))`. `runtime='nodejs'`, `dynamic='force-dynamic'`.

**Edge cases:**
- <2 periods → `{ enoughData:false }` (no divide‑by‑zero on `gaps`).
- Single anomalous long gap (missed logging) → std blows up, confidence floors at 60% (the `max(0.6, …)` guard handles it). Optionally drop outlier gaps > 2× median; document if you add it.
- Overlapping/duplicate period entries → collapse entries whose `startDate` are within `avgPeriod` days before computing gaps.
- All computation is **per user** and server‑side; never trust any client‑sent prediction.

**Acceptance check:** seed the 6 periods from `src/data/cycle.ts::HISTORY` for a user, call `GET /api/cycle/prediction` → `avgCycle≈28`, `avgPeriod≈5`, `confidence≈94`, and `nextStart`/`ovulation` match the static file's computed values (with `today` injected as `2026‑07‑09`). Dashboard renders identical numbers to the current mock.

### Task 5.2.3 — Consent + de‑identified aggregate use

**Requirement:** consent flag gates aggregate use; aggregates must be de‑identified.

- The `PATCH /api/cycle/consent` endpoint (5.2.1) sets `User.healthDataConsentAt`.
- Any aggregate/analytics query over cycle data (e.g. "average cycle length across the cohort" for internal insight) **must** filter `WHERE healthDataConsentAt IS NOT NULL`, must **never** include `userId` or any identifier in the output, and must apply a minimum‑cohort‑size floor (e.g. suppress buckets with <20 users). Put such queries behind a dedicated `src/lib/services/cycle-aggregates.ts` that is the *only* code allowed to read across users, and never joins to `User` identity columns. No admin endpoint exposes per‑user cycle rows.

**Acceptance check:** an aggregate query returns only consented users' data and emits no `userId`/`email`; toggling consent off removes a user from the next aggregate run.

### Wiring (storefront `/dashboard`)

- `src/screens/UserDashboard.tsx` + `src/components/CycleTracker.tsx` import `prediction`, `upcomingEvents`, `symptomLog`, `insights`, `getPhase` from `src/data/cycle.ts`. Replace with a `GET /api/cycle/prediction` fetch; move `getPhase` logic into the DTO (precompute a phase map or expose the predicted windows so the client `CycleCalendar` can color dates). Log‑entry forms POST to the periods/symptoms endpoints.

---

## Epic 5.3 — Blog / content CMS

**Acceptance:** *Blog posts editable in admin (markdown/blocks preserving `##`/`>` conventions); draft→publish. Editable homepage sections (hero, impact stats). Marketing copy changes without a code deploy.*

`BlogPost.body` is already `String[]` where each element is a paragraph, a `## heading`, or a `> pull‑quote` — the editor must preserve exactly this array‑of‑lines convention (the public `BlogPost.tsx` renderer keys off the `## ` / `> ` prefixes). `ModerationStatus` (`pending|approved|hidden`) maps to **draft (`pending`/`hidden`) → published (`approved`)**; the public blog service already filters `status:'approved'` (`src/lib/services/blog.ts`), so drafts never leak.

### Task 5.3.1 — Blog admin CRUD + draft→publish

**Files to create:**
- `src/lib/services/blog-admin.ts` — admin‑side blog service (create/update/delete/list‑all/publish).
- `app/api/admin/blog/route.ts` — `GET` (list all incl. drafts), `POST` (create).
- `app/api/admin/blog/[id]/route.ts` — `GET`, `PATCH`, `DELETE`.
- `app/api/admin/blog/[id]/publish/route.ts` — `POST` (`{ publish: boolean }` → status `approved`/`pending`).

Keep the **public** read path (`src/lib/services/blog.ts`) unchanged — admin writes, public reads.

**Service functions:**
- `listAllPosts()` — includes drafts; ordered `updatedAt desc`; include category.
- `createPost({ slug, title, categoryId, excerpt, author, readTime, tone, image?, featured?, body: string[] })` — default `status:'pending'` (draft). Validate `slug` unique (catch Prisma P2002 → 409), `categoryId` exists, `body` is `string[]`.
- `updatePost(id, patch)` — partial; if `slug` changes, re‑check uniqueness.
- `deletePost(id)` — hard delete (or set `status:'hidden'` — prefer soft `hidden` to preserve inbound links; expose both, default hard delete only from a confirm action).
- `setPublish(id, publish)` — `status = publish ? 'approved' : 'pending'`; on publish, if `publishedAt` is in the future or unset‑meaningful, set `publishedAt = now()` (first publish).

**Endpoints** — all guarded by `requireStaff()` (→ 403 for non‑staff), `runtime='nodejs'`, `dynamic='force-dynamic'`.
| Method | Path | Body |
|---|---|---|
| GET/POST | `/api/admin/blog` | POST = full post payload |
| GET/PATCH/DELETE | `/api/admin/blog/:id` | PATCH = partial |
| POST | `/api/admin/blog/:id/publish` | `{ publish: boolean }` |

**Data touched:** `BlogPost` (all fields), reads `BlogCategory`.

**Edge cases:**
- Non‑staff → 403 on every admin route (assert with a test).
- Duplicate slug → 409 with a clear message.
- Body elements that aren't strings → 400 (Zod `z.array(z.string())`).
- Publishing a post whose category was deleted → 400 (FK). Deleting a category that still has posts → block (see 5.3.2).
- `readTime` default 4; `featured` toggling — only one featured "hero" is expected by the grid but schema allows many; the UI shows featured first, so multiple featured is tolerable — don't enforce singleton unless product asks.
- Editing must not change `publishedAt` on every save (only `updatedAt` auto‑updates); set `publishedAt` only on first publish.

**Acceptance check:**
```bash
# as staff:
curl -sX POST /api/admin/blog -d '{"slug":"test","title":"T","categoryId":"<c>","excerpt":"e","author":"a","tone":"calm","body":["Intro para","## A heading","> A pull quote"]}'
# public GET /api/blog does NOT include "test" (status pending)
curl -sX POST /api/admin/blog/<id>/publish -d '{"publish":true}'
# public GET /api/blog now includes it; GET /api/blog/test returns body array with '##'/'>' preserved
# as a customer: POST /api/admin/blog -> 403
```

### Task 5.3.2 — Blog categories CRUD

**Files:** `app/api/admin/blog/categories/route.ts` (`GET` list, `POST` create), `app/api/admin/blog/categories/[id]/route.ts` (`PATCH`, `DELETE`). Add functions to `blog-admin.ts`.

- `BlogCategory`: `name` (unique), `color`, `tint`. Create validates unique name (409 on P2002). Delete must be blocked if any `BlogPost` references it (count first → 400 "category in use"), because `BlogPost.categoryId` is required (no `onDelete` cascade on that relation).

**Acceptance check:** create category → appears in `/api/blog` category chips; deleting a category with posts → 400.

### Task 5.3.3 — Editable homepage sections (Setting‑backed)

**Files:**
- `src/lib/services/content.ts` — typed getters/setters over `Setting` rows for homepage content.
- `app/api/admin/content/route.ts` — `GET` (current content) + `PUT` (upsert sections). `requireStaff()`.
- `app/api/content/home/route.ts` — public `GET` for the storefront (or fold into the existing `/api/settings`).

**Content shape (stored as `Setting` rows, `value: Json`):**
- Key `home.hero` → `{ eyebrow, title, subtitle, ctaLabel, ctaHref }`.
- Key `home.impactStats` → `[{ value, label }, …]` (the impact numbers on `src/components/Impact.tsx`).

`content.ts` mirrors `settings.ts`: typed defaults that reproduce the current hardcoded copy, `coerce`‑style tolerance for missing/malformed rows so the homepage can never break on a bad edit. `PUT /api/admin/content` validates the payload with Zod, then `prisma.setting.upsert` per key.

**Data touched:** `Setting` (keys `home.hero`, `home.impactStats`).

**Edge cases:** malformed stored JSON → fall back to defaults (never throw to the storefront). Non‑staff PUT → 403. Empty/partial payload → merge with existing, don't wipe unspecified sections.

**Acceptance check:** `PUT /api/admin/content` changing the hero title → `GET /api/content/home` (and the rendered homepage) reflect it with no deploy; a deliberately corrupted `home.hero` row → homepage still renders defaults.

### Wiring (storefront)

- `src/components/Hero.tsx` / `HeroBanner.tsx` and `src/components/Impact.tsx` read their copy from `GET /api/content/home` (server component fetch) instead of inline constants. `src/screens/Blog.tsx` / `BlogPost.tsx` already read from `/api/blog` (Phase 0) — no change; they simply see admin‑published content.
- Admin UI: add editor screens under the `/admin` shell (`src/screens/admin/*` or `app/admin/...` pages), calling the `/api/admin/blog*` and `/api/admin/content` endpoints. Backend is the deliverable here; the admin UI is thin forms over these endpoints (block editor = a textarea per `body[]` line, plus reorder).

---

## Epic 5.4 — Notification service

**Acceptance:** *Notification service + templates (email/SMS/WhatsApp) for the triggers in PRD §20. Order confirmation, OTP, shipping, coupon emails/SMS send reliably.*

### Task 5.4.1 — Provider adapters

**Files to create:**
- `src/lib/notifications/ses.ts` — `sendEmail({ to, subject, html, text }): Promise<{ providerId }>` via `@aws-sdk/client-ses` (`SendEmailCommand`), `Source = SES_FROM_EMAIL`, optional `ConfigurationSetName`.
- `src/lib/notifications/sms.ts` — `sendSms({ to, body, templateId? }): Promise<{ providerId }>`. Branch on `SMS_PROVIDER`: `sns` → `@aws-sdk/client-sns` `PublishCommand` (with `SenderID` attribute); `msg91` → `fetch` MSG91 flow/OTP API with `MSG91_AUTH_KEY` + DLT `templateId`.
- `src/lib/notifications/whatsapp.ts` — `sendWhatsApp({ to, template, variables }): Promise<{ providerId }>`. Branch on `WHATSAPP_PROVIDER`: `meta` → POST Meta Cloud API `/{PHONE_NUMBER_ID}/messages` with a `template` message; `msg91` → provider passthrough.

Each adapter: construct its AWS SDK client at module scope (task‑role creds on Fargate); throw on API error (the service layer records the failure). No secrets in logs.

**Add dependencies:** `@aws-sdk/client-ses`, `@aws-sdk/client-sns`, `@aws-sdk/client-kms` (5.2 shares KMS). MSG91/WhatsApp use `fetch` (no SDK).

### Task 5.4.2 — Notification service + templates + idempotency

**Files to create:**
- `src/lib/notifications/templates.ts` — a registry mapping `template` name → `{ channels, render(vars) }`. `render` returns per‑channel content (email `subject/html/text`; sms `body` + `templateId`; whatsapp `template name + variables`). Keep bodies short and DLT‑friendly for SMS.
- `src/lib/notifications/index.ts` (or `src/lib/services/notifications.ts`) — the **service**:
  ```ts
  // notify(input: { template: string; to: { userId?; email?; phone? }; vars: Record<string,unknown>;
  //                channel?: NotificationChannel; dedupeKey?: string }): Promise<void>
  ```
  Behavior:
  1. Resolve recipient (from `to` or look up `User` by `userId` for email/phone).
  2. Pick channel(s): explicit `channel`, else the template's default channel order (e.g. email primary, SMS fallback), respecting available contact info.
  3. **Idempotency:** if `dedupeKey` set, `prisma.notificationLog.create` inside a `try` — a unique‑constraint violation (P2002) means already sent → **return silently** (no duplicate send).
  4. Create `NotificationLog(status:'queued')`, call the adapter, on success update `status:'sent', providerId, sentAt`; on failure `status:'failed', error`. **Never throw into the caller** for non‑critical triggers (mirror the fire‑and‑forget stance of `src/lib/services/events.ts`) — except OTP, where the auth flow needs the failure surfaced.
  5. Retry policy: rely on the daily "failed notifications" sweep (optional cron `app/api/cron/notifications/retry/route.ts`) rather than in‑request retries.

**Data touched:** `NotificationLog` (write), reads `User` for contact info.

**Edge cases:**
- Missing contact channel (no email / no phone) → record `failed` with reason, don't crash the originating request.
- Duplicate trigger (e.g. webhook fires twice → two `order_confirmation`) → `dedupeKey = "order_confirmation:<orderId>"` collapses to one send.
- SES sandbox / unverified recipient → adapter error captured as `failed`.
- SMS to a non‑Indian / malformed number → validate E.164 before send → `failed` with reason.
- WhatsApp template not approved / 24h‑window rules → adapter error captured; fall back to SMS if the template registry marks a fallback.
- OTP is time‑sensitive → OTP send must be synchronous and surface failure to the auth route (this trigger is owned by Phase 1; 5.4 provides the `sms.ts`/`ses.ts` adapters it calls).

### Task 5.4.3 — Trigger wiring (PRD §20)

Wire `notify(...)` at these points. Several hooks live in earlier‑phase code paths; Phase 5 centralizes the send mechanism and adds the missing ones.

| Trigger (template) | Fires from | Channel(s) | dedupeKey | Owner phase |
|---|---|---|---|---|
| `otp` | Auth OTP request route | SMS (email for magic‑link) | n/a (short‑lived) | P1 (adapter here) |
| `welcome` | On first successful signup | email | `welcome:<userId>` | P1/P5 |
| `order_confirmation` | Post‑payment capture txn (webhook) | email + SMS | `order_confirmation:<orderId>` | P2 |
| `order_shipped` / `order_delivered` | Admin order‑status change (Orders console) | email + SMS | `order_shipped:<orderId>` | P3 |
| `refund_processed` | Refund flow | email | `refund:<orderId>` | P2/P3 |
| `coupon_awarded` / `points_redeemed` | Rewards redemption → coupon issue | email | `redeem:<ledgerId>` | P4 |
| `subscription_renewal` (pay‑link) | `runRenewals` (Task 5.1.2) | email + SMS/WhatsApp | `subscription_renewal:<orderId>` | **P5** |
| `subscription_payment_failed` / reminder | pay‑link expiry sweep (optional cron) | SMS/WhatsApp | `subrenewal_remind:<orderId>:<n>` | **P5** |
| `partner_application_received` | Partner application submit | email to ops + applicant | `partner_app:<applicationId>` | P4 |
| `affiliate_approved` | Admin approves affiliate | email | `affiliate_approved:<affiliateId>` | P4 |

**Acceptance check:**
```bash
# order confirmation is idempotent and logged
trigger a paid order (or replay the razorpay webhook twice)
-> exactly ONE NotificationLog(template='order_confirmation', status='sent') for that orderId
# a test send exercises every channel:
POST /api/admin/notifications/test {template:'order_confirmation', to:{email,phone}, vars:{...}}  (staff-only, optional)
-> SES + SMS providers return message ids; NotificationLog rows show status='sent' with providerId.
```
Optional staff‑only test endpoint: `app/api/admin/notifications/test/route.ts` (`requireStaff()`), useful for verifying provider credentials without triggering real events.

---

## 4. Phase‑5 "done" checklist (maps to the tasks doc)

- [ ] Subscriptions: create/list/change/pause/skip/cancel from `/account`, all owner‑scoped (5.1.1).
- [ ] EventBridge Scheduler hits `/api/cron/subscriptions/renew`; due subs generate `pending` orders + Razorpay pay‑link; run is idempotent (5.1.2).
- [ ] "Saved so far" derives from real paid subscription orders (5.1.3).
- [ ] Period/symptom CRUD works, is owner‑only (cross‑user → 404), and rows are **ciphertext** in the DB (5.2.1).
- [ ] `GET /api/cycle/prediction` reproduces the dashboard predictions from the user's real logs (5.2.2).
- [ ] Consent flag gates de‑identified aggregates; no admin path reads per‑user cycle data (5.2.3).
- [ ] Blog posts + categories editable in `/admin`, draft→publish, `##`/`>` body convention preserved; drafts never public (5.3.1–5.3.2).
- [ ] Homepage hero + impact stats editable via `Setting` rows with no deploy (5.3.3).
- [ ] Notification service sends email/SMS/WhatsApp for the §20 triggers, logs every send, and is idempotent per `dedupeKey` (5.4).
- [ ] `schema.prisma` migrated with the §3 additions; `.env.example` updated for AWS/cron/providers.

## 5. Cross‑cutting security & test notes (feed into Launch hardening)

- **Authz on every mutation:** subscriptions & cycle routes require login + ownership; all `/api/admin/*` require `requireStaff()`. Add integration tests: anon→401, wrong‑owner→404, non‑staff→403.
- **Cron endpoints fail closed** on a missing/incorrect `x-cron-secret`.
- **No plaintext health data** leaves the DB or appears in logs/Sentry (scrub `PeriodLog`/`SymptomLog` payloads from error capture).
- **Idempotency** is enforced structurally: renewal via the `updateMany` guard on `nextDeliveryAt`; notifications via `NotificationLog.dedupeKey @unique`; payment via `Payment.razorpayPaymentId @unique` (Phase 2).
- **Server is source of truth on price** at renewal (recompute from `variant.price` + `subscribeSavePct`), matching the Phase‑2 checkout invariant.
