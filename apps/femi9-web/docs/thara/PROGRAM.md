# Thara Model — Program Guide

> **Audience:** engineers, product, ops, support.
> **Scope:** the full program design (all six sub-projects) and every discount / commission / reversal rule. Marks what's **shipped** vs what's **spec'd but not built yet**.

**Related documents**
- Spec (sub-project A, foundation): `docs/superpowers/specs/2026-08-12-thara-model-A-enrollment-design.md`
- Implementation plan (A): `docs/superpowers/plans/2026-08-12-thara-model-A-enrollment.md`
- Terms & conditions placeholder: `docs/thara/terms/v1.md`

---

## 1. What the Thara Model is

The Thara Model is Femi9's **opt-in customer referral and loyalty program**. Any registered customer can enrol, complete a qualifying purchase, and then earn three stacked benefits going forward:

| # | Benefit | Trigger | Reward |
|---|---------|---------|--------|
| **1** | **Personal purchase discount** | The Thara member's own order ≥ ₹3,000 | 10% / 15% / 20% off by slab |
| **2** | **Referral commission** | A downline user's paid order (any amount) | 10% of that order as **Femi9 store credit** — auto-applies to the member's next order |
| **3** | **Reward points → quarterly Amazon voucher** | A downline user's paid order (any amount) | 1% as points → at quarter close: `points × 3` = ₹ Amazon voucher |

**Everyone can enrol.** Referred customers do **not** need to enrol to buy — they're regular shoppers to Femi9. Enrolment is only what unlocks earning power for the referrer.

**Single-level referral tree.** A refers B and C. A earns on B's and C's purchases. B refers D → B earns on D. A does **not** earn on D. No MLM cascade.

---

## 2. Who's who

| Role | Meaning |
|---|---|
| **Non-member** | Any registered Femi9 customer who has not enrolled in Thara. |
| **Thara member (purchase_pending)** | Enrolled, accepted T&C, but has not yet completed a ≥ ₹3,000 order themselves. Cannot earn referral benefits yet. |
| **Thara member (active)** | Enrolled + completed a ≥ ₹3,000 order. Can now earn on downline purchases and use their personal discount. |
| **Thara member (suspended)** | Admin-suspended for suspected abuse. Past earnings preserved; no new accruals. |
| **Thara member (deactivated)** | Voluntarily opted out. Terminal state for this user. |
| **Downline user** | Any user who was referred by a Thara member (attribution row exists). Does **not** need to be a Thara member themselves. |

---

## 3. Enrollment lifecycle

```
   NON-MEMBER
       │
       │ POST /api/thara/enroll { termsVersion }
       │  — auto-issues a unique 8-char referral code
       ▼
  purchase_pending  ◄─────────────────────────┐
       │                                      │  admin unsuspends
       │ pays for order with subtotal ≥ ₹3,000│  → status is restored to
       │  (activation happens INSIDE the      │    whatever it was before
       │   markOrderPaid DB transaction)      │    the suspension
       ▼                                      │
     ACTIVE ─────── admin suspends ────────► SUSPENDED
       │
       │ POST /api/thara/opt-out
       ▼
   DEACTIVATED  (terminal — cannot re-enrol on the same user;
                 referral code is preserved as an audit anchor
                 but is treated as invalid on `/r/[code]`)
```

**Activation is server-authoritative.** The promotion `purchase_pending → active` runs inside the same database transaction as `markOrderPaid`, so a member can never end up "active" with no qualifying order behind it. Similarly, the qualifying order is stamped on the membership row (`qualifyingOrderId`) inside that same transaction.

**Activation also looks backwards.** The payment path only fires for orders paid *after* the membership exists, and the ordinary sequence is the other way round: the shopper buys, then finds the programme from her account page. `activateFromPastOrders(tx, userId)` asks the mirror question — "this membership is `purchase_pending`, is there already a paid order ≥ ₹3,000 behind it?" — and promotes if so, stamping the **oldest** qualifying order as `qualifyingOrderId`. It runs:

- inside `enrollUser`, so joining after a qualifying purchase unlocks immediately;
- via `syncTharaActivation(userId)` on `GET /api/thara/me` and `GET /api/thara/summary`, so a member already stuck in `purchase_pending` repairs herself the next time she opens the dashboard.

