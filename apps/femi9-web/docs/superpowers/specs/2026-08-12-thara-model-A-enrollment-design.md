# Thara Model — Sub-project A: Enrollment & Referral Attribution

**Status:** Draft
**Date:** 2026-08-12
**Owner:** Femi9 core team
**Source PRD:** `Thara Model Earning Referral System.pdf`
**Scope:** Foundation only (data model + enrollment lifecycle + referral attribution). Later sub-projects (B: personal discount, C: wallet/credit, D: reward points/voucher, E: email invites via Resend, F: dashboards) build on top of this.

---

## 1. Program at a glance

The Thara Model is an opt-in referral and loyalty program on top of the Femi9 storefront. An enrolled ("Thara") customer gets three stacked benefits:

| # | Benefit | Trigger | Reward |
|---|---------|---------|--------|
| 1 | Personal purchase discount | User's own order ≥ ₹3,000 | 10% / 15% / 20% by slab |
| 2 | Referral commission | A downline user's paid order | 10% credited to Femi9 wallet (store credit, no cash withdrawal) |
| 3 | Reward points | A downline user's paid order | 1% points, quarterly close × 3 → Amazon voucher |

Only sub-project A is specified here. Sub-projects B–F each get their own spec.

## 2. Ship strategy

- **Phased**: A → B → C → E → D → F.
- **Single feature flag** `THARA_ENABLED` gates all new routes/UI. When off, storefront is unchanged and new routes return 404.
- **Additive schema** — no existing tables modified.
- **All monetary values in paise (integer)** to match `Order.subtotal` / `total` convention.
- **Two currencies, clearly separated**:
  - Femi9 Credit (₹, from 10% commission) — store credit, auto-applies at checkout, no expiry.
  - Reward Points (from 1%) — quarterly cycle, × 3 → Amazon voucher via Amazon Incentives API (fallback: admin-issued codes).

## 3. Goals for sub-project A

Build the identity spine everything else reads from:

1. A user can enrol in the program from the app.
2. Enrolment progresses through a defined status lifecycle culminating in `active` when a qualifying purchase completes.
3. Each Thara member has a unique, human-typable referral code and a shareable link.
4. When a visitor reaches the site via a referral link and signs up, the referral relationship is captured.
5. The relationship becomes permanent when the referred user pays for their first qualifying order.
6. Self-referral and obvious duplicate-account attribution are blocked.
7. Admins can suspend, unsuspend, and view any member.

Explicit non-goals for A: personal discount at checkout, wallet credit accrual, reward points, invite emails, dashboards. Those are B–F.

## 4. Data model

Additions to `prisma/schema.prisma`. All fields required unless annotated.

```prisma
enum TharaStatus {
  purchase_pending   // Enrolled but no qualifying purchase yet
  active             // Qualifying purchase completed; can earn referral benefits
  suspended          // Admin-suspended (accruals paused)
  deactivated        // User opted out (permanent)
}

model TharaMembership {
  id                    String       @id @default(cuid())
  userId                String       @unique
  user                  User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  status                TharaStatus  @default(purchase_pending)
  enrolledAt            DateTime     @default(now())
  activatedAt           DateTime?
  qualifyingOrderId     String?      @unique
  qualifyingOrder       Order?       @relation("TharaQualifyingOrder", fields: [qualifyingOrderId], references: [id])

  referralCode          String       @unique               // 8-char: 4 letters + 4 digits, e.g. "TARA5578"
  termsAcceptedAt       DateTime
  termsVersion          String

  suspendedAt           DateTime?
  suspendedReason       String?
  deactivatedAt         DateTime?

  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  referralsMade         TharaReferral[]  @relation("Referrer")

  @@index([status])
  @@index([referralCode])
}

model TharaReferral {
  id                String            @id @default(cuid())
  referrerId        String                                        // TharaMembership.id
  referrer          TharaMembership   @relation("Referrer", fields: [referrerId], references: [id], onDelete: Cascade)
  referredUserId    String            @unique                     // User.id — referred user need NOT be a Thara member
  referred          User              @relation("TharaReferralReceived", fields: [referredUserId], references: [id], onDelete: Cascade)

  attributedAt      DateTime          @default(now())             // Set at referred user's signup
  lockedAt          DateTime?                                     // Set when referred pays first qualifying order

  invitedByEmail    String?                                       // If invite came through the app's email flow
  invitedByLink     Boolean           @default(false)             // If invite came through a shared link
  ipAtSignup        String?                                       // Fraud signal, not blocking
  uaAtSignup        String?                                       // Fraud signal, not blocking

  createdAt         DateTime          @default(now())

  @@index([referrerId])
}
```

Matching back-relations on existing models:

```prisma
model Order {
  // …existing fields…
  tharaQualifyingFor       TharaMembership? @relation("TharaQualifyingOrder")
}

model User {
  // …existing fields…
  tharaMembership          TharaMembership?
  tharaReferralReceived    TharaReferral?   @relation("TharaReferralReceived")
}
```

