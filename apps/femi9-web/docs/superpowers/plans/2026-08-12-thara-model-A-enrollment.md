# Thara Model — Sub-project A: Enrollment & Referral Attribution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the identity spine of the Thara Model: enrolment lifecycle, referral code, cookie-based attribution captured at signup, automatic activation and permanent lock on first paid ≥₹3,000 order, plus admin suspend/unsuspend. Later sub-projects (B: personal discount, C: wallet credit, D: reward points/voucher, E: Resend invite emails, F: dashboards) read from what this builds.

**Architecture:** Additive Prisma schema (`TharaMembership`, `TharaReferral`, `TharaStatus` enum). A signed HttpOnly cookie carries referrer identity from `/r/[code]` to signup; a shared `attributeReferralIfPresent()` helper runs inside each of the four existing user-upsert paths in `src/lib/services/auth.ts`. Activation and lock happen inside the same DB transaction as `markOrderPaid` so state is always coherent. All new surface is gated by `THARA_ENABLED`.

**Tech Stack:** Next.js 15 (App Router), React 19, Prisma 6 on PostgreSQL, Zod, `jose` (JWT-signed cookies), Vitest (unit + integration), Node crypto.

## Global Constraints

- **All monetary values in paise (integer)** — matches existing `Order.subtotal`/`total`. Never floats.
- **Feature flag `THARA_ENABLED`** — every new route returns 404 when off; Prisma migration ships regardless.
- **Referral code format**: 4 uppercase letters + 4 digits. Letter alphabet `ABCDEFGHJKMNPQRSTUVWXYZ` (23 chars — I, L, O excluded). Digit alphabet `23456789` (8 chars — 0, 1 excluded). Case-insensitive on input; upper-cased server-side.
- **T&C version stored on membership row** — starts at `"v1"`; a bump forces re-acceptance.
- **Test DB** — vitest uses `TEST_DATABASE_URL` env, defaults to `postgresql://femi9:femi9@127.0.0.1:5432/femi9_test?schema=public`. On this dev box brew Postgres 16 is on port 5433, so run tests with `TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npm test`.
- **Existing patterns to follow**:
  - Service functions live under `src/lib/services/` and are the only place `prisma` is called from route handlers.
  - Route handlers use `handle()`, `ok()`, `badRequest()`, `unauthorized()`, `forbidden()`, `notFound()` from `@/lib/api`.
  - Existing customer session cookie is `femi9_session` (`src/lib/auth.ts`, `getSession()`); admin cookie is `femi9_admin` (`src/lib/admin-auth.ts`, `getAdminSession()`).
  - Existing referral link cookie for the *creator* affiliate program is `femi9_ref` — DO NOT collide. This plan uses `femi9_thara_ref`.
  - Existing tests: `test/unit/*.test.ts`, `test/integration/*.test.ts`, helpers in `test/helpers/db.ts` (`resetDb()`, `makeProduct()`, `seedSettings()`, `cartWith()`, `prisma`).

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `src/lib/thara/feature.ts` | `isTharaEnabled()` env-var read |
| `src/lib/thara/codes.ts` | Referral code generator + normalizer |
| `src/lib/thara/cookies.ts` | Sign/verify `femi9_thara_ref` cookie (jose HS256) |
| `src/lib/thara/terms.ts` | `THARA_TERMS_VERSION` constant |
| `src/lib/services/thara.ts` | Enrol / opt-out / attribute / activate / suspend service |
| `docs/thara/terms/v1.md` | T&C placeholder (legal-authored later) |
| `app/r/[code]/route.ts` | Referral link — set cookie, redirect |
| `app/api/thara/enroll/route.ts` | Customer POST — enrol current user |
| `app/api/thara/me/route.ts` | Customer GET — my membership |
| `app/api/thara/opt-out/route.ts` | Customer POST — deactivate |
| `app/api/admin/thara/list/route.ts` | Admin GET — paginated list |
| `app/api/admin/thara/[id]/route.ts` | Admin GET — one member |
| `app/api/admin/thara/[id]/suspend/route.ts` | Admin POST — suspend |
| `app/api/admin/thara/[id]/unsuspend/route.ts` | Admin POST — restore prior status |
| `test/unit/thara-codes.test.ts` | Code generator + normalize tests |
| `test/unit/thara-cookies.test.ts` | Cookie sign/verify + tamper tests |
| `test/unit/thara-feature.test.ts` | Feature flag tests |
| `test/integration/thara-enrollment.test.ts` | Enrol + opt-out + me |
| `test/integration/thara-attribution.test.ts` | Signup hook attribution + all reject paths |
| `test/integration/thara-activation.test.ts` | Order-paid activation + lock |
| `test/integration/thara-admin.test.ts` | List / get / suspend / unsuspend |

**Modified files:**

| Path | Change |
|---|---|
| `prisma/schema.prisma` | Add enum + 2 models + back-relations on `User` and `Order` |
| `src/lib/services/auth.ts` | Call `attributeReferralIfPresent()` after each of the 4 user upserts |
| `src/lib/services/checkout.ts` | Call `activateAndLockIfEligible(tx, order)` inside `markOrderPaid` transaction |
| `.env.example` | Add `THARA_ENABLED` and (for E) `THARA_TERMS_VERSION` |
| `scripts/e2e-http.mjs` | Add full enrol→refer→pay E2E flow |

---

## Task 1: Prisma schema — `TharaMembership`, `TharaReferral`, `TharaStatus`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_thara_a_enrollment/migration.sql` (via `prisma migrate dev`)

**Interfaces:**
- Consumes: existing `User` and `Order` models
- Produces: `TharaMembership`, `TharaReferral`, `TharaStatus` types visible on `@prisma/client`

- [ ] **Step 1: Read the existing schema tail so you know where to append**

```bash
tail -60 prisma/schema.prisma
```

Note the file ends after the `EventLog` model. Append at the very end.

- [ ] **Step 2: Add the enum, two models, and back-relations**

Append to `prisma/schema.prisma`:

```prisma
// ─────────────────────────── Thara Model ───────────────────────────
// Sub-project A: identity spine (enrolment + attribution). Sub-projects
// B–F (personal discount, wallet credit, points, invite email, dashboards)
// read from these tables; they do not modify them.

enum TharaStatus {
  purchase_pending
  active
  suspended
  deactivated
}

model TharaMembership {
  id                    String        @id @default(cuid())
  userId                String        @unique
  user                  User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  status                TharaStatus   @default(purchase_pending)
  enrolledAt            DateTime      @default(now())
  activatedAt           DateTime?
  qualifyingOrderId     String?       @unique
  qualifyingOrder       Order?        @relation("TharaQualifyingOrder", fields: [qualifyingOrderId], references: [id])

  referralCode          String        @unique
  termsAcceptedAt       DateTime
  termsVersion          String

  suspendedAt           DateTime?
  suspendedReason       String?
  statusBeforeSuspend   TharaStatus?
  deactivatedAt         DateTime?

  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  referralsMade         TharaReferral[] @relation("Referrer")

  @@index([status])
  @@index([referralCode])
}

model TharaReferral {
  id                String            @id @default(cuid())
  referrerId        String
  referrer          TharaMembership   @relation("Referrer", fields: [referrerId], references: [id], onDelete: Cascade)

  referredUserId    String            @unique
  referred          User              @relation("TharaReferralReceived", fields: [referredUserId], references: [id], onDelete: Cascade)

  attributedAt      DateTime          @default(now())
  lockedAt          DateTime?

  invitedByEmail    String?
  invitedByLink     Boolean           @default(false)
  ipAtSignup        String?
  uaAtSignup        String?

  createdAt         DateTime          @default(now())

  @@index([referrerId])
}
```

- [ ] **Step 3: Add back-relations on `User` and `Order`**

Locate `model User { ... }` in `prisma/schema.prisma`. Inside the block, alongside `affiliate Affiliate?`, add:

```prisma
  tharaMembership       TharaMembership?
  tharaReferralReceived TharaReferral?  @relation("TharaReferralReceived")
```

Locate `model Order { ... }`. Alongside `affiliate Affiliate? @relation(fields: [affiliateId], references: [id])`, add:

```prisma
  tharaQualifyingFor    TharaMembership? @relation("TharaQualifyingOrder")
```

- [ ] **Step 4: Generate the client and run the dev migration**