It only ever moves `purchase_pending → active`; `suspended`, `deactivated` and `active` rows are untouched, and it skips any order already stamped on another membership (`qualifyingOrderId` is `@unique`).

---

## 4. Referral link and attribution flow

Every Thara member gets a **unique referral code**, format: **4 uppercase letters + 4 digits**, e.g. `TARA5578`.

- Letter alphabet: `ABCDEFGHJKMNPQRSTUVWXYZ` (23 chars — no `I`, `L`, `O`)
- Digit alphabet: `23456789` (8 chars — no `0`, `1`)
- **≈ 1.15 billion possible codes** — collision headroom for years.
- **Case-insensitive on input**, upper-cased server-side. So `tara5578` and `TARA5578` are the same code.
- **Case-normalised URL**: `https://femi9.in/r/TARA5578`.

### 4.1 What happens when someone clicks a referral link

```
Friend receives  https://femi9.in/r/TARA5578  (WhatsApp, SMS, whatever)
        │
        │  GET /r/TARA5578
        ▼
┌─────────────────────────────────────────────────┐
│  /r/[code] route  (Next.js edge)                │
│                                                  │
│  1. Feature flag off?          → 404             │
│  2. Code malformed?            → 302 /           │
│  3. Code not found?            → 302 /           │
│  4. Referrer suspended/off?    → 302 /           │
│  5. Otherwise: set signed HttpOnly cookie        │
│     femi9_thara_ref = jwt(referrer.id)           │
│     TTL 30 days                                  │
│     → 302 to /                                   │
└─────────────────────────────────────────────────┘
        │
        ▼
Friend browses, adds to cart, and eventually signs up.
```

The cookie is **signed with `AUTH_SECRET`** (HS256, distinct audience `femi9-thara-ref`) so a hostile shopper cannot hand-craft one that would credit an arbitrary member.

### 4.2 What happens when the friend signs up

Every sign-in path — **phone OTP, email magic link, Google OAuth** — flows through the same helper `attributeReferralIfPresent`. Immediately after the User is created or matched, the helper runs. It is **fire-and-forget**: attribution failure never blocks sign-in.

```
POST /api/auth/otp/verify        \
GET  /api/auth/email/verify       │  →  attributeReferralIfPresent(user, ctx)
GET  /api/auth/google/callback   /
```

**Guards (in order):**

1. No `femi9_thara_ref` cookie → skip.
2. Cookie signature invalid → skip (someone tampered).
3. Referrer id doesn't resolve to a `TharaMembership` → skip.
4. Referrer is `suspended` or `deactivated` → skip.
5. The friend and the referrer are the **same user** → **reject** (self-referral).
6. The friend's verified **email matches** the referrer's → **reject** (duplicate account).
7. The friend's **phone matches** the referrer's → **reject** (duplicate account).
8. The friend already has a `TharaReferral` row (unique constraint on `referredUserId`) → **reject** (`already-attributed` — one referrer per user, forever).
9. Otherwise: **create the `TharaReferral` row**, stamp `ipAtSignup` + `uaAtSignup` for fraud analytics.
10. Clear the cookie either way.

### 4.3 When the referral becomes permanent

Attribution is created at signup with `lockedAt = null`. Admin can delete an obviously-fraudulent row during this window. **The referral becomes permanent (locked forever) on the friend's first paid ≥ ₹3,000 order.** The lock happens inside the same `markOrderPaid` transaction as activation, so the state is always coherent.

```
markOrderPaid(order)   ── DB transaction ──
    │
    │  1. flip Order.status pending → paid
    │  2. award existing Bloom loyalty points
    │  3. Thara: activate + lock if eligible
    │       │
    │       │  If buyer has a purchase_pending membership
    │       │     AND order.subtotal ≥ 300 000 paise (₹3,000)
    │       │  → membership.status = active
    │       │    membership.activatedAt = now
    │       │    membership.qualifyingOrderId = order.id
    │       │
    │       │  If buyer has an incoming referral with lockedAt = null
    │       │     AND order.subtotal ≥ 300 000 paise
    │       │  → tharaReferral.lockedAt = now      (permanent from this instant)
    │       ▼
```

---

## 5. Benefit 1 — Personal purchase discount

**Applies to the Thara member's own orders.** Slab-based on order subtotal.

