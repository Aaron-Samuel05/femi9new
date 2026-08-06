# Phase 4 — Growth Programs — Implementation Spec

> Executable spec for **Phase 4 ↩3** of the Femi9 backend build (`Femi9-Backend-Tasks.md`).
> Goal: rewards, affiliate, partner, and community become real, server-side, and moderated — off `localStorage`.
> Every model/field referenced below exists in `prisma/schema.prisma` unless flagged **[SCHEMA ADD]**.

---

## 0. What is already in place (Phase 0) and what this phase assumes

**Done (Phase 0 — verified in repo):**
- Prisma client singleton: `src/lib/db.ts` → `import { prisma } from '@/lib/db'`.
- Service-layer pattern: `src/lib/services/*.ts`, each starts with `import 'server-only'`, wraps `prisma`, returns UI-shaped DTOs. Route handlers must be thin wrappers over services.
- JSON response helpers: `src/lib/api.ts` → `ok`, `created`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `serverError`, `handle`.
- Settings seam: `src/lib/services/settings.ts` (`getSettings`, `getSetting<T>`), seeded by `prisma/seed.ts` → `seedSettings()`.
- Event log write path: `src/lib/services/events.ts` → `logEvent({ type, userId, meta })` (fire-and-forget).
- `RewardOption` rows already seeded by `seedRewardOptions()`; a demo opening-balance `PointsLedger` row is seeded in `seedDemoUsers()`.
- Router shim: `src/lib/router-compat.tsx` (`Link`, `useLocation`, `useParams`).
- **No `route.ts` handlers exist yet** — Phase 0 reads are server components calling services. Phase 4 introduces the project's first `/api` write endpoints; follow the `api.ts` envelope + service pattern for all of them.

**Screens Phase 4 must convert off `localStorage`** (current client-only demos):
- `src/screens/PeriodsWall.tsx` — key `femi9:wall:posts` (seed array `SEED`, likes are session-only).
- `src/screens/Affiliate.tsx` — key `femi9:affiliate:account`, **client-side `generateCode()` hash** (must be removed).
- `src/screens/Partner.tsx` — key `femi9:partner:application`.
- `src/components/Rewards.tsx` — key `femi9:rewards`, hardcoded `EARN` / `REDEEMABLES`, imports `user`/`orders` from `src/data/account.ts`.

### 0.1 Cross-phase dependencies (must exist before / alongside Phase 4)