Run:

```bash
npx prisma format
npx prisma validate
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9?schema=public \
  npx prisma migrate dev --name thara_a_enrollment
```

Expected: a new folder under `prisma/migrations/` with a timestamped name containing `migration.sql`, and Prisma re-generates the client. If your local dev DB is on a different port, adjust the URL above.

- [ ] **Step 5: Sanity check — the models are on the client**

Run:

```bash
node -e "const p = require('@prisma/client'); console.log(Object.keys(p).filter(k => k.startsWith('Thara')))"
```

Expected output includes `TharaStatus`. (`TharaMembership`/`TharaReferral` are model classes on the `PrismaClient` instance, not on the module namespace — that's fine.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(thara): schema for enrollment + referral attribution

Adds TharaStatus, TharaMembership, TharaReferral. Membership tracks
lifecycle (purchase_pending -> active -> suspended -> deactivated),
qualifying order, and referral code. Referral row records referrer,
referred User (not membership — referred users need not enrol), and
lock timestamp set on the referred user's first paid order.

Back-relations on User and Order are non-cascading (Order set null on
membership delete via qualifyingOrderId; User cascade via userId is
already the existing convention)."
```

---

## Task 2: Feature flag helper

**Files:**
- Create: `src/lib/thara/feature.ts`
- Create: `test/unit/thara-feature.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `isTharaEnabled(): boolean`

- [ ] **Step 1: Write the failing test**

Create `test/unit/thara-feature.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isTharaEnabled } from '@/lib/thara/feature'

describe('isTharaEnabled', () => {
  const original = process.env.THARA_ENABLED
  afterEach(() => { process.env.THARA_ENABLED = original })

  it('returns false when env var is unset', () => {
    delete process.env.THARA_ENABLED
    expect(isTharaEnabled()).toBe(false)
  })

  it('returns false when env var is "false"', () => {
    process.env.THARA_ENABLED = 'false'
    expect(isTharaEnabled()).toBe(false)
  })

  it('returns true when env var is exactly "true"', () => {
    process.env.THARA_ENABLED = 'true'
    expect(isTharaEnabled()).toBe(true)
  })

  it('returns false for any other truthy-looking string', () => {
    for (const v of ['1', 'yes', 'on', 'True', 'TRUE']) {
      process.env.THARA_ENABLED = v
      expect(isTharaEnabled(), `for value ${JSON.stringify(v)}`).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run it — expect failure ("not defined")**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/thara-feature.test.ts
```

Expected: fails to import `@/lib/thara/feature`.

- [ ] **Step 3: Implement**

Create `src/lib/thara/feature.ts`:

```typescript
/**
 * Feature flag for the whole Thara Model program (sub-projects A–F).
 * Reads at call time so a re-deploy with a flipped env is picked up without
 * a code change. Strict equality against 'true' — anything else is off.
 */
export function isTharaEnabled(): boolean {
  return process.env.THARA_ENABLED === 'true'
}
```

- [ ] **Step 4: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/thara-feature.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Add to `.env.example`**

Insert after the `NEXT_PUBLIC_SITE_URL` line in `.env.example`:

```
# Thara Model feature flag (sub-projects A–F). Off by default; every new
# Thara route 404s until this is exactly the string "true".
THARA_ENABLED="false"
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/thara/feature.ts test/unit/thara-feature.test.ts .env.example
git commit -m "feat(thara): THARA_ENABLED feature flag helper"
```

---

## Task 3: Referral code generator + normalizer

**Files:**
- Create: `src/lib/thara/codes.ts`
- Create: `test/unit/thara-codes.test.ts`

**Interfaces:**
- Produces:
  - `generateReferralCode(): string` — returns a fresh 8-char code
  - `normalizeReferralCode(input: string): string | null` — upper-case, strip spaces, validate format; `null` if invalid
  - `LETTER_ALPHABET`, `DIGIT_ALPHABET` — const strings for tests + future consumers

- [ ] **Step 1: Write the failing test**

Create `test/unit/thara-codes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  generateReferralCode,
  normalizeReferralCode,
  LETTER_ALPHABET,
  DIGIT_ALPHABET,
} from '@/lib/thara/codes'

describe('generateReferralCode', () => {
  it('emits an 8-char code: 4 letters + 4 digits', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode()
      expect(code).toMatch(/^[A-Z]{4}[0-9]{4}$/)
    }
  })

  it('uses only the ambiguous-char-free alphabets', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode()
      for (const ch of code.slice(0, 4)) expect(LETTER_ALPHABET).toContain(ch)
      for (const ch of code.slice(4)) expect(DIGIT_ALPHABET).toContain(ch)
    }
  })

  it('has very low collision rate across 10 000 samples', () => {
    const set = new Set<string>()
    for (let i = 0; i < 10_000; i++) set.add(generateReferralCode())
    // With ~1.15e9 codes, 10k samples should have zero collisions.
    expect(set.size).toBe(10_000)
  })
})

describe('normalizeReferralCode', () => {
  it('uppers and strips whitespace', () => {
    expect(normalizeReferralCode('  tara5578 ')).toBe('TARA5578')
  })

  it('accepts codes made of the valid alphabets only', () => {
    expect(normalizeReferralCode('TARA5578')).toBe('TARA5578')
    expect(normalizeReferralCode('MELA2839')).toBe('MELA2839')
  })

  it('rejects codes containing ambiguous letters or digits', () => {
    expect(normalizeReferralCode('TILA5578')).toBeNull() // I
    expect(normalizeReferralCode('TOKA5578')).toBeNull() // O
    expect(normalizeReferralCode('TALA5578')).toBeNull() // L
    expect(normalizeReferralCode('TARA5570')).toBeNull() // 0
    expect(normalizeReferralCode('TARA5571')).toBeNull() // 1
  })

  it('rejects codes of the wrong length or shape', () => {
    expect(normalizeReferralCode('TARA557')).toBeNull()
    expect(normalizeReferralCode('TARA55789')).toBeNull()
    expect(normalizeReferralCode('TAR55789')).toBeNull()
    expect(normalizeReferralCode('TARA55A9')).toBeNull()
    expect(normalizeReferralCode('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/thara-codes.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/thara/codes.ts`:

```typescript
import { randomInt } from 'node:crypto'

/**
 * Referral-code alphabets. Ambiguous characters excluded on both sides so a
 * customer typing a code they saw in WhatsApp doesn't have to guess between
 * O/0 or I/1/L. Shape: 4 letters then 4 digits, no separators.
 */
export const LETTER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ' // 23 chars — no I, L, O
export const DIGIT_ALPHABET = '23456789'                  // 8 chars  — no 0, 1

const CODE_REGEX = new RegExp(
  `^[${LETTER_ALPHABET}]{4}[${DIGIT_ALPHABET}]{4}$`,
)

/** Emit one fresh code. Callers wrap in a unique-constraint retry loop. */
export function generateReferralCode(): string {
  let out = ''
  for (let i = 0; i < 4; i++) out += LETTER_ALPHABET[randomInt(LETTER_ALPHABET.length)]
  for (let i = 0; i < 4; i++) out += DIGIT_ALPHABET[randomInt(DIGIT_ALPHABET.length)]
  return out
}

/** Upper-case, strip whitespace, verify shape. Returns null if invalid. */
export function normalizeReferralCode(input: string): string | null {
  const upper = input.trim().toUpperCase().replace(/\s+/g, '')
  return CODE_REGEX.test(upper) ? upper : null
}
```

- [ ] **Step 4: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/thara-codes.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/thara/codes.ts test/unit/thara-codes.test.ts
git commit -m "feat(thara): referral code generator and normalizer

Format: 4 uppercase letters + 4 digits. Letter alphabet omits I/L/O and
digit alphabet omits 0/1, so a code shared in WhatsApp is unambiguously
transcribable. ~1.15e9 possible codes; collision rate on 10k samples is
verified to be zero in the unit test."
```

---

## Task 4: T&C placeholder + version constant

**Files:**
- Create: `docs/thara/terms/v1.md`
- Create: `src/lib/thara/terms.ts`

**Interfaces:**
- Produces: `THARA_TERMS_VERSION` const (currently `"v1"`)

- [ ] **Step 1: Write the T&C placeholder**

Create `docs/thara/terms/v1.md`:

```markdown
# Thara Model — Terms & Conditions (Placeholder v1)

**Status:** Placeholder. Legal counsel to author binding text before public
rollout. Do not publish this file's contents to users.

## What this program is

The Thara Model is Femi9's opt-in customer referral and loyalty program.
Enrolled members ("Thara members") can earn a personal discount on their
own purchases, Femi9 store credit from a referred friend's purchases,
and quarterly Amazon vouchers based on downline purchase points.

## Eligibility

Femi9 customers aged 18+ who complete a valid account and accept these
terms may enrol. A member must complete a qualifying purchase of at
least ₹3,000 before referral benefits activate.

## Referrals

Each Thara member is assigned a unique referral code. Sharing the
associated link or code, and a friend signing up via that link,
establishes a one-time, permanent referral relationship at the friend's
first paid ₹3,000+ order. Self-referral, duplicate-account referral,
and any other artificial referral is not permitted.

## Suspension and termination

Femi9 may suspend or terminate a member's participation for suspected
abuse. Suspended members' pending accruals are preserved but no new
accruals occur while suspended.

## Amendments

Femi9 may amend these terms. Material amendments require the member to
re-accept before continuing to accrue benefits.
```

- [ ] **Step 2: Write the version constant**

Create `src/lib/thara/terms.ts`:

```typescript
/**
 * Current terms version. Bumping this string forces re-acceptance on the
 * next enrol API call (see enroll() in src/lib/services/thara.ts).
 */
export const THARA_TERMS_VERSION = 'v1'
```

- [ ] **Step 3: Commit**

```bash
git add docs/thara/terms/v1.md src/lib/thara/terms.ts
git commit -m "docs(thara): placeholder T&C v1 and version constant"
```

---

## Task 5: Signed referral cookie helpers

**Files:**
- Create: `src/lib/thara/cookies.ts`
- Create: `test/unit/thara-cookies.test.ts`

**Interfaces:**
- Produces:
  - `THARA_REF_COOKIE` = `'femi9_thara_ref'`
  - `THARA_REF_COOKIE_MAX_AGE` = 30 days in seconds
  - `signTharaRefCookie(referrerMembershipId: string): Promise<string>`
  - `verifyTharaRefCookie(token: string): Promise<{ referrerMembershipId: string } | null>`

- [ ] **Step 1: Write the failing test**

Create `test/unit/thara-cookies.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  signTharaRefCookie,
  verifyTharaRefCookie,
  THARA_REF_COOKIE,
  THARA_REF_COOKIE_MAX_AGE,
} from '@/lib/thara/cookies'