| Order subtotal | Discount |
|---|---:|
| < ₹3,000 | none (order not eligible under the program) |
| ₹3,000 – ₹5,999 | **10%** |
| ₹6,000 – ₹8,999 | **15%** |
| ₹9,000 and above | **20%** |

**Rules:**

- Member must be `active` (i.e. has already completed a qualifying ≥ ₹3,000 order). A `purchase_pending` member sees no discount on that first order — the first ≥ ₹3,000 order pays full price, then activates them for future orders.
- Discount is computed on **subtotal** (before shipping).
- **No stacking with promo coupons.** At checkout, the system picks the better of the two (the Thara discount OR the existing coupon), not both.
- Applied server-side at order creation. Client-shown discount is a preview only — the authoritative amount is what the server writes to `Order.discount`.
- Below ₹3,000: order is placed as a normal order at full price. No Thara discount, no partial slab.

**Example:**

```
Cart subtotal:   ₹4,000
Slab:            ₹3,000 – ₹5,999 → 10% off
Discount:        ₹400
Payable (before shipping):  ₹3,600
```

**Status:** 🟨 Spec'd — implementation lands in sub-project B.

---

## 6. Benefit 2 — Referral commission (10% → Femi9 store credit)

Every time a downline user pays for an order, the referring Thara member earns **10% of that order's subtotal** as **Femi9 store credit**. Credit is auto-applied to the member's next Femi9 order.

**How it works:**

```
Downline user pays ₹3,000 order
                │
                │  (inside markOrderPaid transaction)
                ▼
Look up TharaReferral where referredUserId = downline.id
                │
                │  If lockedAt is set (permanent referral):
                │  earn = 10% × subtotal = ₹300
                ▼
Append to TharaCreditLedger:
    {
      userId: referrer.userId,
      delta: +300 (paise: +30 000),
      reason: 'referral-commission',
      sourceOrderId: downline_order.id,
    }
Balance = SUM(delta) over all rows for that user.
```

**Rules:**

- **Requires the referrer to be `active`.** A `purchase_pending` member's downline purchases produce no commission until the referrer completes their own ≥ ₹3,000 order. Once the referrer becomes active, future downline purchases start earning; **past downline purchases do not backfill**.
- **Requires the referrer to be not-suspended.** Suspended members earn nothing during the suspension window. Prior earnings remain in the ledger.
- **Applies to any downline order**, no minimum. A ₹500 order earns ₹50 credit.
- **Applied automatically at the referrer's next checkout.** No coupon code, no opt-in. The credit reduces the payable amount and is debited from the ledger in the same transaction.
- **Store credit only.** Not withdrawable to bank / UPI. Not transferable.
- **No expiry.** Credit persists as long as the account exists.

**Ledger design:** append-only. Every credit is a positive `delta`; every debit (spent on a future order) is a negative `delta` with a link to the order that consumed it; every refund reversal (see §8) is a negative `delta` with a link back to the original commission row. Balance = `SUM(delta)` for that user. Historical rows are never mutated.

**Status:** 🟨 Spec'd — implementation lands in sub-project C.

---

## 7. Benefit 3 — Reward points (1% → quarterly Amazon voucher)

Every downline order also generates **1% of subtotal as reward points**, distinct from the Femi9 credit. Points accumulate over a rolling **three-month cycle**. At the end of the cycle, `points × 3` is issued as an Amazon voucher.

**How it works:**

```
Downline user pays ₹3,000 order
                │
                │  (inside markOrderPaid transaction)
                ▼
Look up TharaReferral where referredUserId = downline.id, lockedAt not null
                │
                │  earn = 1% × subtotal = ₹30 = 30 points
                ▼
Append to TharaRewardPointsLedger:
    {
      userId: referrer.userId,
      delta: +30,
      reason: 'referral-points',
      sourceOrderId: downline_order.id,
      cycleId: current_open_cycle.id,
    }

At end of cycle (cron job on the 1st of the quarter):
    total_points = SUM(delta) for the closed cycle
    voucher_value = total_points × 3   (rupees)
    Create TharaVoucher {
      userId, cycleId, points: total_points,
      valueRupees: voucher_value, status: 'available',
      claimDeadline: cycleClose + 30 days,
    }
    Amazon Incentives API → generate real gift-code → attach to voucher.
    (Fallback while API onboarding is in flight: admin pastes codes manually
     via /admin/thara/vouchers.)
```