**Terminology.** A user is a "downline" of a Thara member X if `TharaReferral.referrerId = X.id` for that user. The downline user does **not** need to be enrolled in Thara themselves; they only need to have been attributed at signup. All future paid orders by that downline user generate commission for X (sub-project C) and reward points for X (sub-project D).

**Migration path.** Additive-only Prisma migration; existing rows untouched. Non-Thara users see zero schema-visible changes.

## 5. Referral code

- **Format**: 4 uppercase letters + 4 digits.
- **Letter alphabet** (23 letters): `ABCDEFGHJKMNPQRSTUVWXYZ` — `I`, `L`, `O` excluded (look like `1`, `1`, `0`).
- **Digit alphabet** (8 digits): `23456789` — `0`, `1` excluded (look like `O`, `I`).
- **Total codes**: 23⁴ × 8⁴ ≈ 1.15 × 10⁹. Zero collision risk in practice.
- **Case-insensitive on input**; upper-cased server-side.
- **URL shape**: `${NEXT_PUBLIC_SITE_URL}/r/TARA5578` — no `TH-` prefix, keep short for WhatsApp/SMS.
- **Generation**: retry on `unique` violation up to 5 times; fail loudly if all 5 collide (indicates a bug or exhaustion, neither of which we should silently fall through).

## 6. Enrollment lifecycle

```
NON-MEMBER
    │
    │ POST /api/thara/enroll  { termsVersion, refCodeFromCookie? }
    ▼
purchase_pending  ◄────────────────────────┐
    │                                      │
    │ pays for order with subtotal ≥ ₹3,000│  (admin unsuspends)
    │  → same DB transaction promotes      │
    ▼                                      │
  ACTIVE ────── (admin suspends) ────────► SUSPENDED
    │
    │ POST /api/thara/opt-out
    ▼
DEACTIVATED  (referral code preserved but disabled)
```