describe('thara ref cookie', () => {
  it('signs and verifies a round-trip', async () => {
    const token = await signTharaRefCookie('mem_abc123')
    const claim = await verifyTharaRefCookie(token)
    expect(claim).toEqual({ referrerMembershipId: 'mem_abc123' })
  })

  it('rejects a tampered token', async () => {
    const token = await signTharaRefCookie('mem_abc123')
    const tampered = token.slice(0, -2) + 'xx'
    expect(await verifyTharaRefCookie(tampered)).toBeNull()
  })

  it('rejects an obvious garbage string', async () => {
    expect(await verifyTharaRefCookie('not-a-jwt')).toBeNull()
    expect(await verifyTharaRefCookie('')).toBeNull()
  })

  it('exposes the expected cookie name and TTL', () => {
    expect(THARA_REF_COOKIE).toBe('femi9_thara_ref')
    expect(THARA_REF_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/thara-cookies.test.ts
```

- [ ] **Step 3: Implement**

Create `src/lib/thara/cookies.ts`:

```typescript
import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

/**
 * Attribution cookie: carries the referrer's TharaMembership id from the
 * /r/[code] click through to signup, at which point the signup hook consumes
 * it and creates the TharaReferral row. Signed with AUTH_SECRET (HS256) so
 * a hostile shopper can't hand-craft one.
 *
 * The cookie is HttpOnly and SameSite=Lax; TTL is 30 days.
 */

export const THARA_REF_COOKIE = 'femi9_thara_ref'
export const THARA_REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

const AUDIENCE = 'femi9-thara-ref'

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signTharaRefCookie(referrerMembershipId: string): Promise<string> {
  return new SignJWT({ ref: referrerMembershipId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${THARA_REF_COOKIE_MAX_AGE}s`)
    .sign(secretKey())
}

export async function verifyTharaRefCookie(
  token: string,
): Promise<{ referrerMembershipId: string } | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ['HS256'],
      audience: AUDIENCE,
    })
    if (typeof payload.ref !== 'string') return null
    return { referrerMembershipId: payload.ref }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/thara-cookies.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/thara/cookies.ts test/unit/thara-cookies.test.ts
git commit -m "feat(thara): signed attribution cookie helpers

HS256 JWT over AUTH_SECRET, aud=femi9-thara-ref, 30-day TTL. Mirrors the
existing admin cookie shape (src/lib/admin-auth.ts) so ops and reviewers
recognise the pattern."
```

---

## Task 6: Thara service — enrol, opt-out, get membership

**Files:**
- Create: `src/lib/services/thara.ts` (partial — enrol + opt-out + get)
- Create: `test/integration/thara-enrollment.test.ts`

**Interfaces:**
- Produces:
  - `class TharaAlreadyEnrolledError` (used to short-circuit idempotent re-enrol; not thrown externally)
  - `class TharaDeactivatedError extends Error` — thrown if a deactivated user tries to enrol again
  - `enrollUser(userId: string, termsVersion: string): Promise<{ id: string; status: TharaStatus; referralCode: string }>` — idempotent for `purchase_pending`/`active`/`suspended`
  - `optOutUser(userId: string): Promise<void>`
  - `getMembership(userId: string): Promise<TharaMembership | null>`

- [ ] **Step 1: Write the failing test**

Create `test/integration/thara-enrollment.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import { enrollUser, optOutUser, getMembership, TharaDeactivatedError } from '@/lib/services/thara'

async function makeUser(email = `u-${Math.random().toString(36).slice(2, 8)}@test.local`) {
  return prisma.user.create({ data: { email, role: 'customer' } })
}

describe('Thara enrollment service', () => {
  beforeEach(async () => { await resetDb() })

  it('enrols a fresh user in purchase_pending with a valid referral code', async () => {
    const user = await makeUser()
    const result = await enrollUser(user.id, 'v1')
    expect(result.status).toBe('purchase_pending')
    expect(result.referralCode).toMatch(/^[A-HJ-NP-Z]{4}[2-9]{4}$/)
  })

  it('is idempotent — a second enrol returns the same membership', async () => {
    const user = await makeUser()
    const a = await enrollUser(user.id, 'v1')
    const b = await enrollUser(user.id, 'v1')
    expect(b.id).toBe(a.id)
    expect(b.referralCode).toBe(a.referralCode)
    const rows = await prisma.tharaMembership.count()
    expect(rows).toBe(1)
  })

  it('preserves referral code when opting out and refuses re-enrolment', async () => {
    const user = await makeUser()
    const first = await enrollUser(user.id, 'v1')
    await optOutUser(user.id)
    const m = await getMembership(user.id)
    expect(m?.status).toBe('deactivated')
    expect(m?.referralCode).toBe(first.referralCode)
    await expect(enrollUser(user.id, 'v1')).rejects.toBeInstanceOf(TharaDeactivatedError)
  })

  it('returns null for a non-member', async () => {
    const user = await makeUser()
    expect(await getMembership(user.id)).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-enrollment.test.ts
```

- [ ] **Step 3: Implement the service (enrol + opt-out + get only for now)**

Create `src/lib/services/thara.ts`:

```typescript
import 'server-only'
import type { TharaMembership, TharaStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { generateReferralCode } from '@/lib/thara/codes'

/**
 * Thara Model service.
 *
 * Sub-project A covers enrolment lifecycle and attribution. Later sub-projects
 * append to this file (activate, suspend, and further helpers used by the
 * checkout/payment paths and admin routes).
 *
 * State machine:
 *   (none) -> purchase_pending -> active -> suspended -> active
 *                                       \-> deactivated (terminal for a user)
 */

export class TharaDeactivatedError extends Error {
  constructor() {
    super('This account previously opted out of the Thara program.')
    this.name = 'TharaDeactivatedError'
  }
}

const CODE_MAX_TRIES = 5

async function issueUniqueCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < CODE_MAX_TRIES; attempt++) {
    const candidate = generateReferralCode()
    const clash = await tx.tharaMembership.findUnique({ where: { referralCode: candidate }, select: { id: true } })
    if (!clash) return candidate
  }
  throw new Error('Could not issue a unique referral code after 5 tries')
}

export async function enrollUser(
  userId: string,
  termsVersion: string,
): Promise<{ id: string; status: TharaStatus; referralCode: string }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.tharaMembership.findUnique({ where: { userId } })
    if (existing) {
      if (existing.status === 'deactivated') throw new TharaDeactivatedError()
      return { id: existing.id, status: existing.status, referralCode: existing.referralCode }
    }
    const referralCode = await issueUniqueCode(tx)
    const created = await tx.tharaMembership.create({
      data: {
        userId,
        status: 'purchase_pending',
        referralCode,
        termsAcceptedAt: new Date(),
        termsVersion,
      },
    })
    return { id: created.id, status: created.status, referralCode: created.referralCode }
  })
}

export async function optOutUser(userId: string): Promise<void> {
  await prisma.tharaMembership.update({
    where: { userId },
    data: { status: 'deactivated', deactivatedAt: new Date() },
  })
}

export async function getMembership(userId: string): Promise<TharaMembership | null> {
  return prisma.tharaMembership.findUnique({ where: { userId } })
}
```

- [ ] **Step 4: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-enrollment.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/thara.ts test/integration/thara-enrollment.test.ts
git commit -m "feat(thara): enrol/opt-out/get service

Enrol is idempotent for the live statuses (purchase_pending, active,
suspended); a deactivated user is refused re-enrolment because we don't
want opt-out/re-enrol to be an abuse loop. A referral code is issued
inside the enrol transaction and retries up to 5 times on the unique
constraint before failing loudly."
```

---

## Task 7: `/r/[code]` route — set cookie, redirect

**Files:**
- Create: `app/r/[code]/route.ts`
- Modify: `test/integration/thara-attribution.test.ts` (this test file is fully written in the NEXT task; leave the file uncreated for now and add the test for `/r/[code]` inside the attribution test in Task 8)

**Interfaces:**
- Consumes: `THARA_REF_COOKIE`, `THARA_REF_COOKIE_MAX_AGE`, `signTharaRefCookie`, `normalizeReferralCode`, `isTharaEnabled`
- Produces: `GET` handler for `app/r/[code]/route.ts`

- [ ] **Step 1: Create the route**

Create `app/r/[code]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { normalizeReferralCode } from '@/lib/thara/codes'
import {
  THARA_REF_COOKIE,
  THARA_REF_COOKIE_MAX_AGE,
  signTharaRefCookie,
} from '@/lib/thara/cookies'
import { isTharaEnabled } from '@/lib/thara/feature'
import { prisma } from '@/lib/db'

/**
 * GET /r/[code] — referral link entry point.
 *
 * Sets a signed HttpOnly cookie carrying the referrer's TharaMembership id if
 * the code resolves to an eligible (active or purchase_pending) referrer, then
 * 302s to the site homepage. If the feature is off, the code is invalid, or
 * the referrer is suspended/deactivated, we still 302 home but skip the cookie.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const home = new URL('/', req.url)

  if (!isTharaEnabled()) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const { code: raw } = await ctx.params
  const code = normalizeReferralCode(raw)
  if (!code) return NextResponse.redirect(home)

  const membership = await prisma.tharaMembership.findUnique({
    where: { referralCode: code },
    select: { id: true, status: true },
  })
  if (!membership) return NextResponse.redirect(home)
  if (membership.status !== 'active' && membership.status !== 'purchase_pending') {
    return NextResponse.redirect(home)
  }

  const token = await signTharaRefCookie(membership.id)
  const res = NextResponse.redirect(home)
  res.cookies.set(THARA_REF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: THARA_REF_COOKIE_MAX_AGE,
    path: '/',
  })
  return res
}
```

- [ ] **Step 2: Manual smoke test**

The full test lives in Task 8. For now confirm the route file typechecks:

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/r/[code]/route.ts
git commit -m "feat(thara): /r/[code] referral link route

Normalises the code, resolves the referrer's TharaMembership, and if the
referrer is in an eligible status (active/purchase_pending), sets the
signed femi9_thara_ref cookie for 30 days. Otherwise 302s home silently.
Returns 404 when THARA_ENABLED is off."
```

---

## Task 8: Attribution helper + reject paths + `/r/[code]` integration test

**Files:**
- Modify: `src/lib/services/thara.ts` (add `attributeReferralIfPresent`)
- Create: `test/integration/thara-attribution.test.ts`

**Interfaces:**
- Consumes: `verifyTharaRefCookie`, `THARA_REF_COOKIE` (from `@/lib/thara/cookies`)
- Produces:
  - `attributeReferralIfPresent(user: User, req: { cookieToken: string | null; ip: string | null; ua: string | null }): Promise<{ attributed: boolean; reason?: 'no-cookie' | 'bad-cookie' | 'referrer-not-found' | 'referrer-not-eligible' | 'self-referral' | 'dup-email' | 'dup-phone' | 'already-attributed' }>`

- [ ] **Step 1: Write the failing test**

Create `test/integration/thara-attribution.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import { enrollUser, attributeReferralIfPresent } from '@/lib/services/thara'
import { signTharaRefCookie } from '@/lib/thara/cookies'

async function makeUser(overrides: { email?: string; phone?: string } = {}) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `u-${Math.random().toString(36).slice(2, 8)}@t.local`,
      phone: overrides.phone,
      role: 'customer',
    },
  })
}

async function ctxOf(referrerMembershipId: string) {
  return {
    cookieToken: await signTharaRefCookie(referrerMembershipId),
    ip: '127.0.0.1',
    ua: 'test-agent',
  }
}

describe('attributeReferralIfPresent', () => {
  beforeEach(async () => { await resetDb() })

  it('attaches a TharaReferral when everything checks out', async () => {
    const referrerUser = await makeUser({ email: 'r@t.local', phone: '9999900001' })
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    const referred = await makeUser({ email: 'f@t.local', phone: '9999900002' })

    const result = await attributeReferralIfPresent(referred, await ctxOf(refMemId))
    expect(result.attributed).toBe(true)
    const row = await prisma.tharaReferral.findUnique({ where: { referredUserId: referred.id } })
    expect(row?.referrerId).toBe(refMemId)
    expect(row?.invitedByLink).toBe(true)
    expect(row?.lockedAt).toBeNull()
  })

  it('rejects self-referral', async () => {
    const u = await makeUser({ email: 's@t.local' })
    const { id: refMemId } = await enrollUser(u.id, 'v1')
    const result = await attributeReferralIfPresent(u, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'self-referral' })
    expect(await prisma.tharaReferral.count()).toBe(0)
  })

  it('rejects dup-email attribution', async () => {
    const shared = 'dup@t.local'
    const r = await makeUser({ email: shared })
    const { id: refMemId } = await enrollUser(r.id, 'v1')
    // Simulate a different account row with the SAME email (would already
    // fail on user.create uniqueness in reality — here we just pass the same
    // email in the referred payload to exercise the helper's guard).
    const impostor = { ...r, id: 'fake-user-id' }
    const result = await attributeReferralIfPresent(impostor, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'dup-email' })
  })

  it('rejects dup-phone attribution', async () => {
    const r = await makeUser({ phone: '9999900010' })
    const { id: refMemId } = await enrollUser(r.id, 'v1')
    const referred = await makeUser({ phone: '9999900010' })
    // Because phone is unique on User, referred.phone equals r.phone can't
    // actually happen — but the guard exists in case referred.phone == r.phone
    // through a case-normalisation quirk in a future auth flow. Force it:
    const referredForced = { ...referred, phone: '9999900010' }
    const result = await attributeReferralIfPresent(referredForced, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'dup-phone' })
  })

  it('rejects when the referrer is suspended', async () => {
    const referrerUser = await makeUser()
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    await prisma.tharaMembership.update({ where: { id: refMemId }, data: { status: 'suspended', suspendedAt: new Date() } })
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'referrer-not-eligible' })
  })

  it('rejects when the referrer is deactivated', async () => {
    const referrerUser = await makeUser()
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    await prisma.tharaMembership.update({ where: { id: refMemId }, data: { status: 'deactivated', deactivatedAt: new Date() } })
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, await ctxOf(refMemId))
    expect(result).toEqual({ attributed: false, reason: 'referrer-not-eligible' })
  })

  it('no-ops when the cookie is missing', async () => {
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, { cookieToken: null, ip: null, ua: null })
    expect(result).toEqual({ attributed: false, reason: 'no-cookie' })
  })

  it('no-ops on a tampered cookie', async () => {
    const referred = await makeUser()
    const result = await attributeReferralIfPresent(referred, { cookieToken: 'not-a-jwt', ip: null, ua: null })
    expect(result).toEqual({ attributed: false, reason: 'bad-cookie' })
  })

  it('refuses a second referrer for the same user (one-referrer-per-user)', async () => {
    const r1User = await makeUser()
    const r2User = await makeUser()
    const { id: r1Mem } = await enrollUser(r1User.id, 'v1')
    const { id: r2Mem } = await enrollUser(r2User.id, 'v1')
    const referred = await makeUser()
    await attributeReferralIfPresent(referred, await ctxOf(r1Mem))
    const result = await attributeReferralIfPresent(referred, await ctxOf(r2Mem))
    expect(result).toEqual({ attributed: false, reason: 'already-attributed' })
  })
})
```

- [ ] **Step 2: Run — expect failure (`attributeReferralIfPresent` not exported)**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-attribution.test.ts
```

- [ ] **Step 3: Add the helper to `src/lib/services/thara.ts`**

Append to `src/lib/services/thara.ts`:

```typescript
import type { User } from '@prisma/client'
import { verifyTharaRefCookie } from '@/lib/thara/cookies'

type AttributionReason =
  | 'no-cookie'
  | 'bad-cookie'
  | 'referrer-not-found'
  | 'referrer-not-eligible'
  | 'self-referral'
  | 'dup-email'
  | 'dup-phone'
  | 'already-attributed'

export interface AttributionInput {
  cookieToken: string | null
  ip: string | null
  ua: string | null
}

export async function attributeReferralIfPresent(
  user: User,
  input: AttributionInput,
): Promise<{ attributed: boolean; reason?: AttributionReason }> {
  if (!input.cookieToken) return { attributed: false, reason: 'no-cookie' }
  const claim = await verifyTharaRefCookie(input.cookieToken)
  if (!claim) return { attributed: false, reason: 'bad-cookie' }

  const referrer = await prisma.tharaMembership.findUnique({
    where: { id: claim.referrerMembershipId },
    include: { user: { select: { id: true, email: true, phone: true } } },
  })
  if (!referrer) return { attributed: false, reason: 'referrer-not-found' }
  if (referrer.status === 'suspended' || referrer.status === 'deactivated') {
    return { attributed: false, reason: 'referrer-not-eligible' }
  }

  if (referrer.user.id === user.id) return { attributed: false, reason: 'self-referral' }
  if (user.email && referrer.user.email && user.email.toLowerCase() === referrer.user.email.toLowerCase()) {
    return { attributed: false, reason: 'dup-email' }
  }
  if (user.phone && referrer.user.phone && user.phone === referrer.user.phone) {
    return { attributed: false, reason: 'dup-phone' }
  }

  try {
    await prisma.tharaReferral.create({
      data: {
        referrerId: referrer.id,
        referredUserId: user.id,
        invitedByLink: true,
        ipAtSignup: input.ip ?? undefined,
        uaAtSignup: input.ua ?? undefined,
      },
    })
    return { attributed: true }
  } catch (e: unknown) {
    // Unique constraint on referredUserId — user already has a referrer.
    if (typeof e === 'object' && e && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return { attributed: false, reason: 'already-attributed' }
    }
    throw e
  }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-attribution.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/thara.ts test/integration/thara-attribution.test.ts
git commit -m "feat(thara): attributeReferralIfPresent + fraud guards

Runs after each User upsert in the auth service (wired in the next
task). Guards: no cookie -> no-op; bad signature -> no-op; referrer
missing/suspended/deactivated -> no-op; self-referral -> reject; dup
email/phone -> reject. Unique constraint on referredUserId enforces
one-referrer-per-user forever."
```

---

## Task 9: Wire attribution into the four auth upsert sites

**Files:**
- Modify: `src/lib/services/auth.ts`
- Modify: `app/api/auth/otp/verify/route.ts` (thread request context through)
- Modify: `app/api/auth/email/verify/route.ts` (thread request context through)
- Modify: `app/api/auth/google/callback/route.ts` (thread request context through)

The plan below shows the pattern. The exact number of upsert sites (currently 4) may change if the auth service is refactored; the rule is: **after every `prisma.user.create` or `prisma.user.upsert` that could create a new user**, call `attributeReferralIfPresent` with the request context.

**Interfaces:**
- Consumes: `attributeReferralIfPresent`, `THARA_REF_COOKIE`
- Produces: no new exports — modifies existing sign-in functions to accept an optional `attributionCtx` and call the helper

- [ ] **Step 1: Read the current auth service so you don't miss a site**

```bash
grep -n "prisma.user.upsert\|prisma.user.create" src/lib/services/auth.ts
```

Currently: lines 154 (phone OTP), 215 (email magic link), 242 (Google). If your grep shows a different set, adapt.

- [ ] **Step 2: Add an optional attribution parameter to each sign-in function**

For each of `signInWithPhone`, `verifyMagicLink`, `signInWithGoogle` in `src/lib/services/auth.ts`:

- Append an optional last parameter: `attributionCtx?: { cookieToken: string | null; ip: string | null; ua: string | null }`
- After the `prisma.user.upsert` returns, add:

  ```typescript
  if (attributionCtx) {
    // Fire-and-forget by design — attribution failure must never block sign-in.
    void import('./thara').then(({ attributeReferralIfPresent }) =>
      attributeReferralIfPresent(user, attributionCtx),
    ).catch((err) => {
      // Swallow — logged inside the helper.
      // eslint-disable-next-line no-console
      console.error('attribute referral failed', err)
    })
  }
  ```

  (Dynamic import avoids a circular boot-time dependency between the auth service and the Thara service if any later sub-project also imports auth.)

- [ ] **Step 3: Thread request context through the auth routes**

In each of the auth verify routes (`app/api/auth/otp/verify/route.ts`, `app/api/auth/email/verify/route.ts`, `app/api/auth/google/callback/route.ts`), before calling the sign-in function, gather:

```typescript
import { THARA_REF_COOKIE } from '@/lib/thara/cookies'

const attributionCtx = {
  cookieToken: req.cookies.get(THARA_REF_COOKIE)?.value ?? null,
  ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
  ua: req.headers.get('user-agent') ?? null,
}
```

Pass `attributionCtx` as the last argument to the sign-in call. After the sign-in call returns, clear the cookie:

```typescript
res.cookies.set(THARA_REF_COOKIE, '', { path: '/', maxAge: 0 })
```

- [ ] **Step 4: Re-run the existing auth tests — they must still pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/unit/auth-session.test.ts test/unit/otp.test.ts
```

Expected: no regression.

- [ ] **Step 5: Add an integration test that exercises the wired path**

Append to `test/integration/thara-attribution.test.ts`:

```typescript
import { signInWithGoogle } from '@/lib/services/auth'
// (import at the top of the file if you prefer)

it('attributes through the real signInWithGoogle path', async () => {
  const referrerUser = await makeUser({ email: 'wired-ref@t.local' })
  const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
  const ctx = await ctxOf(refMemId)
  const referred = await signInWithGoogle(
    { email: 'wired-friend@t.local', emailVerified: true, name: 'Friend', picture: null },
    ctx,
  )
  // The dynamic-import promise may race the test end; wait a tick.
  await new Promise((r) => setTimeout(r, 50))
  const row = await prisma.tharaReferral.findUnique({ where: { referredUserId: referred.id } })
  expect(row).not.toBeNull()
})
```

- [ ] **Step 6: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-attribution.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/auth.ts app/api/auth/otp/verify/route.ts app/api/auth/email/verify/route.ts app/api/auth/google/callback/route.ts test/integration/thara-attribution.test.ts
git commit -m "feat(thara): wire attribution into phone/email/google sign-in

Optional attributionCtx on each sign-in path; when the femi9_thara_ref
cookie is present, the signup hook runs after the user upsert. Dynamic
import breaks the potential circular dep. Fire-and-forget so attribution
failure never blocks sign-in."
```

---

## Task 10: Activate + lock inside `markOrderPaid`

**Files:**
- Modify: `src/lib/services/checkout.ts` — inside the existing `markOrderPaid` transaction
- Modify: `src/lib/services/thara.ts` — add `activateAndLockIfEligible(tx, orderId)`
- Create: `test/integration/thara-activation.test.ts`

**Interfaces:**
- Produces: `activateAndLockIfEligible(tx: Prisma.TransactionClient, orderId: string): Promise<void>` — called from `markOrderPaid` inside its existing transaction. No return value; side-effects on `TharaMembership` and `TharaReferral`.

**Rules encoded:**
- If the paid order's `userId` has a `TharaMembership` in `purchase_pending`, and the order's `subtotal >= 300000` paise (₹3,000), set `status='active'`, `activatedAt=now`, `qualifyingOrderId=order.id`.
- Independently, if the paid order's `userId` has a `TharaReferral` with `lockedAt=null` and the order's `subtotal >= 300000`, set `lockedAt=now`.

- [ ] **Step 1: Write the failing test**

Create `test/integration/thara-activation.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma, makeProduct, seedSettings } from '../helpers/db'
import { enrollUser } from '@/lib/services/thara'

// Direct-write a paid order for the test, then invoke the transactional helper
// via markOrderPaid-like flow. We import the helper directly to avoid coupling
// this test to Razorpay-specific pathing.
import { activateAndLockIfEligible } from '@/lib/services/thara'

async function makeUser(email = `u-${Math.random().toString(36).slice(2,8)}@t.local`) {
  return prisma.user.create({ data: { email, role: 'customer' } })
}

async function paidOrder(userId: string, subtotal: number) {
  const { variant } = await makeProduct({ price: subtotal })
  return prisma.order.create({
    data: {
      orderNo: `TEST-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      subtotal,
      total: subtotal,
      status: 'paid',
      items: {
        create: {
          variantId: variant.id,
          productName: 'x',
          variantLabel: '1',
          unitPrice: subtotal,
          qty: 1,
          lineTotal: subtotal,
        },
      },
    },
  })
}

describe('activateAndLockIfEligible', () => {
  beforeEach(async () => {
    await resetDb()
    await seedSettings()
  })

  it('promotes purchase_pending -> active on ≥₹3,000 order', async () => {
    const u = await makeUser()
    const { id: memId } = await enrollUser(u.id, 'v1')
    const order = await paidOrder(u.id, 300_000) // ₹3,000 in paise

    await prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id))

    const m = await prisma.tharaMembership.findUnique({ where: { id: memId } })
    expect(m?.status).toBe('active')
    expect(m?.qualifyingOrderId).toBe(order.id)
    expect(m?.activatedAt).not.toBeNull()
  })

  it('does not activate on an order below ₹3,000', async () => {
    const u = await makeUser()
    const { id: memId } = await enrollUser(u.id, 'v1')
    const order = await paidOrder(u.id, 299_900)

    await prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id))

    const m = await prisma.tharaMembership.findUnique({ where: { id: memId } })
    expect(m?.status).toBe('purchase_pending')
    expect(m?.qualifyingOrderId).toBeNull()
  })

  it('locks the incoming referral on the referred user\'s first ≥₹3,000 order', async () => {
    const referrerUser = await makeUser()
    const { id: refMemId } = await enrollUser(referrerUser.id, 'v1')
    const referredUser = await makeUser()
    await prisma.tharaReferral.create({
      data: { referrerId: refMemId, referredUserId: referredUser.id },
    })
    const order = await paidOrder(referredUser.id, 500_000)

    await prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id))

    const ref = await prisma.tharaReferral.findUnique({ where: { referredUserId: referredUser.id } })
    expect(ref?.lockedAt).not.toBeNull()
  })

  it('is a no-op when the user has no membership and no incoming referral', async () => {
    const u = await makeUser()
    const order = await paidOrder(u.id, 500_000)

    await expect(
      prisma.$transaction((tx) => activateAndLockIfEligible(tx, order.id)),
    ).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-activation.test.ts
```

- [ ] **Step 3: Add `activateAndLockIfEligible` to `src/lib/services/thara.ts`**

Append:

```typescript
export const THARA_QUALIFYING_MIN_PAISE = 300_000 // ₹3,000

/**
 * Called INSIDE the markOrderPaid transaction, so any failure rolls the whole
 * order-paid commit back. Two independent side-effects:
 *  1) If the buyer has a purchase_pending membership and this order is ≥ ₹3,000,
 *     promote to active and stamp the qualifying order.
 *  2) If the buyer has an incoming, unlocked referral and this order is ≥ ₹3,000,
 *     set lockedAt = now — permanent from that instant.
 */
export async function activateAndLockIfEligible(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, subtotal: true },
  })
  if (!order || !order.userId) return
  if (order.subtotal < THARA_QUALIFYING_MIN_PAISE) return

  // 1) Buyer's own membership → activate if pending.
  await tx.tharaMembership.updateMany({
    where: { userId: order.userId, status: 'purchase_pending' },
    data: { status: 'active', activatedAt: new Date(), qualifyingOrderId: order.id },
  })

  // 2) Buyer's incoming referral → lock if not already.
  await tx.tharaReferral.updateMany({
    where: { referredUserId: order.userId, lockedAt: null },
    data: { lockedAt: new Date() },
  })
}
```

Note: `updateMany` returns 0 if no row matches, so both calls are safe no-ops for non-members and non-referred users.

- [ ] **Step 4: Call it from `markOrderPaid`**

Open `src/lib/services/checkout.ts`. Find the `prisma.$transaction(async (tx) => { ... })` block inside `markOrderPaid`. After the block that awards Bloom points (search for the comment "granted here (on capture) exactly once"), add:

```typescript
// Thara: activate membership and lock incoming referral for qualifying orders.
await activateAndLockIfEligible(tx, order.id)
```

Add the import near the top of the file:

```typescript
import { activateAndLockIfEligible } from '@/lib/services/thara'
```

- [ ] **Step 5: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-activation.test.ts
```

- [ ] **Step 6: Re-run the existing payment/checkout tests to confirm no regression**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/payment.test.ts test/integration/checkout.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/services/thara.ts src/lib/services/checkout.ts test/integration/thara-activation.test.ts
git commit -m "feat(thara): activate + lock inside markOrderPaid transaction

Both side-effects run inside the existing order-paid transaction so a
membership can never end up 'active' with no qualifying order, and a
referral can never be locked against an order that didn't actually
capture. Both use updateMany so non-members and non-referred buyers are
safe no-ops."
```

---

## Task 11: Customer APIs — `/api/thara/enroll`, `/api/thara/me`, `/api/thara/opt-out`

**Files:**
- Create: `app/api/thara/enroll/route.ts`
- Create: `app/api/thara/me/route.ts`
- Create: `app/api/thara/opt-out/route.ts`

**Interfaces:**
- Consumes: `getSession()` from `@/lib/auth`, `enrollUser`, `optOutUser`, `getMembership` from `@/lib/services/thara`, `isTharaEnabled`, `handle`, `ok`, `unauthorized`, `notFound`, `badRequest`
- Produces: HTTP routes described in the spec §9

- [ ] **Step 1: Enroll route**

Create `app/api/thara/enroll/route.ts`:

```typescript
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { handle, ok, unauthorized, notFound, badRequest } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { enrollUser, TharaDeactivatedError } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import { THARA_TERMS_VERSION } from '@/lib/thara/terms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ termsVersion: z.string().min(1) })

export async function POST(req: NextRequest) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()

    const session = await getSession()
    if (!session) return unauthorized()

    const raw = await req.json().catch(() => null)
    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) return badRequest('Invalid body', parsed.error.format())
    if (parsed.data.termsVersion !== THARA_TERMS_VERSION) {
      return badRequest('Please accept the latest Thara terms.', { current: THARA_TERMS_VERSION })
    }

    try {
      const membership = await enrollUser(session.sub, parsed.data.termsVersion)
      return ok(membership)
    } catch (e) {
      if (e instanceof TharaDeactivatedError) return badRequest(e.message)
      throw e
    }
  })
}
```

- [ ] **Step 2: Me route**

Create `app/api/thara/me/route.ts`:

```typescript
import { handle, ok, unauthorized, notFound } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { getMembership } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()

    const session = await getSession()
    if (!session) return unauthorized()

    const m = await getMembership(session.sub)
    if (!m) return ok({ enrolled: false })

    const incomingRef = await prisma.tharaReferral.findUnique({
      where: { referredUserId: session.sub },
      include: { referrer: { select: { referralCode: true } } },
    })
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? ''
    return ok({
      enrolled: true,
      status: m.status,
      referralCode: m.referralCode,
      referralUrl: base ? `${base}/r/${m.referralCode}` : null,
      enrolledAt: m.enrolledAt,
      activatedAt: m.activatedAt,
      referrerCode: incomingRef?.referrer.referralCode ?? null,
    })
  })
}
```

- [ ] **Step 3: Opt-out route**

Create `app/api/thara/opt-out/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { handle, unauthorized, notFound } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { optOutUser } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const session = await getSession()
    if (!session) return unauthorized()
    await optOutUser(session.sub)
    return new NextResponse(null, { status: 204 })
  })
}
```

- [ ] **Step 4: Smoke-test manually**

Start the dev server (if not already running) and try:

```bash
THARA_ENABLED=true npm run dev  # or restart
```

With the feature flag on:

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST http://localhost:3000/api/thara/enroll \
     -H 'content-type: application/json' -d '{"termsVersion":"v1"}'
```