**Cycle timing:**

- Fixed calendar quarters (Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec) — admin-configurable if a different rhythm is preferred later.
- Voucher is issued within the first hour of the quarter after close.
- Voucher must be claimed within **30 days** of issuance or it expires. Expired vouchers are marked `expired` and the underlying Amazon code (if issued) is not reused.

**Example — full downline math for one cycle:**

```
Referrer A is active.

Person B (referred by A) buys ₹3,000
    → Femi9 credit to A: ₹300     (Benefit 2)
    → Reward points to A:  30 pts (Benefit 3)

Person C (referred by A) buys ₹8,000
    → Femi9 credit to A: ₹800     (Benefit 2)
    → Reward points to A:  80 pts (Benefit 3)

A's cycle totals:
    Store credit accrued this cycle:  ₹1,100  (already usable at next checkout)
    Reward points accrued:            110

At cycle close:
    Voucher value: 110 × 3 = ₹330 Amazon voucher issued to A.
```

**Rules:**

- Same eligibility as commission (active + not suspended).
- Points are **not spendable directly** — they only become a voucher at cycle close.
- **No expiry mid-cycle.** Points only become vulnerable to expiry once they turn into a voucher.
- **Unclaimed vouchers expire** after 30 days.

**Status:** 🟨 Spec'd — implementation lands in sub-project D.

---

## 8. Refund and reversal policy

If a downline order that generated commission and/or points is later **refunded, cancelled, or otherwise reversed**, the earnings tied to that order are reversed too.

**Rules:**

- **Any refund state** (`cancelled`, `refunded`, `partially_refunded`) triggers reversal.
- **Full reversal on full refund.** A ₹3,000 order that generated ₹300 credit + 30 points is fully reversed: ₹300 debited, 30 points debited.
- **Proportional reversal on partial refund.** A ₹5,000 order refunded to ₹2,000 (₹3,000 kept) sees the commission recomputed on the kept amount: `₹3,000 × 10% = ₹300` — the difference (`₹500 − ₹300 = ₹200`) is debited from credit; points also proportional.
- **Ledger is append-only.** Reversal writes a negative-delta row referencing the original earning row. Original row is never edited.
- **Negative balance is allowed.** If the referrer has already spent the credit at another checkout by the time the refund happens, their credit balance goes negative. They cannot spend more until earnings restore it to ≥ 0.
- **Voucher-stage reversal.** If points were already rolled into an issued voucher and the voucher has not been claimed, the voucher value is reduced accordingly. If the voucher was already claimed and used, no clawback of the Amazon code — the ledger records a negative `delta` on the referrer's balance as a soft claim against future earnings.

---

## 9. Fraud prevention

Layered guards, from cheapest to catch to hardest to bypass.

| Guard | Where enforced | Behaviour |
|---|---|---|
| **Self-referral** | Signup hook | If the friend's user id equals the referrer's, reject silently. |
| **Duplicate account — same email** | Signup hook | If the friend's verified email matches the referrer's, reject. |
| **Duplicate account — same phone** | Signup hook | If the friend's phone matches the referrer's, reject. |
| **Suspended referrer** | Signup hook + `/r/[code]` | No cookie set; existing cookie is ignored at signup. |
| **One referrer per user, forever** | DB unique index on `TharaReferral.referredUserId` | Even if a second referral link is clicked, the row won't insert. |
| **Cookie unforgeability** | HS256 JWT over `AUTH_SECRET`, distinct audience `femi9-thara-ref` | Hand-crafted cookies fail signature verification. |
| **No post-hoc attribution** | (by design — no admin API to attach a referrer to an already-signed-up user) | "I forgot the link, credit me" flow does not exist. |
| **IP / User-Agent capture** | Non-blocking, stored on `TharaReferral` | Powers admin queries like "one referrer's 50 signups all from the same subnet"; escalates to a manual suspension. |
| **Admin suspend / deactivate** | `/api/admin/thara/[id]/suspend` | Ops-level breaker. Preserves prior status for clean unsuspend. |
| **Order-refund clawback** | Refund webhook (§8) | Fraudulent orders that generated earnings are automatically reversed. |

---

## 10. Configuration

Everything below is meant to be **admin-configurable** without a code deploy (business team can tune slabs, cycle length, etc.). The current implementation ships with the values below as sane defaults.