**Rules.**
- `/api/thara/enroll` is idempotent — a second call by the same user is a no-op that returns the existing membership.
- Enrolment requires the user to be authenticated. Guest signup + enrolment is out of scope for A.
- Activation is server-authoritative: promoted inside the same DB transaction that flips the qualifying order's status to `paid`.
- Suspended members' pending accruals remain (they'll show in B/C/D), but no new accruals occur while suspended.
- Deactivation is permanent — a deactivated member cannot re-enrol under the same user (they'd need admin restoration). This dodges deactivate-to-avoid-suspension abuse.

## 7. Attribution

Referral capture happens at signup, not at click. The link route sets a cookie; signup consumes it.

**Route `GET /r/[code]`.**
- Look up `TharaMembership` by `referralCode` where `status IN (active, purchase_pending)`.
- If found: set signed HttpOnly cookie `thara_ref` (payload = referrer membership ID, TTL 30 days, SameSite=Lax, signed with `AUTH_SECRET`).
- If not found or status is `suspended`/`deactivated`: no cookie, silent.
- 302 to `NEXT_PUBLIC_SITE_URL/`.

**Signup consumption.**
- All auth paths (email magic link, Google, phone OTP) flow through a common post-signup hook. The hook does NOT auto-enrol the new user into Thara — the referred user has not accepted T&Cs, and per §22 of the PRD they don't need to be Thara members for the referrer to earn commission on their purchases. The hook only records the attribution:
  1. Reads `thara_ref` cookie. Missing → do nothing.
  2. Verifies signature. Invalid → clear cookie, do nothing.
  3. Rejects if `referredUserId == referrer.userId` (self-referral).
  4. Rejects if new user's verified email or phone matches the referrer's (dup account).
  5. Rejects if referrer is `suspended` or `deactivated`.
  6. Creates `TharaReferral` pointing at the new user's `User.id` (unique constraint on `referredUserId` guarantees at-most-one referrer per user forever).
  7. Clears cookie either way.

**Lock at first paid order.**
- In the payment webhook, when the referred user's first `subtotal ≥ ₹3,000` order flips to `paid`, in the same DB transaction: `TharaReferral.lockedAt = now()`. After this instant, the relationship is permanent — even admins can't undo it. Before this instant, admins can delete a `TharaReferral` if it's obviously fraudulent.

## 8. Fraud guards

| Guard | Where |
|---|---|
| Self-referral block | Signup hook (step 4 above) |
| Duplicate account block (email/phone match) | Signup hook (step 5) |
| Suspended-referrer no-attribution | Signup hook (step 6); also `/r/[code]` skips cookie |
| One-referrer-per-user | DB unique constraint on `TharaReferral.referredUserId` |
| Cookie unforgeability | `AUTH_SECRET`-signed cookie |
| Post-hoc attribution attempts | Not supported. No "I forgot the code, credit me" flow |
| IP / UA fingerprint | Captured on `TharaReferral`, not blocking. Powers admin queries like "refs from same IP" |

Suspicious pattern detection (e.g. "referrer X: 50 refs same day, same subnet") is an analytics query on the fields above, not a coded guard for A. Admin uses `/api/admin/thara/suspend` to act.

## 9. API surface (sub-project A only)

| Route | Method | Auth | Body / Response |
|---|---|---|---|
| `/r/[code]` | GET | Public | Sets `thara_ref` cookie; 302 → `/` |
| `/api/thara/enroll` | POST | User session | `{ termsVersion: string }` → `{ status, referralCode }` |
| `/api/thara/me` | GET | User session | `{ status, referralCode, referralUrl, enrolledAt, activatedAt?, referrerCode? }` |
| `/api/thara/opt-out` | POST | User session | `{}` → 204 |
| `/api/admin/thara/list` | GET | Admin | Paginated members with filters (status, code, email) |
| `/api/admin/thara/[id]` | GET | Admin | Full member record + attributions in/out |
| `/api/admin/thara/[id]/suspend` | POST | Admin | `{ reason: string }` → 204 |
| `/api/admin/thara/[id]/unsuspend` | POST | Admin | `{}` → 204 |

Zod validation on all bodies. Existing `withCsrf` / rate-limit wrappers (see `src/lib/*`) apply to non-admin routes.

## 10. Terms & conditions

- Stub a placeholder `docs/thara/terms/v1.md` — one page saying "This is placeholder terms for the Femi9 Thara Model. Real terms to be authored by legal."
- The `TharaMembership.termsVersion` string persists whichever version the user accepted (`"v1"` initially). Future T&C changes bump the string and force re-acceptance on next enrolment API call.
- Not blocking on legal for build; blocking on legal before rollout.

## 11. Feature flag & rollout

- `THARA_ENABLED` (env; default `false`).
- All new routes 404 when off — no schema leakage, no UI trigger.
- Ship to prod with flag off; flip on after B (personal discount) is also in prod so early enrollees have a benefit to see.
- Prisma migration ships with A regardless — additive-only, safe to migrate with the flag off.

## 12. Testing

**Unit** — under `test/` (Vitest, matching existing convention):
- Code generator: 10 000 codes → all match the format, no duplicates.
- Status transitions: only legal edges (`purchase_pending → active`, `active → suspended → active`, `active → deactivated`) accepted; illegal transitions rejected.
- Signup hook: self-referral, dup-email, dup-phone, suspended-referrer paths reject cleanly.

**Integration** — against isolated `femi9_test` DB (matching existing convention):
- Enrol twice → single membership.
- `/r/CODE` sets cookie; sign up as new user → `TharaReferral` row created.
- Order pays → `activatedAt`, `qualifyingOrderId`, and `TharaReferral.lockedAt` all set atomically.
- Suspended member's link → no cookie set.

**HTTP E2E** — extend `scripts/e2e-http.mjs`:
- Full flow: user1 enrols → gets code → user2 hits `/r/CODE` → user2 signs up → user2 orders ₹3,500 → verify user1 sees `TharaReferral.lockedAt` populated and user2 is now `active`.

**Not tested in A**: commission math (C), points accrual (D), personal discount (B), invite email delivery (E).

## 13. Observability

- Structured logs (existing pattern in `src/lib/`) for: enrol success/reject, attribution accept/reject with reason, activation, suspension, deactivation.
- Sentry breadcrumbs on all reject paths in the signup hook.
- No new dashboards in A — F builds those.

## 14. Rollback

- Prisma migration is additive; rollback = flip flag off, no schema revert needed to disable the feature.
- Full revert: drop `TharaReferral`, `TharaMembership`, and the `TharaStatus` enum. Do this only if the feature is abandoned; live members would lose their enrolment record.

## 15. Open questions for later sub-projects

Not blocking A, but flagged for when we spec B–F:

- **B**: does personal discount stack with existing `Coupon` codes at checkout? (Recommendation: pick the better of the two, no stacking.)
- **C**: refund reversal policy — if a downline user refunds after commission was earned, the referrer's Femi9 credit gets a compensating debit; can that push the balance below zero if they've already spent it? (Recommendation: allow negative balance until earned back.)
- **D**: Amazon Incentives API onboarding is business-verification-gated (~2–4 weeks). While that's in flight, admin manually issues codes via the same `VoucherIssuer` interface.
- **E**: bounces/complaints webhook from Resend needs a suppression list (`TharaSuppressedEmail`) so we don't re-email a hard-bounce.
- **F**: admin dashboard metrics — total members / active members / attributions / lock rate / suspensions.

## 16. Timeline estimate (A only)

Rough — refine when we write the plan.

| Task | Effort |
|---|---|
| Prisma migration + generator | 0.5 d |
| Referral code generator + tests | 0.5 d |
| `/r/[code]` route + cookie | 0.5 d |
| Enrolment API + status machine | 1 d |
| Signup hook + attribution + fraud guards | 1.5 d |
| Payment-webhook activation + lock | 1 d |
| Admin routes | 1 d |
| Tests (unit + integration + E2E) | 1.5 d |
| Rollout under flag | 0.5 d |

Total: **~8 developer days** for sub-project A.