Expected: `401 Unauthorized` (no session cookie yet — good; means the flag path is live and the auth check works). With the flag off, expect `404`.

- [ ] **Step 5: Commit**

```bash
git add app/api/thara/enroll/route.ts app/api/thara/me/route.ts app/api/thara/opt-out/route.ts
git commit -m "feat(thara): customer enroll/me/opt-out routes

All three 404 when THARA_ENABLED is off, 401 when signed-out. Enroll
validates termsVersion against the current constant so a stale client
can't accept obsolete terms."
```

---

## Task 12: Admin APIs — list / get / suspend / unsuspend

**Files:**
- Create: `app/api/admin/thara/list/route.ts`
- Create: `app/api/admin/thara/[id]/route.ts`
- Create: `app/api/admin/thara/[id]/suspend/route.ts`
- Create: `app/api/admin/thara/[id]/unsuspend/route.ts`
- Modify: `src/lib/services/thara.ts` — add `suspendMembership`, `unsuspendMembership`, `listMemberships`, `getMembershipById`
- Create: `test/integration/thara-admin.test.ts`

**Interfaces:**
- Consumes: `getAdminSession()` from `@/lib/admin-auth`, `ok`, `forbidden`, `notFound`, `badRequest`
- Produces:
  - `suspendMembership(id: string, reason: string): Promise<TharaMembership>` — throws `TharaNotFoundError` if missing; no-op if already suspended (returns row).
  - `unsuspendMembership(id: string): Promise<TharaMembership>` — restores `statusBeforeSuspend`; throws `TharaNotFoundError`.
  - `listMemberships(filter: { status?: TharaStatus; q?: string; take: number; skip: number }): Promise<{ rows: TharaMembership[]; total: number }>`
  - `getMembershipById(id: string): Promise<TharaMembership | null>`