| Needs | From | How Phase 4 consumes it | If missing |
|---|---|---|---|
| Session + role | Phase 1 (Auth.js v5) | `import { auth } from '@/lib/auth'`; `const session = await auth()`. Role guard helper `requireStaff()` / `requireUser()` (create `src/lib/guards.ts` if Phase 1/3 didn't). | Affiliate apply, likes, replies, points redeem, all `/api/admin/*` are **blocked** — build endpoints but gate behind the guard so they 401/403 until auth lands. |
| Rate limiting | Phase 1 (Upstash) 🔒 #6 | `import { ratelimit } from '@/lib/ratelimit'` on public POSTs (wall post, partner apply, `/r/:code`, redeem). | Ship a pass-through `ratelimit` stub that always allows, log a TODO; go-live gated on Redis. |
| Checkout / order creation | Phase 2 (`src/lib/services/checkout.ts`) | Phase 4 adds `resolveAffiliate()` + follower-discount into the total computation, and sets `Order.affiliateId`. | Attribution can't be end-to-end tested; land the resolver function + unit-test it in isolation. |
| Payment capture tx | Phase 2 (`src/lib/services/payments.ts` webhook) | Phase 4's `awardPoints()` and `accrueCommission()` are **called inside** the existing post-capture transaction. | Wire the calls behind a feature check; unit-test the service functions directly. |
| Refund flow | Phase 2/3 | Phase 4 adds `reverseCommission()` + points reversal. | Same as above. |
| Coupon create | Phase 2/3 (`src/lib/services/coupons.ts`) | Redeem endpoint creates a `Coupon`. Reuse the Phase 3 `createCoupon()` if present; otherwise Phase 4 owns it (spec'd in 4.1.4). | Own it here. |
| Admin shell + nav | Phase 3 (`src/app/(admin)/admin/**`, `src/screens/AdminDashboard.tsx`) | Phase 4 adds admin sub-pages/tabs (affiliate approvals, payouts, partner board, wall moderation). | Land the `/api/admin/*` endpoints regardless; add pages when the shell exists. |
| Notifications | Phase 5 (email/SMS/WhatsApp) 🔒 #3 #4 | Thin `src/lib/services/notify.ts` wrapper (see 0.3). | No-op/log wrapper — never block a mutation on a send. |

### 0.2 Founder-action blockers (🔒) that gate Phase 4 go-live (not the build)

| # | Item | Blocks in Phase 4 | Build proceeds by |
|---|---|---|---|
| 4 | Transactional email (Resend) | Redeem → coupon **email**; partner ops/applicant email | `notify` logs the payload; coupon still created + returned in API response |
| 3 | SMS/OTP (MSG91) | Partner applicant SMS / affiliate approval SMS | `notify` logs; DB record is source of truth |
| 6 | Redis (Upstash) | Rate-limiting on public POSTs | pass-through stub |
| — | WhatsApp Business | Partner "we'll reach out on WhatsApp" confirmation | copy stays, send is stubbed |

### 0.3 New shared helper — `src/lib/services/notify.ts` (create)

Thin, provider-agnostic, **never throws to the caller** (mirrors `events.ts`).

```ts
// src/lib/services/notify.ts
import 'server-only'
export type NotifyChannel = 'email' | 'sms' | 'whatsapp'
export interface NotifyInput { channel: NotifyChannel; to: string; template: string; data: Record<string, unknown> }
export async function notify(input: NotifyInput): Promise<void> {
  try {
    // Phase 5 wires real providers here. Until then: structured log so nothing blocks.
    if (!process.env[`NOTIFY_${input.channel.toUpperCase()}_ENABLED`]) {
      console.info('[notify:stub]', input.channel, input.template, input.to)
      return
    }
    // provider call…
  } catch (err) { console.error('[notify] send failed', err) }
}
```

---

## 1. Schema additions & gaps — **do these first** (one migration)

The existing schema covers ~90% of Phase 4. The following are genuine gaps. Add them in a single migration `prisma/migrations/*_phase4_programs`. Each is marked **required** (Phase 4 cannot be correct without it) or **recommended** (cleaner; a documented workaround exists).

| # | Change | Model | Why | Priority |
|---|---|---|---|---|
| S1 | `payoutId String?` + `payout AffiliatePayout? @relation(...)` on `AffiliateEvent`; `events AffiliateEvent[]` on `AffiliatePayout` | `AffiliateEvent` / `AffiliatePayout` | Mark which commission events a payout settled → exact unpaid-balance math, no period double-pay. Workaround: aggregate `sum(commission) − sum(paid payout.amount)`. | recommended |
| S2 | `userId String?` + `user User? @relation(...)` + `@@index([userId])` on `Coupon` | `Coupon` | Bind a redemption coupon to the redeemer so it can't be shared. Workaround: `maxUses = 1` + unguessable code emailed privately. | recommended |
| S3 | `couponId String?` + relation on `PointsLedger` | `PointsLedger` | Link a `-redeem` row to the coupon it generated (audit / support). Workaround: embed code in `reason`. | recommended |
| S4 | `replyCount Int @default(0)` on `WallPost` | `WallPost` | Denormalized reply count for the feed (mirrors existing `likeCount`). Workaround: Prisma `_count`. | recommended |
| S5 | `visitorToken String?` + `ip String?` on `AffiliateEvent`; `@@index([affiliateId, type, createdAt])` | `AffiliateEvent` | Dedup click spam from `/r/:code`. Workaround: cookie-based dedup only. | recommended |
| S6 | `platforms String[] @default([])` on `Affiliate` | `Affiliate` | UI collects multiple platforms; current `platform String?` holds one. Workaround: join to CSV in `platform`. | recommended |
| S7 | New `Setting` keys (data, not schema): `affiliateCommissionPct=15`, `affiliateFollowerDiscountPct=10`, `redeemCouponExpiryDays=90`, `wallAutoApprove=false`, `wallBannedKeywords=[]` | `Setting` | Config for this phase. Extend `Settings` interface + `getSettings()` + `seedSettings()`. | **required** |

> **Note on `Affiliate.promoCode`**: it is `@unique` **and non-nullable**, so the code is allocated **at application time** (status `pending`) and simply *activated* on approval — this already satisfies "server-allocated unique code, no client hash". No schema change needed for that.

> **Note on the two meanings of an affiliate code**: the same string is both an *attribution* code (cookie / typed) and a *discount* for followers. We do **not** duplicate it as a `Coupon` row. Checkout resolves a typed code against `Coupon` first, then `Affiliate.promoCode`; the follower discount is computed from `affiliateFollowerDiscountPct` (S7). See 4.2.4.

**S7 edits (required, do now):**
- `src/lib/services/settings.ts` — add the five keys to `interface Settings`, `DEFAULTS`, and the `getSettings()` mapping (`affiliateFollowerDiscountPct` etc. via `coerce`; `wallBannedKeywords` is `string[]`, `wallAutoApprove` is boolean — extend `coerce` to handle boolean/array or read those two with `getSetting<T>`).
- `prisma/seed.ts` — add the keys to the `settings` object in `seedSettings()`.
- **Acceptance:** `getSettings()` returns all five with defaults on a fresh DB; overriding `wallAutoApprove` in `Setting` flips new-post default status (tested in 4.4.2).

---

# Epic 4.1 — Rewards ledger

**Balance rule:** balance is the **sum of `PointsLedger.delta`** for a user (source of truth). `balanceAfter` is a denormalized audit value written inside each insert. Never trust a single `balanceAfter` read for spend decisions — always re-sum inside the spend transaction.

### Task 4.1.1 — Points service (`src/lib/services/points.ts`)

**Create** `src/lib/services/points.ts`. Pure business layer; no HTTP.

Functions:
- `getBalance(userId: string): Promise<number>` → `prisma.pointsLedger.aggregate({ _sum: { delta }, where: { userId } })` → `_sum.delta ?? 0`.
- `getLedger(userId, { take = 20, cursor? })` → recent rows, `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`.
- `awardPoints({ userId, delta, reason, orderId?, tx? }): Promise<PointsLedger>` — **delta must be > 0**; runs inside a caller-provided `tx` (Prisma transaction client) or its own; computes `balanceAfter = currentSum + delta`; inserts one row.
- `redeem({ userId, rewardOptionId }): Promise<{ coupon: Coupon; balanceAfter: number }>` — see 4.1.4 (lives here, called by the route).

**Concurrency (the hard part):** `redeem` (and any negative-delta write) must not double-spend under concurrent requests. Use a **Postgres transaction-scoped advisory lock keyed on the user**, inside `prisma.$transaction`:

```ts
await prisma.$transaction(async (tx) => {
  // serialize all balance-changing writes for this user
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`
  const { _sum } = await tx.pointsLedger.aggregate({ _sum: { delta: true }, where: { userId } })
  const balance = _sum.delta ?? 0
  if (balance < costPoints) throw new InsufficientPointsError(balance, costPoints)
  // …create coupon + insert -delta row with balanceAfter = balance - costPoints
})
```

**Data touched:** `PointsLedger` (insert), `Coupon` (insert, in redeem). Reads `RewardOption`.
**Edge cases:** delta 0 or negative on `awardPoints` → throw; `redeem` with insufficient balance → typed `InsufficientPointsError`; concurrent redeems of the same reward → advisory lock serializes, second sees reduced balance; user with no ledger rows → balance 0.
**Acceptance:** unit test — seed a user with `+1000`, fire 5 concurrent `redeem` of a 900-cost option; **exactly one** succeeds, final balance `100`, exactly one `-900` row and one coupon exist.

### Task 4.1.2 — Earn on paid order (hook into Phase 2 capture)

**Edit** `src/lib/services/payments.ts` (Phase 2 webhook/capture handler) — inside the existing "post-payment, one transaction" block (`Femi9-Backend-Tasks.md` Epic 2.3), call:

```ts
const { pointsPerRupee, firstOrderBonusPoints } = await getSettings()
const base = Math.floor((order.subtotal - order.discount) * pointsPerRupee / 10) // "+1 per Rs.10" (matches Rewards.tsx copy)
await awardPoints({ userId: order.userId!, delta: base, reason: `Order ${order.orderNo}`, orderId: order.id, tx })
const isFirstPaid = (await tx.order.count({ where: { userId: order.userId!, status: { in: ['paid','processing','shipped','delivered'] }, id: { not: order.id } } })) === 0
if (isFirstPaid) await awardPoints({ userId: order.userId!, delta: firstOrderBonusPoints, reason: 'First-order bonus', orderId: order.id, tx })
```

> Confirm the "per Rs.10" divisor with the founder — `Rewards.tsx` shows `+1 per Rs.10` while `settings.pointsPerRupee` is literally per-rupee. Reconcile: either divide by 10 here (as above) or rename the setting. **Pick one and document in the settings label.**

**Data touched:** `PointsLedger` (insert ×1–2), reads `Order`, `Setting`.
**Edge cases:** guest order (`userId` null) → **skip** earning; idempotency — this runs inside the payment tx which Phase 2 already makes idempotent on `razorpayPaymentId`, so points award exactly once (guard: don't award if a ledger row with this `orderId` + positive delta already exists); order with only discount/free items → `base` may be 0, skip insert.
**Acceptance:** paying a Rs.999 order credits the ledger once; replaying the webhook does not double-credit; a second paid order does not re-grant the first-order bonus.

### Task 4.1.3 — Earn on review

**Edit** the review-create path (`src/lib/services/reviews.ts` if it exists; else the review POST handler). When a `Review` is created by a logged-in user for a product they purchased, `awardPoints({ userId, delta: reviewPoints, reason: 'Product review' })`. Add `reviewPoints` to Settings (default 50, matches `Rewards.tsx` "+50").
**Edge cases:** award **once per (userId, productId)** — check existing ledger reason or existing prior review; anonymous review (`Review.userId` null) → no points; review later hidden by moderation → optionally reverse (out of MVP scope, note it).
**Acceptance:** first review by a customer credits +50; a second review of the same product credits nothing.

> **Referral earn ("+250" in `Rewards.tsx`)** has **no mechanism in the schema** (no customer-referral link; `Affiliate` is the creator program, distinct). **Call-out / decision needed:** either (a) drop the referral earn rule for Phase 4, or (b) add `referredById String?` to `User` **[SCHEMA ADD]** + a referral code on signup. Recommend deferring to a later phase; keep the earn engine generic so it plugs in later.

### Task 4.1.4 — Redeem → real coupon + email

**Create** `src/app/api/rewards/redeem/route.ts` (POST).
**Create** `src/lib/services/coupons.ts` **only if Phase 3 didn't** — export `createCoupon(input, tx?)` and `generateCouponCode()` (e.g. `F9-` + 8 crypto-random base32 chars, retry on `code` unique collision).

Flow (all inside the 4.1.1 advisory-locked transaction):
1. `requireUser()` → `userId`. Body Zod: `{ rewardOptionId: string }`.
2. Load `RewardOption` by id; must be `active`. 404/400 otherwise.
3. Re-sum balance; if `< costPoints` → `badRequest('Not enough points')`.
4. `createCoupon({ code, type: option.couponType, value: option.couponValue, minOrder: 0, maxUses: 1, expiresAt: now + redeemCouponExpiryDays, active: true, userId /* if S2 */ }, tx)`.
5. `awardPoints`-style insert of a **negative** row: `delta: -option.costPoints, reason: 'Redeemed: <title> → <code>', balanceAfter`, and `couponId` if S3.
6. After commit: `notify({ channel: 'email', to: userEmail, template: 'reward-coupon', data: { code, value } })` (best-effort).
7. Return `{ code, value, type, expiresAt, balanceAfter }`.

**Data touched:** `Coupon` (insert), `PointsLedger` (insert -delta), reads `RewardOption`, `User.email`.
**Edge cases:** double-submit / double-click → advisory lock serializes; the second sees reduced balance and 400s (no duplicate coupon). User has no email (phone-only account) → skip email, still return code in response. `RewardOption` deactivated between page load and submit → 400. `redeemCouponExpiryDays` misconfigured → fall back to default 90.
**Acceptance:** redeeming a 500-pt reward on a 1000-pt balance returns a working coupon code, drops balance to 500, and creates a `Coupon(maxUses:1)`; applying that coupon at checkout discounts correctly and cannot be used twice; a concurrent second redeem attempt with only 500 pts left is rejected.

### Task 4.1.5 — Rewards read API + wire `Rewards.tsx` off `localStorage`

**Create** `src/app/api/rewards/route.ts` (GET) → `requireUser()`, returns:
```jsonc
{ "balance": 1240,
  "options": [ { "id","title","costPoints","couponType","couponValue","affordable": true } ],
  "activity": [ { "reason","delta","createdAt" } ] }