| Setting | Default | Location |
|---|---|---|
| Minimum qualifying purchase | ₹3,000 (300 000 paise) | `THARA_QUALIFYING_MIN_PAISE` in `src/lib/services/thara.ts` |
| Discount slab 1 (%) | 10% for ₹3,000–₹5,999 | (Sub-project B) `TharaSetting` table |
| Discount slab 2 (%) | 15% for ₹6,000–₹8,999 | (Sub-project B) `TharaSetting` table |
| Discount slab 3 (%) | 20% for ₹9,000+ | (Sub-project B) `TharaSetting` table |
| Referral commission rate | 10% of downline subtotal | (Sub-project C) `TharaSetting` table |
| Reward points rate | 1% of downline subtotal | (Sub-project D) `TharaSetting` table |
| Voucher multiplier | ×3 | (Sub-project D) `TharaSetting` table |
| Cycle length | 3 months (calendar quarters) | (Sub-project D) `TharaSetting` table |
| Voucher claim deadline | 30 days after issue | (Sub-project D) `TharaSetting` table |
| Current T&C version | `"v1"` | `THARA_TERMS_VERSION` in `src/lib/thara/terms.ts` |
| Feature flag | `THARA_ENABLED` (env, default `"false"`) | See `DEPLOY.md § Thara Model feature flag` |

---

## 11. What's built vs what's planned

| # | Sub-project | Status | Notes |
|---|---|---|---|
| **A** | **Enrolment + attribution** | ✅ **Shipped** (`c674ebd`) | Schema, feature flag, referral code, cookie, signup hook wiring, activate + lock in `markOrderPaid`, customer + admin routes, E2E extension, runbook doc. 37 new tests. |
| **B** | Personal discount at checkout | 🟨 Spec'd, not built | Slab lookup at cart-total time; no stacking with coupons. |
| **C** | Wallet + commission accrual | 🟨 Spec'd, not built | Append-only `TharaCreditLedger`; auto-apply at checkout; refund reversal. |
| **D** | Reward points + quarterly voucher | 🟨 Spec'd, not built | `TharaRewardPointsLedger`, cron, `VoucherIssuer` interface, Amazon Incentives API integration with admin-manual fallback. |
| **E** | Email invites via Resend | 🟨 Spec'd, not built | Referrer enters friend emails; Resend delivers; suppression list on bounces. |
| **F** | Customer + admin dashboards | 🟨 Spec'd, not built | Thara dashboard, wallet page, rewards page, referral page; admin metrics + user detail views. |

**Flag stays off in production** until B is also live — otherwise enrolled members would see nothing on their orders.

---

## 12. Key files and code map

**Feature flag**
- `src/lib/thara/feature.ts` — `isTharaEnabled()`

**Referral code**
- `src/lib/thara/codes.ts` — `generateReferralCode()`, `normalizeReferralCode()`
- `LETTER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"`
- `DIGIT_ALPHABET = "23456789"`

**Attribution cookie**
- `src/lib/thara/cookies.ts` — `signTharaRefCookie()`, `verifyTharaRefCookie()`
- Cookie name: `femi9_thara_ref`, TTL 30 days, HS256, aud `femi9-thara-ref`.

**T&C version**
- `src/lib/thara/terms.ts` — `THARA_TERMS_VERSION` (currently `"v1"`)
- Text: `docs/thara/terms/v1.md` (placeholder pending legal)

**Service layer**
- `src/lib/services/thara.ts` — all business logic:
  - `enrollUser(userId, termsVersion)` — idempotent
  - `optOutUser(userId)` — sets `deactivated`
  - `getMembership(userId)`
  - `attributeReferralIfPresent(user, ctx)` — signup-hook helper
  - `activateAndLockIfEligible(tx, orderId)` — called from `markOrderPaid`
  - `activateFromPastOrders(tx, userId)` — backward-looking activation (§3)
  - `syncTharaActivation(userId)` — best-effort route-level wrapper for the above
  - `getUnlockProgress(userId)` — biggest single paid order vs the ₹3,000 bar, for the dashboard meter
  - `suspendMembership(id, reason)` / `unsuspendMembership(id)`
  - `getMembershipById(id)` / `listMemberships(filter)`
  - `THARA_QUALIFYING_MIN_PAISE = 300_000`