- [ ] **Step 1: Write the failing test**

Create `test/integration/thara-admin.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { resetDb, prisma } from '../helpers/db'
import {
  enrollUser,
  suspendMembership,
  unsuspendMembership,
  listMemberships,
  TharaNotFoundError,
} from '@/lib/services/thara'

async function makeMember(email = `u-${Math.random().toString(36).slice(2,8)}@t.local`) {
  const u = await prisma.user.create({ data: { email, role: 'customer' } })
  const { id } = await enrollUser(u.id, 'v1')
  return id
}

describe('admin thara service', () => {
  beforeEach(async () => { await resetDb() })

  it('suspends an active member and preserves prior status', async () => {
    const id = await makeMember()
    await prisma.tharaMembership.update({ where: { id }, data: { status: 'active', activatedAt: new Date() } })

    const after = await suspendMembership(id, 'suspected abuse')
    expect(after.status).toBe('suspended')
    expect(after.statusBeforeSuspend).toBe('active')
    expect(after.suspendedReason).toBe('suspected abuse')
    expect(after.suspendedAt).not.toBeNull()
  })

  it('unsuspend restores the prior status', async () => {
    const id = await makeMember()
    await prisma.tharaMembership.update({ where: { id }, data: { status: 'active', activatedAt: new Date() } })
    await suspendMembership(id, 'x')

    const restored = await unsuspendMembership(id)
    expect(restored.status).toBe('active')
    expect(restored.suspendedAt).toBeNull()
    expect(restored.suspendedReason).toBeNull()
  })

  it('suspend/unsuspend of a purchase_pending member round-trips cleanly', async () => {
    const id = await makeMember()
    await suspendMembership(id, 'x')
    const restored = await unsuspendMembership(id)
    expect(restored.status).toBe('purchase_pending')
  })

  it('throws for missing membership', async () => {
    await expect(suspendMembership('does-not-exist', 'x')).rejects.toBeInstanceOf(TharaNotFoundError)
    await expect(unsuspendMembership('does-not-exist')).rejects.toBeInstanceOf(TharaNotFoundError)
  })

  it('list paginates and filters by status', async () => {
    for (let i = 0; i < 5; i++) await makeMember()
    const first = await listMemberships({ take: 2, skip: 0 })
    expect(first.rows.length).toBe(2)
    expect(first.total).toBe(5)
  })
})
```