```
`options` from `RewardOption` where `active` ordered by `position`; `activity` = last ~8 ledger rows.

**Edit** `src/components/Rewards.tsx`:
- Delete `STORE_KEY`, `loadBalance`, `saveBalance`, the hardcoded `REDEEMABLES`, and the `import { user, orders } from '../data/account'`.
- Convert to a client component that fetches `GET /api/rewards` (balance + options + activity); render `EARN` as static display copy (fine to keep hardcoded) but drive redeem tiles from `options`.
- `redeem` button → `POST /api/rewards/redeem`; on success show the returned code in the flash + refetch balance. On 400 show the error.

**Data touched:** reads `PointsLedger`, `RewardOption`. **Depends on:** Phase 1 session (replaces `user.points`).
**Edge cases:** unauthenticated → API 401 → component shows "sign in to see rewards"; empty ledger → balance 0, no activity rows; optimistic UI must reconcile to server balance after redeem.
**Acceptance:** the Rewards panel shows the **DB** balance (not `localStorage`); redeeming decrements it server-side and it survives a hard refresh and a different browser.

### Task 4.1.6 — Admin: adjust points (ties Phase 3 customers)

**Create** `src/app/api/admin/customers/[id]/points/route.ts` (POST) → `requireStaff()`. Body `{ delta: number, reason: string }`. Calls `awardPoints` for positive delta or a guarded negative insert (advisory lock, block below-zero) for deductions. Surface on the Phase 3 customer detail page.
**Edge cases:** deduction below zero → reject; `reason` required for audit; large delta → optional confirmation on the UI.
**Acceptance:** an admin grant of +100 appears in the customer's ledger and their balance; a deduction that would go negative is rejected.

---

# Epic 4.2 — Affiliate program

### Task 4.2.1 — Affiliate application (auth) + server-allocated unique code

**Create** `src/lib/services/affiliate.ts` and `src/app/api/affiliate/apply/route.ts` (POST).

`applyAffiliate({ userId, handle, platforms, followerBand }): Promise<Affiliate>`:
1. `requireUser()`. If the user already has an `Affiliate` (userId `@unique`) → return it (idempotent; 200 with existing status).
2. Zod: `handle` (required, strip leading `@`), `platforms: string[]` (default `['Instagram']`), `followerBand` (one of the UI bands).
3. `promoCode = await allocatePromoCode(handle, user.name)` — **server-side**, unique-checked:
   - base = longest alnum token of handle/name, uppercased, ≤8 chars, min 3 (fallback `FEMI9`).
   - append 2–4 random digits; `SELECT` check against `Affiliate.promoCode`; retry up to ~10× on collision; final fallback = base + 6 crypto-random chars.
4. Create `Affiliate { userId, handle, platform: platforms.join(', ') /* + platforms[] if S6 */, followerBand, promoCode, status: 'pending' }`.
5. `notify` ops (email) that a new affiliate applied. Best-effort.

**Removes:** the client `generateCode()` hash in `src/screens/Affiliate.tsx` (Epic 4.2 ✓ "no client-side hash codes").
**Data touched:** `Affiliate` (insert). Reads `User`.
**Edge cases:** not logged in → 401 (the current form is anonymous — **this is a behavior change**: applicant must authenticate first; wire the Affiliate page to prompt sign-in, or auto-create a user via Phase 1 magic-link then continue). Re-apply → returns existing, never a second code. Handle with only symbols → fallback base. Two different users, similar handles → unique suffix guarantees distinct codes.
**Acceptance:** two applications from two users produce two **distinct, server-generated** `promoCode`s; re-applying returns the same code; a code is never generated client-side.

### Task 4.2.2 — Admin approval / suspend

**Create** `src/app/api/admin/affiliates/route.ts` (GET list, filter `?status=`) and `src/app/api/admin/affiliates/[id]/route.ts` (PATCH `{ status }`). `requireStaff()`.
On `approved`: set `Affiliate.status='approved'` and, if the user's role is `customer`, promote `User.role='affiliate'` (transaction). On `suspended`: status only; the code stops attributing/discounting (checkout + `/r/:code` check `status === 'approved'`).
**Data touched:** `Affiliate` (update), `User.role` (update).
**Edge cases:** approving an already-approved affiliate → no-op; suspending mid-program keeps historical `AffiliateEvent`s intact (earnings preserved) but new clicks/orders are ignored; role downgrade on suspend is **not** automatic (keep `affiliate` role) — document.
**Acceptance:** an approved affiliate's `/r/:code` starts logging clicks and their code applies the follower discount; a suspended one's code does neither.

### Task 4.2.3 — `/r/:code` click logging + attribution cookie

**Create** `src/app/r/[code]/route.ts` — a **GET Route Handler** (not a page) that logs, sets a cookie, and redirects.

```ts
export async function GET(req: Request, { params }: { params: { code: string } }) {
  const aff = await prisma.affiliate.findUnique({ where: { promoCode: params.code } })
  const res = NextResponse.redirect(new URL('/', req.url))
  if (aff && aff.status === 'approved') {
    // dedup: skip if this visitor already counted in last 24h (cookie femi9_rv or S5 visitorToken)
    await prisma.affiliateEvent.create({ data: { affiliateId: aff.id, type: 'click' } })
    res.cookies.set('femi9_ref', aff.promoCode, {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30, secure: process.env.NODE_ENV === 'production',
    })
  }
  return res
}
```

**Data touched:** `AffiliateEvent` (insert, `type=click`, `amount=0`, `commission=0`). Sets cookie `femi9_ref` (30-day, httpOnly — server-only trust so it can't be tampered client-side).
**Edge cases:** unknown/suspended code → redirect home, **no cookie, no event** (silent). Bot prefetch / repeated hits → dedup via a short-lived `femi9_rv` marker cookie or S5 `visitorToken`+24h window so clicks aren't inflated. Rate-limit per IP. Last-touch wins: a later `/r/:otherCode` overwrites `femi9_ref`.
**Acceptance:** hitting `/r/<approvedCode>` creates exactly one `click` event (deduped within 24h), sets `femi9_ref`, and lands on the storefront; hitting `/r/<badCode>` redirects with no event and no cookie.

### Task 4.2.4 — Checkout attribution + follower discount (Phase 2 hook)

**Edit** `src/lib/services/checkout.ts` (Phase 2). Add to the server-side total computation:

`resolveAffiliate({ typedCode?, cookieCode?, userId? }): Promise<Affiliate | null>`
- Precedence: **typed code > cookie code** (explicit intent wins), both resolved to an `approved` affiliate.
- The coupon box resolver order: try `Coupon` by code first; if none, try `Affiliate.promoCode`. A string that is neither → invalid.

At order creation:
- Set `Order.affiliateId = affiliate.id` when resolved.
- **Follower discount:** if an affiliate is resolved **and** this is the buyer's first paid order, add a discount of `round(subtotal * affiliateFollowerDiscountPct / 100)` into `Order.discount`. (Server-computed; never trust client.)
- Read `femi9_ref` from cookies in the route handler and pass `cookieCode` into checkout.

**Data touched:** `Order.affiliateId`, `Order.discount`, `Order.couponId` (if a real coupon was used instead). Reads `Affiliate`, `Setting`, prior `Order`s.
**Edge cases:** self-purchase (buyer is the affiliate's user) → **allow** the follower discount (per program FAQ) but flag it so commission is skipped later (4.2.5). Both a coupon **and** an affiliate cookie present → apply the coupon's discount, still set `affiliateId` from cookie for attribution (discount doesn't stack unless the founder allows; default: coupon replaces follower discount, attribution preserved). Not-first-order → attribution set, no follower discount. Suspended affiliate code typed → treated as invalid code.
**Acceptance:** an order placed after visiting `/r/:code` (no code typed) is attributed via cookie; a first-time buyer using an approved code gets exactly `affiliateFollowerDiscountPct`% off, recomputed server-side; a returning buyer gets attribution but no discount.

### Task 4.2.5 — Commission accrual + refund reversal (Phase 2 hook)

**Edit** `src/lib/services/payments.ts` capture tx: after points award, call `accrueCommission(order, tx)` (in `affiliate.ts`).

`accrueCommission(order, tx)`:
- No-op if `order.affiliateId` is null.
- No-op if `order.userId === affiliate.userId` (self-order, no commission).
- **Idempotent:** no-op if an `AffiliateEvent { type:'order', orderId: order.id, commission > 0 }` already exists.
- `base = order.subtotal - order.discount`; `commission = round(base * affiliateCommissionPct / 100)`.
- Insert `AffiliateEvent { affiliateId, type:'order', orderId, amount: base, commission }`.

**Edit** the refund flow (Phase 2/3) → `reverseCommission(order, tx)`: insert a **compensating** `AffiliateEvent { type:'order', orderId, amount: -base, commission: -commission }` (audit-preserving; do not delete). Also reverse points (`awardPoints` negative row `reason: 'Refund reversal'`) per Phase 2 Epic 2.3 ✓.

**Data touched:** `AffiliateEvent` (insert; +ve on capture, −ve on refund), `PointsLedger` (−ve on refund).
**Edge cases:** duplicate webhook → idempotency check prevents double commission; refund of a partially-earned order → single full reversal (partial-refund proration is out of MVP scope — note it); tiered rate (15/18/22% in UI) — MVP uses flat `affiliateCommissionPct`; tiers are a later enhancement (compute per-affiliate rate from monthly order count) — call out, don't build.
**Acceptance:** a paid attributed order creates exactly one positive commission event; replaying the webhook adds none; refunding it creates a matching negative event and a negative points row; a self-order creates no commission event.

### Task 4.2.6 — Affiliate dashboard read + wire `Affiliate.tsx` off `localStorage`

**Create** `src/app/api/affiliate/me/route.ts` (GET) → `requireUser()`. Returns the caller's affiliate (or null → show application form):
```jsonc
{ "affiliate": { "handle","promoCode","status","payoutUpi" },
  "shareUrl": "https://femi9.in/r/<code>",
  "stats": { "clicks": 1284, "orders": 128, "totalEarned": 42000, "paidOut": 30000, "unpaid": 12000 },
  "recentEvents": [ { "type","amount","commission","createdAt" } ],
  "payouts": [ { "amount","status","periodStart","periodEnd","reference","paidAt" } ] }