**Sign-in integration**
- `src/lib/services/auth.ts` — `verifyOtp`, `verifyMagicLink`, `signInWithGoogle` each accept an optional `attributionCtx: TharaAttributionCtx`.
- Routes that pass it in:
  - `app/api/auth/otp/verify/route.ts`
  - `app/api/auth/email/verify/route.ts`
  - `app/api/auth/google/callback/route.ts`

**Payment integration**
- `src/lib/services/checkout.ts` — `markOrderPaid` calls `activateAndLockIfEligible(tx, order.id)` inside its transaction, so activation and referral lock share atomicity with order-status flip.

**Routes**
- `app/r/[code]/route.ts` — public referral link
- `app/api/thara/enroll/route.ts` — customer, POST
- `app/api/thara/me/route.ts` — customer, GET
- `app/api/thara/opt-out/route.ts` — customer, POST
- `app/api/admin/thara/list/route.ts` — admin, GET
- `app/api/admin/thara/[id]/route.ts` — admin, GET
- `app/api/admin/thara/[id]/suspend/route.ts` — admin, POST
- `app/api/admin/thara/[id]/unsuspend/route.ts` — admin, POST

**Schema**
- `prisma/schema.prisma` — models `TharaMembership`, `TharaReferral`; enum `TharaStatus`. Back-relations on `User` (`tharaMembership`, `tharaReferralReceived`) and on `Order` (`tharaQualifyingFor`).
- Migration: `prisma/migrations/20260812093323_thara_a_enrollment/migration.sql` (additive only).

**Tests**
- Unit: `test/unit/thara-{feature,codes,cookies}.test.ts` (15 tests)
- Integration: `test/integration/thara-{enrollment,attribution,activation,admin}.test.ts` (22 tests)
- E2E: `scripts/e2e-http.mjs` — auto-skips the Thara block when `THARA_ENABLED` is off.

---

## 13. Common questions

**Q — I placed two orders and I'm still not unlocked. Why?**
The rule measures a **single order**, not a running total: one order of ≥ ₹3,000 unlocks; two ₹1,500 orders never do. `/thara` shows the member's **biggest single paid order** against the ₹3,000 bar for exactly this reason, and says in as many words that orders are not added together.

**Q — I bought first and joined afterwards. Does my old order count?**
Yes. `activateFromPastOrders` (§3) promotes you at enrolment off your order history, and the oldest qualifying paid order is stamped as the one that unlocked you. You do not have to buy again.

**Q — What if a member enrols but never buys anything?**
They stay in `purchase_pending` forever. Their referral link works and can capture attributions, but the moment the referred friend pays, only the friend's order+lock+activation happens — the referrer earns nothing because they themselves are not yet `active`. If the referrer later completes their own ≥ ₹3,000 order, they become `active` — and **future** downline orders start earning, but past ones don't backfill.

**Q — What if two Thara members happen to share the same phone number (edge case)?**
Not possible: `User.phone` has a `@unique` constraint. There's exactly one User per phone number in the system.

**Q — What if the referrer opts out after a friend has already been attributed to them but before the friend's first paid order?**
The referral row exists but `lockedAt` is null. Because the referrer's membership is `deactivated`, no commission or points would accrue on the friend's future purchases either way. The row stays as an audit record.

**Q — Does the personal discount apply to the qualifying (first ≥ ₹3,000) order?**
No. Activation happens **inside** the same transaction that marks the order paid, but the discount computation runs earlier (at checkout, when the order is created). So the first qualifying order pays full price and unlocks future orders' discount.

**Q — Can a member share their referral link publicly (WhatsApp status, Instagram bio)?**
Yes. There's no per-code rate limit on `/r/[code]`. But fraud detection watches for high-volume attributions from the same IP/UA cluster — if it looks like link-farming, admin can suspend.

**Q — What happens to a suspended member's earnings?**
Already-accrued store credit stays in their ledger. Already-issued vouchers stay valid until their claim deadline. **New** commission and points do not accrue during suspension.

**Q — Can a customer be both a Thara member AND a downline user of someone else?**
Yes. Enrolment and being-referred are independent. The customer earns on **their** downline's orders (Benefit 2 + 3), and the customer's own referrer earns on **the customer's** orders (from the referrer's perspective, the customer is a downline user).