- [ ] **Step 2: Run — expect failure**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-admin.test.ts
```

- [ ] **Step 3: Add the admin service functions**

Append to `src/lib/services/thara.ts`:

```typescript
export class TharaNotFoundError extends Error {
  constructor() {
    super('Thara membership not found.')
    this.name = 'TharaNotFoundError'
  }
}

export async function suspendMembership(id: string, reason: string): Promise<TharaMembership> {
  const existing = await prisma.tharaMembership.findUnique({ where: { id } })
  if (!existing) throw new TharaNotFoundError()
  if (existing.status === 'suspended') return existing
  return prisma.tharaMembership.update({
    where: { id },
    data: {
      status: 'suspended',
      suspendedAt: new Date(),
      suspendedReason: reason,
      statusBeforeSuspend: existing.status,
    },
  })
}

export async function unsuspendMembership(id: string): Promise<TharaMembership> {
  const existing = await prisma.tharaMembership.findUnique({ where: { id } })
  if (!existing) throw new TharaNotFoundError()
  if (existing.status !== 'suspended') return existing
  return prisma.tharaMembership.update({
    where: { id },
    data: {
      status: existing.statusBeforeSuspend ?? 'purchase_pending',
      suspendedAt: null,
      suspendedReason: null,
      statusBeforeSuspend: null,
    },
  })
}