```
- `clicks` = count `type=click`; `orders` = count `type=order` with `commission > 0`; `totalEarned` = `sum(commission)` (net of reversals); `paidOut` = `sum(amount)` of `paid` payouts; `unpaid` = `totalEarned − paidOut`.

**Edit** `src/screens/Affiliate.tsx`:
- Delete `STORAGE_KEY`, `loadAccount`, and **`generateCode()`** entirely.
- On mount fetch `GET /api/affiliate/me`. Three states: **no affiliate** → registration form (POSTs to `/api/affiliate/apply`); **pending** → "application under review" panel; **approved** → dashboard from live `stats`/`shareUrl`/`promoCode`.
- Keep copy/clipboard UI; the "Register another creator" reset becomes irrelevant (one affiliate per user) — replace with a link to the dashboard.

**Data touched:** reads `Affiliate`, `AffiliateEvent`, `AffiliatePayout`.
**Edge cases:** logged-out visitor → API 401 → show marketing + a sign-in-to-apply CTA; pending applicant sees no fake stats; numbers must reconcile with admin's view.
**Acceptance:** the affiliate dashboard shows **real** clicks/orders/earnings from the DB (not `localStorage`), and they match what `/r/:code` + a paid attributed order produced.

### Task 4.2.7 — Admin payout runs

**Create** `src/app/api/admin/affiliates/[id]/payouts/route.ts` (GET list + POST create) and `src/app/api/admin/payouts/[id]/route.ts` (PATCH mark paid). `requireStaff()`.
- **POST create:** body `{ periodStart, periodEnd }`. Compute `amount = unpaid` (or period-scoped sum of un-settled commission). Create `AffiliatePayout { affiliateId, amount, status:'pending', periodStart, periodEnd }`. If S1: also set `payoutId` on the settled events. **Guard:** `amount` must be `> 0` and `≤ currentUnpaid`.
- **PATCH mark paid:** body `{ reference }`. Set `status='paid'`, `paidAt=now`, `reference` (UPI ref). Notify affiliate (best-effort).

**Data touched:** `AffiliatePayout` (insert/update), optionally `AffiliateEvent.payoutId` (S1).
**Edge cases:** creating a payout with zero unpaid → reject; two concurrent payout creates → advisory lock on `affiliateId` (reuse the `pg_advisory_xact_lock` pattern) to prevent double-pay; without S1, base "unpaid" on `sum(commission) − sum(paid payouts)` so a still-`pending` payout doesn't reduce the pool (decide: either exclude pending or lock during creation — recommend S1 for correctness).
**Acceptance:** an admin can record a payout with a UPI reference, mark it paid, the affiliate's `unpaid` drops by that amount, and payout history appears in both admin and the affiliate dashboard; the same earnings can't be paid twice.

---

# Epic 4.3 — Partner CRM

### Task 4.3.1 — Partner application endpoint + notifications

**Create** `src/lib/services/partner.ts` and `src/app/api/partner/apply/route.ts` (POST, **public — no auth**).
- Zod: `name` (required), `phone` (exactly 10 digits, matches `Partner.tsx`), `city` (required in UI), `situation?`, `reason?`.
- `createPartnerApplication(input)` → insert `PartnerApplication { status:'new' }`.
- Rate-limit per IP + per phone (prevent spam). `logEvent({ type:'partner_apply' })`.
- `notify`: ops email/SMS (`inaicommunity@gmail.com` or ops list) **and** applicant WhatsApp/SMS confirmation. Best-effort. 🔒 #3 #4.

**Data touched:** `PartnerApplication` (insert).
**Edge cases:** phone not 10 digits → 400 (mirror client validation server-side); duplicate submissions from same phone within N minutes → rate-limited but still 200 to avoid blocking a genuine retry (or dedupe: return existing if same phone within 24h); `situation`/`reason` optional/empty → stored null.
**Acceptance:** submitting the partner form creates a `PartnerApplication` row visible in admin (no more `localStorage`-only save); ops receive a notification (or a `[notify:stub]` log until providers are live).

### Task 4.3.2 — Admin lead board (new → contacted → onboarded/rejected + notes)

**Create** `src/app/api/admin/partners/route.ts` (GET list, `?status=` filter, search by name/phone/city) and `src/app/api/admin/partners/[id]/route.ts` (GET detail, PATCH `{ status?, notes? }`). `requireStaff()`.
- Add an admin page/tab (Phase 3 shell) rendering a Kanban-ish board grouped by `PartnerStatus` (`new`,`contacted`,`onboarded`,`rejected`) with inline notes editing.

**Data touched:** `PartnerApplication` (read/update `status`, `notes`).
**Edge cases:** invalid status transition — allow any (simple CRM), but log; notes are free-text, trim/limit length; concurrent edits — last-write-wins is acceptable here.
**Acceptance:** staff can move a lead new→contacted→onboarded and add notes; the change persists and the board reflects it on reload.

### Task 4.3.3 — Wire `Partner.tsx` off `localStorage`

**Edit** `src/screens/Partner.tsx`:
- Replace the `localStorage.setItem(STORAGE_KEY, …)` on submit with `POST /api/partner/apply`.
- Keep the success panel ("Thank you, {name}…"); on success optionally keep a **client-only** `localStorage` flag purely to remember the visitor already applied (UX), but the DB row is the record.
- Server-validate name + 10-digit phone (don't rely on client `errors`).
**Acceptance:** a submitted application appears in `/admin` partner board; clearing `localStorage` does not lose the lead.

---

# Epic 4.4 — Community wall + moderation

**Model mapping (`WallPost`):** UI `name`/`handle` → for logged-in non-anon posts, display name = `User.name`; for anonymous, `isAnonymous=true` and `alias` = a **server-generated** gentle alias (port `ALIAS_A`/`ALIAS_B` + `randomAlias()` from `PeriodsWall.tsx` into the service). UI `product` chip → if it matches a real `Product` (by name/slug) set `productId`; the non-product chips (`Another brand`, `First period`) go into `tags[]`. UI `rating` → `WallPost.rating` (Int?, 0 means none → store null). `body` ≤ 600 chars; alias/name ≤ 40.

### Task 4.4.1 — Wall read API (approved feed, filters, liked-by-me)

**Create** `src/lib/services/wall.ts` and `src/app/api/wall/route.ts` (GET).
- `listApproved({ filter?, cursor?, take = 20, viewerId? })`: `where: { status: 'approved' }`, `orderBy: [{ createdAt:'desc' },{ id:'desc' }]`, cursor pagination. Filters mirror the UI's `FILTERS`/`FILTER_KEYWORDS` (All / Femi9 / Cramps / First period / Heavy days / Switching / Sensitive skin) — apply as `tags`/product/`body contains` queries (keep the keyword map server-side).
- Include `_count.replies` (or S4 `replyCount`) and `likeCount`; for a logged-in viewer, compute `likedByMe` via a single `WallLike` lookup for the page's post ids.
- Return feed DTO: `{ id, displayName, isAnonymous, handle/alias, product, rating, body, createdAt, likeCount, replyCount, likedByMe }`. Let the client compute `timeAgo` (keep its helper).

**Data touched:** reads `WallPost`, `WallLike`, `WallReply` (`_count`).
**Edge cases:** only `approved` posts are ever returned publicly (pending/hidden excluded); empty filter result → `[]` (client shows its empty state); cursor at end → empty page; anonymous viewer → `likedByMe:false` everywhere.
**Acceptance:** the feed is identical across two different browsers/devices (server-shared), paginates, and never leaks a `pending`/`hidden` post.

### Task 4.4.2 — Post create (default pending + keyword filter + rate limit)

**Create** `src/app/api/wall/route.ts` (POST).
- Zod: `body` (1–600, required, trimmed), `name?` (≤40), `product?`, `rating?` (0–5), `tags?`.
- Auth **optional**: if `session` present and no name/anon requested → attribute `userId` + use `User.name`; if no name given → `isAnonymous=true`, `alias = randomAlias()` (server-side).
- Status: default `pending`; if `wallAutoApprove` setting is true → `approved`.
- **Keyword filter:** if `body` matches any `wallBannedKeywords` (case-insensitive), set `status='hidden'` (auto-quarantine) and `logEvent({ type:'wall_flagged' })`.
- Map `product` chip → `productId` or `tags[]` (see mapping note).
- Rate-limit per IP + per user.

**Data touched:** `WallPost` (insert).
**Edge cases:** empty/whitespace body → 400 (matches client's ignore-empty); overlong body → 400; banned keyword → stored `hidden`, API still returns 201 with a "pending review" message (don't reveal moderation logic to the poster); anonymous alias collisions are fine (not unique); rating 0 → stored null.
**Acceptance:** a new post is **not** publicly visible until approved (default `pending`); a post containing a banned keyword is auto-hidden; flipping `wallAutoApprove=true` makes new posts appear immediately.

### Task 4.4.3 — Likes (toggle, persistent, count-consistent)

**Create** `src/app/api/wall/[id]/like/route.ts` (POST toggle). `requireUser()`.
- Transaction: check `WallLike { postId, userId }` (unique). If absent → create it + `likeCount { increment: 1 }`; if present → delete it + `likeCount { decrement: 1 }`. Return `{ liked, likeCount }`.

**Data touched:** `WallLike` (insert/delete), `WallPost.likeCount` (±1).
**Edge cases:** unauthenticated → 401 (**behavior change**: current UI toggles likes for anyone locally; now likes require login — prompt sign-in). Double-submit race → rely on `@@unique([postId, userId])`; on duplicate-create error treat as already-liked and reconcile count. Liking a `hidden`/`pending` post → 404 (only allow likes on `approved`). `likeCount` must never drift below 0.
**Acceptance:** a like persists across refresh and is visible to other users via the count; unliking reverts it; liking twice from two tabs yields exactly one `WallLike` and `likeCount` +1.

### Task 4.4.4 — Replies

**Create** `src/app/api/wall/[id]/reply/route.ts` (POST) and `src/app/api/wall/[id]/replies/route.ts` (GET list). Recommend `requireUser()` for POST (anti-abuse); allow anon read.
- POST: Zod `body` (1–600). Insert `WallReply { postId, userId?, body }`; if S4, `WallPost.replyCount { increment: 1 }`. Apply the same keyword filter (drop/flag).
- GET: list replies for a post, oldest-first.

**Data touched:** `WallReply` (insert), `WallPost.replyCount` (S4).
**Edge cases:** reply to a non-`approved` post → 404; `WallReply` has **no `status` field** in the schema → replies are **immediately visible** (call-out: if reply moderation is required, add `status ModerationStatus @default(approved)` **[SCHEMA ADD]**; MVP relies on requiring auth + keyword filter); empty body → 400.
**Acceptance:** a reply persists, is shared across visitors, and the post's reply count reflects it.

### Task 4.4.5 — Wire `PeriodsWall.tsx` off `localStorage` + seed the wall

**Edit** `src/screens/PeriodsWall.tsx`:
- Remove `STORAGE_KEY`, `loadPosts`, the persist `useEffect`, and the module-level `SEED` (migrate `SEED` into the DB seed — below).
- On mount + filter change, fetch `GET /api/wall?filter=`; render from server data (keep `PostCard`, `timeAgo`, icons).
- `handleSubmit` → `POST /api/wall`; on success show a "**thanks — your story is awaiting review**" confirmation (because default status is `pending`), not an immediate optimistic insert (or optimistically show it only to the author, greyed "pending").
- `toggleLike` → `POST /api/wall/[id]/like`; if 401, prompt sign-in; reconcile `likeCount`/`likedByMe` from the response.

**Edit** `prisma/seed.ts`: add `seedWall()` that inserts the 8 `SEED` posts as `WallPost { status:'approved', isAnonymous where name==='Anonymous', alias from handle, product→productId/tags, rating, body, likeCount: seed.likes, createdAt: derived from ts }`, and register it in `main()`. Keep idempotent (delete-and-recreate by a stable marker, e.g. seeded aliases, or `deleteMany` of seed ids).
**Data touched:** `WallPost` (seed inserts), reads via API.
**Edge cases:** SSR — the screen is client-side; ensure fetch runs after mount; keep the empty-state UI for filters with no matches.
**Acceptance:** the wall renders from Postgres (shared across all visitors), a newly submitted post is held for moderation, likes persist server-side, and a fresh DB shows the 8 seeded stories.

### Task 4.4.6 — Admin moderation queue (approve / hide / flags)

**Create** `src/app/api/admin/wall/route.ts` (GET, `?status=pending|hidden|approved`) and `src/app/api/admin/wall/[id]/route.ts` (PATCH `{ action: 'approve' | 'hide' }`). `requireStaff()`.
- PATCH sets `WallPost.status` accordingly. Add an admin page/tab (Phase 3 shell) listing the queue with the post body, author, flagged-keyword highlight, and approve/hide buttons.
- Optional: a `GET /api/admin/wall?flagged=1` view surfacing keyword-hidden posts for review.

**Data touched:** `WallPost.status` (update).
**Edge cases:** approving an already-approved post → no-op; hiding a post it doesn't cascade-delete likes/replies (they remain, just not shown); moderation must be idempotent; ensure the public feed re-queries so an approved post appears (no stale cache).
**Acceptance:** a `pending` post is invisible publicly until an admin approves it; hiding an approved post removes it from the public feed; keyword-flagged posts appear in the moderation queue.

---

## 5. Phase 4 "done" — acceptance rollup

Phase 4 is complete when, on a fresh seeded DB with Phase 1–3 in place:
1. **Rewards:** balance equals `sum(PointsLedger.delta)`; a paid order credits points once (idempotent under webhook replay); redeeming a `RewardOption` transactionally creates a single-use `Coupon`, emails/returns the code, and cannot double-spend under concurrency. (`Rewards.tsx` reads DB, not `localStorage`.)
2. **Affiliate:** application (authenticated) yields a **server-allocated unique** `promoCode`; admin approval activates it; `/r/:code` logs deduped clicks + sets the `femi9_ref` cookie; checkout attributes the order (cookie or typed code) and applies the follower discount on first orders; a paid attributed order accrues exactly one commission event (self-orders excluded, refunds reversed); the affiliate dashboard shows real clicks/orders/earnings; admin can run a payout with a UPI reference and the same earnings can't be paid twice.
3. **Partner CRM:** the form writes a `PartnerApplication` (no `localStorage`-only save), ops are notified, and staff move the lead new→contacted→onboarded/rejected with notes.
4. **Community wall:** posts/likes/replies persist server-side and are shared across all visitors; new posts default to `pending` (keyword-banned ones auto-hidden); only `approved` posts show publicly; admins approve/hide from a moderation queue.

## 6. Suggested build order (respecting dependencies)

1. **S1–S7 migration + settings** (Section 1) — unblocks everything.
2. `notify.ts` stub + confirm `guards.ts` / `ratelimit.ts` exist (or stub).
3. **Rewards ledger** (4.1.1 → 4.1.5) — self-contained, testable without Phase 2 (hook 4.1.2 lands when Phase 2's capture tx is available).
4. **Community wall** (4.4.1 → 4.4.6) — self-contained, high user-visible value, no Phase 2 dependency.
5. **Partner CRM** (4.3.1 → 4.3.3) — self-contained.
6. **Affiliate** (4.2.1 → 4.2.7) — heaviest cross-phase coupling (checkout 4.2.4, capture 4.2.5); do after the checkout/payment seams from Phase 2 are stable.