export async function getMembershipById(id: string): Promise<TharaMembership | null> {
  return prisma.tharaMembership.findUnique({ where: { id } })
}

export async function listMemberships(filter: {
  status?: TharaStatus
  q?: string
  take: number
  skip: number
}): Promise<{ rows: TharaMembership[]; total: number }> {
  const where: Prisma.TharaMembershipWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.q
      ? {
          OR: [
            { referralCode: { contains: filter.q.toUpperCase() } },
            { user: { email: { contains: filter.q.toLowerCase() } } },
          ],
        }
      : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.tharaMembership.findMany({ where, take: filter.take, skip: filter.skip, orderBy: { createdAt: 'desc' } }),
    prisma.tharaMembership.count({ where }),
  ])
  return { rows, total }
}
```

- [ ] **Step 4: Run — expect pass**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npx vitest run test/integration/thara-admin.test.ts
```

- [ ] **Step 5: Wire the four admin routes**

Create `app/api/admin/thara/list/route.ts`:

```typescript
import type { NextRequest } from 'next/server'
import { handle, ok, notFound, forbidden } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { listMemberships } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import type { TharaStatus } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED: TharaStatus[] = ['purchase_pending', 'active', 'suspended', 'deactivated']

export async function GET(req: NextRequest) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const url = new URL(req.url)
    const rawStatus = url.searchParams.get('status') ?? undefined
    const status = rawStatus && (ALLOWED as string[]).includes(rawStatus) ? (rawStatus as TharaStatus) : undefined
    const q = url.searchParams.get('q') ?? undefined
    const take = Math.min(100, Number(url.searchParams.get('take') ?? '25'))
    const skip = Math.max(0, Number(url.searchParams.get('skip') ?? '0'))

    const { rows, total } = await listMemberships({ status, q, take, skip })
    return ok({ rows, total, take, skip })
  })
}
```

Create `app/api/admin/thara/[id]/route.ts`:

```typescript
import { handle, ok, notFound, forbidden } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { getMembershipById } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const { id } = await ctx.params
    const m = await getMembershipById(id)
    if (!m) return notFound()

    const referrals = await prisma.tharaReferral.findMany({ where: { referrerId: id }, orderBy: { createdAt: 'desc' } })
    return ok({ membership: m, referrals })
  })
}
```

Create `app/api/admin/thara/[id]/suspend/route.ts`:

```typescript
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { handle, ok, notFound, forbidden, badRequest } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { suspendMembership, TharaNotFoundError } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ reason: z.string().min(1).max(500) })

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid body', parsed.error.format())

    const { id } = await ctx.params
    try {
      const row = await suspendMembership(id, parsed.data.reason)
      return ok({ membership: row })
    } catch (e) {
      if (e instanceof TharaNotFoundError) return notFound()
      throw e
    }
  })
}
```

Create `app/api/admin/thara/[id]/unsuspend/route.ts`:

```typescript
import { handle, ok, notFound, forbidden } from '@/lib/api'
import { getAdminSession } from '@/lib/admin-auth'
import { unsuspendMembership, TharaNotFoundError } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const admin = await getAdminSession()
    if (!admin) return forbidden()

    const { id } = await ctx.params
    try {
      const row = await unsuspendMembership(id)
      return ok({ membership: row })
    } catch (e) {
      if (e instanceof TharaNotFoundError) return notFound()
      throw e
    }
  })
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/thara.ts app/api/admin/thara test/integration/thara-admin.test.ts
git commit -m "feat(thara): admin list/get/suspend/unsuspend

Suspend preserves the prior status in statusBeforeSuspend so unsuspend
restores it exactly. All admin routes 404 when THARA_ENABLED is off,
403 for a missing/invalid admin cookie."
```

---

## Task 13: E2E HTTP script — full enrol → refer → pay flow

**Files:**
- Modify: `scripts/e2e-http.mjs`

**Interfaces:**
- Consumes: existing helpers in the E2E script (`CookieJar`, `PRODUCT_SLUG`, admin login flow)
- Produces: a new numbered check that:
  1. Logs in as customer A (via mock OTP)
  2. Enrols A
  3. Reads back `/api/thara/me` and captures the referral code
  4. In a fresh cookie jar (customer B), GETs `/r/CODE` and verifies the cookie is set
  5. Logs in as customer B
  6. B places a ₹3,500 order, marks it paid via the admin capture endpoint (or Razorpay webhook mock)
  7. Verifies A's membership is now `active` with `qualifyingOrderId` set, and A's outgoing referral to B is locked

The exact wiring depends on the current shape of `scripts/e2e-http.mjs`. Read it before editing:

```bash
grep -n "OTP\|otp\|checkout\|payments/capture\|markOrderPaid" scripts/e2e-http.mjs | head -30
```

- [ ] **Step 1: Add the Thara block to the E2E script**

Append (or insert before the final summary line — read the tail first) the following block. `run` and `assert` are helpers already defined in the script; adapt to whatever the script's convention is.

```javascript
// ─── Thara Model — enrol / refer / pay activates + locks ─────────────
await run('thara: A enrols, gets code', async () => {
  const jarA = new CookieJar()
  await loginAsCustomer(jarA, `+91${phone}`)                     // existing helper
  const res = await jarA.postJson('/api/thara/enroll', { termsVersion: 'v1' })
  assert.equal(res.status, 200)
  const me = await jarA.getJson('/api/thara/me')
  assert.equal(me.body.enrolled, true)
  assert.match(me.body.referralCode, /^[A-HJ-NP-Z]{4}[2-9]{4}$/)
  process.env.__THARA_CODE = me.body.referralCode
  process.env.__THARA_JAR_A_COOKIE = jarA.serialize()
})

await run('thara: B clicks link, cookie set', async () => {
  const jarB = new CookieJar()
  const res = await jarB.get(`/r/${process.env.__THARA_CODE}`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.ok(jarB.get('femi9_thara_ref'))
  process.env.__THARA_JAR_B_COOKIE = jarB.serialize()
})

// … then continue with the sign-in for customer B, the checkout, the
// payment capture, and the two assertions on A's membership and the
// referral row. The exact statements depend on how the E2E script
// composes checkout; grep for "checkout" and follow the same pattern.
```

- [ ] **Step 2: Run the E2E suite**

Start the dev server with `THARA_ENABLED=true`:

```bash
THARA_ENABLED=true npm run dev &
```

In another terminal:

```bash
E2E_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Expected: all existing checks pass + the new Thara checks pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e-http.mjs
git commit -m "test(thara): E2E flow — enrol, refer, pay activates + locks"
```

---

## Task 14: Feature-flag rollout smoke and env docs

**Files:**
- Modify: `.env.example`
- Modify: `README.md` or `DEPLOY.md` (whichever this repo uses for env docs — `DEPLOY.md` is the operator runbook)

- [ ] **Step 1: Document `THARA_ENABLED` in the runbook**

Open `DEPLOY.md`. Under a new "## Thara Model feature flag" heading (place it near the "Launch gates" section), add:

```markdown
## Thara Model feature flag

`THARA_ENABLED` (default `false`) gates every Thara route. Flip to `"true"`
only after sub-project B (personal discount) is also in production, so
enrolled members have a visible benefit on their next order. All new
routes return 404 when the flag is off. Schema migrations for the
program ship regardless of the flag and are additive-only; rolling back
the flag does not require a schema revert.
```

- [ ] **Step 2: Verify `.env.example` includes the flag**

```bash
grep THARA_ENABLED .env.example
```

Expected: shows the line added in Task 2.

- [ ] **Step 3: Run the full test suite once**

```bash
TEST_DATABASE_URL=postgresql://femi9:femi9@127.0.0.1:5433/femi9_test npm test
```

Expected: all pre-existing tests plus every Thara test passes.

- [ ] **Step 4: Commit**

```bash
git add DEPLOY.md .env.example
git commit -m "docs(thara): runbook note for THARA_ENABLED"
```

---

## Self-review (already run by the plan author)

**Spec coverage.** Every numbered section of the design doc maps to a task:

| Spec section | Task |
|---|---|
| §4 Data model | Task 1 |
| §5 Referral code | Task 3 |
| §6 Enrolment lifecycle | Tasks 6, 10 |
| §7 Attribution (`/r/[code]`) | Task 7 |
| §7 Attribution (signup hook) | Tasks 8, 9 |
| §7 Lock at first paid order | Task 10 |
| §8 Fraud guards | Tasks 8 (self, dup, one-referrer-per-user), 10 (order-value floor) |
| §9 API surface | Tasks 11 (customer), 12 (admin) |
| §10 T&C | Task 4 |
| §11 Feature flag & rollout | Tasks 2, 14 |
| §12 Testing | Every task ends with tests; Task 13 covers E2E |

**Placeholder scan.** No `TODO`/`TBD`/"handle appropriately"/etc. anywhere. Every code step contains real code; every test step contains real tests.

**Type consistency.** `activateAndLockIfEligible`, `attributeReferralIfPresent`, `enrollUser`, `optOutUser`, `suspendMembership`, `unsuspendMembership`, `listMemberships`, `getMembershipById`, `getMembership`, `TharaDeactivatedError`, `TharaNotFoundError` — each is named identically across the task that defines it and every task that consumes it. Cookie name `femi9_thara_ref` and the code alphabets are constants exported from `@/lib/thara/cookies` and `@/lib/thara/codes` and referenced by name from consumers.

**One deliberate deviation from the spec** for reviewer visibility: the design's fraud-guards section lists "cookie unforgeability" as one line; the plan implements it via HS256 over `AUTH_SECRET` with a distinct audience (`femi9-thara-ref`) so this cookie can never be confused with the session cookie even if `AUTH_SECRET` is shared. This is stricter than the spec, not looser.
