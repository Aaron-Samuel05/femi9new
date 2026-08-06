# Phase 1 — Auth & Accounts — Implementation Spec

> Companion to `Femi9-Backend-Tasks.md` (Phase 1) and `prisma/schema.prisma`.
> **Goal:** real users replace the hardcoded "Aishwarya Menon"; `/admin`, `/account`, `/dashboard`
> are actually protected; each user sees only their own data.
> **Stack (fixed):** Next.js 14 App Router · AWS ECS Fargate · Aurora Serverless v2 Postgres · Prisma 6 ·
> Auth.js (NextAuth v5) · Razorpay (P2) · custom admin.
> **Depends on:** Phase 0 (done) — schema migrated, seed run, Prisma client + service pattern established.

---

## 0. Architecture decisions (read before writing code)

These choices are load-bearing; the whole phase assumes them.

### 0.1 Session strategy = **JWT**, adapter still attached

Auth.js v5 forces a constraint the schema does not make obvious:

- The **Credentials provider (our phone OTP) is incompatible with database sessions.** Auth.js only
  writes `Session` rows for the Email/OAuth flows; a Credentials sign-in *always* yields a JWT session.
- The **Email/Resend magic-link provider works under either strategy** but requires the adapter (it stores
  its one-time token in `VerificationToken` and creates/links the `User`).

Therefore Phase 1 runs `session.strategy = "jwt"` with the **Prisma adapter attached**. Consequence for the
schema models the task calls out:

| Model | Written in Phase 1? | By what |
|-------|--------------------|---------|
| `User` | **Yes** | adapter `createUser` on first magic-link verify; our `upsert` on first OTP verify |
| `VerificationToken` | **Yes** | Resend provider (identifier = email) **and** our OTP request route (identifier = phone) |
| `Account` | No (reserved) | only written by OAuth providers; kept for future social login |
| `Session` | No (reserved) | not written under JWT strategy; kept for adapter type-completeness + future switch to DB sessions |

`role` and `id` are carried on the JWT via the `jwt`/`session` callbacks, so middleware can authorize from
the token alone (no DB hit on the edge). **Do not** delete the `Account`/`Session` models — `PrismaAdapter`
references them at the type level and they are the migration path to DB sessions later. This tradeoff is
final for Phase 1; if DB sessions are ever required, OTP must move to a manual session-minting route (out of
scope here).

### 0.2 Split config (edge-safe middleware)

`PrismaAdapter` and the Resend/MSG91 SDKs cannot run in the Edge runtime that Next middleware uses. Use the
canonical Auth.js v5 **split-config** pattern:

- `src/auth.config.ts` — edge-safe: `providers: []` placeholder + `callbacks.authorized` + `session.strategy`.
  No adapter, no Node-only imports. Imported by `middleware.ts`.
- `src/auth.ts` — imports the config, adds `PrismaAdapter(prisma)` and the real providers, exports
  `{ handlers, auth, signIn, signOut }`. Node runtime only.

### 0.3 ECS / Aurora specifics

- Set `trustHost: true` in the Auth.js config (or `AUTH_TRUST_HOST=true`) — required behind the ALB where the
  host header is proxied and there is no Vercel auto-detection.
- Set `AUTH_URL` to the public HTTPS origin so magic-link callback URLs are correct.
- `AUTH_SECRET` must be a stable secret in the ECS task definition (not regenerated per deploy, or existing
  sessions/JWTs invalidate).
- Middleware only needs `AUTH_SECRET` to decode the JWT — no DB connection on the edge.

### 0.4 Founder-action blockers (🔒)

| # | Item | Blocks task | Build-around |
|---|------|-------------|--------------|
| 3 | SMS/OTP provider (MSG91) | 1.1c real OTP delivery | Dev: log the OTP to server console + return nothing; wire MSG91 when key lands. |
| 4 | Transactional email (Resend) | 1.1b magic-link delivery | Dev: use the Nodemailer provider against a local SMTP catcher (Mailpit) or Resend test key. |
| 6 | Redis (Upstash) | 1.2a rate-limiting | Dev: in-memory limiter fallback keyed off `process` (documented below); production requires Upstash. |
| 8 | Admin seed users (emails/phones) | promoting real staff | `admin@femi9.in` already seeded; add real staff emails to the seed once provided. |

All of Phase 1 is **buildable and testable on test/dev providers**; only real SMS/email delivery is gated.

### 0.5 New dependencies

```
npm i next-auth@beta @auth/prisma-adapter @upstash/ratelimit @upstash/redis
npm i -D vitest @vitest/coverage-v8   # for the ownership acceptance test
```

`next-auth@beta` is the v5 line and is compatible with Next 14.2.x. Resend has a first-class Auth.js provider
(`next-auth/providers/resend`), matching founder-item #4.

### 0.6 Env vars to add (`.env`, `.env.example`, ECS task def)

```
AUTH_SECRET="<openssl rand -base64 33>"     # already stubbed in .env.example
AUTH_URL="http://localhost:3000"            # prod: https://<domain>
AUTH_TRUST_HOST="true"
AUTH_RESEND_KEY=""                          # = RESEND_API_KEY; Auth.js reads AUTH_RESEND_KEY
EMAIL_FROM="Femi9 <login@femi9.in>"
MSG91_AUTH_KEY=""                           # already stubbed
MSG91_SENDER_ID="FEMI9"
MSG91_OTP_TEMPLATE_ID=""
UPSTASH_REDIS_REST_URL=""                   # already stubbed
UPSTASH_REDIS_REST_TOKEN=""                 # already stubbed
```

### 0.7 Schema additions

**None are strictly required** — `User` already carries `role`, `phone @unique`, `email @unique`,
`emailVerified`; `Account`, `Session`, `VerificationToken`, `Address`, `PointsLedger` all exist.

Two **optional** additions to consider (call-outs, not blockers):

1. `User.phoneVerified DateTime?` — for parity with `emailVerified` and an audit trail of OTP verification.
   Without it, "phone is verified" is implicit (a user with a `phone` set + an OTP `Account`-less sign-in).
   Recommend adding it; it is a non-breaking nullable column.
2. Nothing else. OTP codes are stored in the existing `VerificationToken` table (no dedicated table needed).

If (1) is adopted: `npx prisma migrate dev --name add_phone_verified`, then set it in the OTP `authorize`.

---

## Epic 1.1 — Authentication

### Task 1.1a — Auth.js core wiring (adapter, config split, route handler)

**Files to create**

- `src/auth.config.ts` — edge-safe base config:
  - `session: { strategy: "jwt" }`, `trustHost: true`, `pages: { signIn: "/login" }`.
  - `providers: []` (real providers are added in `auth.ts`; the array is required by the type).
  - `callbacks.authorized({ auth, request })` — used by middleware (Task 1.2b); returns boolean/redirect.
  - `callbacks.jwt` and `callbacks.session` — see below.
- `src/auth.ts`:
  ```ts
  import NextAuth from "next-auth"
  import { PrismaAdapter } from "@auth/prisma-adapter"
  import { prisma } from "@/lib/db"
  import authConfig from "@/auth.config"
  import Resend from "next-auth/providers/resend"          // Task 1.1b
  import Credentials from "next-auth/providers/credentials" // Task 1.1c
  export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: PrismaAdapter(prisma),
    providers: [ /* Resend(...), Credentials(...) — added in 1.1b/1.1c */ ],
  })
  ```
- `app/api/auth/[...nextauth]/route.ts`:
  ```ts
  import { handlers } from "@/auth"
  export const { GET, POST } = handlers
  export const runtime = "nodejs"   // adapter needs Node runtime
  ```

**Callbacks (in `auth.config.ts`)**

- `jwt({ token, user })`: on first sign-in (`user` present) copy `user.id`→`token.id`, `user.role`→`token.role`.
  On subsequent calls the token already carries them. (Because Credentials `authorize` and the adapter both
  return a `User` with `role`, this works for both flows.)
- `session({ session, token })`: set `session.user.id = token.id`, `session.user.role = token.role`.

**Type augmentation** — create `src/types/next-auth.d.ts` extending `Session["user"]` and `JWT` with
`id: string` and `role: Role` (import `Role` from `@prisma/client`).

**Data touched:** none at this task (plumbing). Reads `User.role` indirectly via provider return values.

**Edge cases**
- Do **not** import `@/auth.ts` (adapter) into `middleware.ts` — only `@/auth.config.ts`. Importing the adapter
  into middleware breaks the edge build.
- `runtime = "nodejs"` on the `[...nextauth]` route is mandatory (Prisma).

**Acceptance check:** `curl -s localhost:3000/api/auth/providers` returns JSON listing `resend` and
`credentials` once 1.1b/1.1c are added; `curl -s localhost:3000/api/auth/session` returns `{}` when logged out
(200, empty) and a `{ user: { id, role, ... } }` object when a valid session cookie is presented.

**Depends on:** Phase 0 (`@/lib/db`). **Blocks:** every other Phase 1 task.

---

### Task 1.1b — Email magic-link (Resend provider) 🔒#4

**Files**

- Edit `src/auth.ts` — add to `providers`:
  ```ts
  Resend({ from: process.env.EMAIL_FROM, apiKey: process.env.AUTH_RESEND_KEY })
  ```
- Create `app/login/page.tsx` (server component shell) + `src/screens/Login.tsx` (`'use client'`) — two-panel
  form (email panel here, phone panel in 1.1c). Email panel calls the server action / `signIn("resend", { email, redirectTo })`.
- Create `app/login/actions.ts` (`'use server'`) exporting `sendMagicLink(formData)` → `await signIn("resend", { email, redirectTo: next })`.
- Create `app/verify-request/page.tsx` — "check your inbox" interstitial (Auth.js default `verifyRequest` page target).
- Edit `src/auth.config.ts` `pages`: `{ signIn: "/login", verifyRequest: "/verify-request", error: "/login" }`.

**Data touched**
- `VerificationToken` — Auth.js writes `{ identifier: email, token, expires }` on request, deletes on use.
- `User` — adapter `createUser` (first login) sets `email`, `emailVerified`; sets `role` default `customer`.

**Edge cases**
- Email that already exists as a seeded user (e.g. `admin@femi9.in`, `demoUser.email`): magic-link must **link
  to the existing user**, not create a duplicate — the adapter does this by `email @unique`. Verify the demo
  admin can log in via link and retains `role = admin`.
- Normalize email to lowercase before `signIn` to avoid case-variant duplicates.
- Link expiry: Auth.js default 24h; single-use enforced by the adapter deleting the token.
- Resend not configured (dev): swap `Resend(...)` for `Nodemailer({ server, from })` pointed at Mailpit, or set
  a `sendVerificationRequest` that `console.log`s the URL. Gate on `process.env.AUTH_RESEND_KEY`.

**Acceptance check:** submit an email on `/login` → row appears in `VerificationToken`; open the link (or the
logged URL) → redirected to `next` (default `/dashboard`), `/api/auth/session` now returns the user,
`User.emailVerified` is set. Logging in with `admin@femi9.in` lands a session whose `role` is `admin`.

**Depends on:** 1.1a. **Founder blocker:** Resend key (dev works via Nodemailer/console).

---

### Task 1.1c — Phone OTP (request route + Credentials provider) 🔒#3

Two-step: (1) request an OTP → stored hashed in `VerificationToken`, SMS sent; (2) `signIn("otp", …)` verifies
via the Credentials `authorize`.

**Files**

- `src/lib/otp.ts` — `generateCode()` (6-digit crypto-random), `hashOtp(phone, code)` = HMAC-SHA256 over
  `` `${phone}:${code}` `` keyed by `AUTH_SECRET` (so the `token` column is unique per phone+code and the raw
  code is never stored), `normalizePhone(input)` → `+91XXXXXXXXXX` E.164.
- `src/lib/sms.ts` — `sendOtpSms(phone, code)` calling MSG91 (`MSG91_AUTH_KEY`, `MSG91_SENDER_ID`,
  `MSG91_OTP_TEMPLATE_ID`); in dev (no key) `console.info("[otp]", phone, code)` and return.
- `app/api/auth/otp/request/route.ts` (`runtime = "nodejs"`):
  - `POST { phone }`. Validate with Zod (`z.string().regex(E164)` after `normalizePhone`).
  - **Rate-limit** (Task 1.2a) — reject with 429 if exceeded.
  - `code = generateCode()`, `token = hashOtp(phone, code)`, `expires = now + 5min`.
  - `await prisma.verificationToken.deleteMany({ where: { identifier: phone } })` (invalidate prior codes),
    then `create({ identifier: phone, token, expires })`.
  - `await sendOtpSms(phone, code)`; return `{ ok: true }` (never return the code in prod).
- Edit `src/auth.ts` — add Credentials provider:
  ```ts
  Credentials({
    id: "otp",
    credentials: { phone: {}, code: {} },
    async authorize(creds) {
      const phone = normalizePhone(String(creds.phone))
      const token = hashOtp(phone, String(creds.code))
      const vt = await prisma.verificationToken.findUnique({ where: { token } })
      if (!vt || vt.identifier !== phone || vt.expires < new Date()) return null
      await prisma.verificationToken.delete({ where: { token } })   // single-use
      const user = await prisma.user.upsert({
        where: { phone },
        update: { /* phoneVerified: new Date() if column added */ },
        create: { phone, role: "customer" },
      })
      return user   // carries id + role → jwt callback
    },
  })
  ```
- Edit `src/screens/Login.tsx` — phone panel: enter phone → `POST /api/auth/otp/request` → show code input →
  `signIn("otp", { phone, code, redirectTo: next })`.

**Data touched**
- `VerificationToken` — write on request, delete on verify (single-use) and on re-request (invalidate old).
- `User` — `upsert` by `phone @unique`; sets `role` default `customer` on create; optional `phoneVerified`.

**Edge cases**
- **Phone already tied to a seeded/existing user** (e.g. `demoUser.phone`): `upsert` by unique phone links to the
  existing row — no duplicate, role preserved.
- **Same phone requests twice quickly:** old token deleted so only the latest code is valid.
- **Wrong/expired code:** `authorize` returns `null` → Auth.js surfaces `CredentialsSignin`; the form shows
  "Invalid or expired code." Do not leak whether the phone exists.
- **Code reuse after success:** token deleted on verify → replay fails.
- **Credentials provider requires JWT strategy** — already set (0.1). Do not switch this provider to DB sessions.
- Clock skew / `expires`: compare against `new Date()` server-side only.

**Acceptance check:** `POST /api/auth/otp/request {phone:"+919884230571"}` → 200, one `VerificationToken` row,
code appears in server log (dev). `signIn("otp", {phone, code})` with the logged code → session created,
`User` row present with that phone. A second `signIn` with the same code → rejected. Requesting for the demo
customer's phone links to the existing user (points/orders still visible).

**Depends on:** 1.1a, 1.2a (rate-limit). **Founder blocker:** MSG91 (dev works via console log).

---

### Task 1.1d — Session provider, Nav login state, sign-out

**Files**

- Edit `app/providers.tsx` — wrap the tree in `<SessionProvider>` from `next-auth/react` (client). This lets
  the storefront `Nav` reflect auth state.
- Edit `src/components/Nav.tsx` — the `IUser` link currently hard-points to `/dashboard`. Change to:
  `useSession()` → if authenticated link to `/account`, else `/login`. Add a "Log out" item to the mobile menu
  calling `signOut({ redirectTo: "/" })` when authenticated.
- Add a sign-out control in `src/app/Shell.tsx` footer (both `user` and `admin` variants) → `signOut`.
- Create `app/logout/route.ts` **or** use the client `signOut` — prefer client `signOut` to avoid CSRF plumbing.

**Data touched:** none (reads session).

**Edge cases**
- `SessionProvider` adds a `/api/auth/session` fetch on the storefront — keep it lightweight; the storefront is
  otherwise static/SSG, so ensure the Nav stays a client component (it already is) and does not force the whole
  homepage dynamic. Do **not** call `auth()` in the storefront root layout.
- Avatar/initials in Nav should fall back gracefully when `name` is null (OTP-only users have no name yet).

**Acceptance check:** logged out → Nav account icon routes to `/login`; logged in → routes to `/account`, and a
"Log out" action clears the session (`/api/auth/session` → `{}`).

**Depends on:** 1.1a–1.1c.

---

## Epic 1.2 — Roles & guards

### Task 1.2a — OTP rate-limiting + single-use short expiry (Upstash) 🔒#6

**Files**

- `src/lib/ratelimit.ts`:
  - Upstash client from `UPSTASH_REDIS_REST_URL/TOKEN`.
  - `otpRequestLimiter` — two sliding windows enforced together: **per phone** `5/hour` and a burst `1/30s`;
    **per IP** `20/hour` (blunt anti-abuse).
  - Export `limitOtpRequest(phone, ip)` → `{ success, retryAfter }`.
  - **Dev fallback** when Upstash env is absent: an in-process `Map` limiter with the same interface (documented
    as non-durable, single-instance only — must not ship to multi-task ECS without Upstash).
- Edit `app/api/auth/otp/request/route.ts` — call `limitOtpRequest` before generating a code; on failure return
  `429` with `Retry-After`.

**Data touched:** Redis only (no Postgres). Single-use + 5-min expiry are enforced in `VerificationToken` by
1.1c (delete-on-verify, delete-on-reissue, `expires` check).

**Edge cases**
- Read client IP from the ALB via `x-forwarded-for` (first hop); ECS sits behind an ALB so `request.ip` is not
  reliable.
- Limiter must **fail closed** on the phone key (deny) but may fail open only in dev; in prod a Redis outage
  should surface a 503, not silently disable throttling.
- Windows are per normalized E.164 phone, so `9884…` and `+919884…` collapse to one bucket.

**Acceptance check:** call `POST /api/auth/otp/request` for one phone in a loop — the 2nd within 30s and the 6th
within the hour return `429`. With Upstash configured, the limit persists across two `next dev` instances /
two ECS tasks (Redis-backed), proving it is not per-process.

**Depends on:** 1.1c. **Founder blocker:** Upstash (dev fallback available).

---

### Task 1.2b — Role-based route-group middleware

**Files**

- `middleware.ts` (project root, sibling of `app/`):
  ```ts
  import NextAuth from "next-auth"
  import authConfig from "@/auth.config"
  export const { auth: middleware } = NextAuth(authConfig)   // edge-safe: no adapter
  export default middleware((req) => { /* logic below */ })
  export const config = {
    matcher: ["/admin/:path*", "/account/:path*", "/dashboard/:path*"],
  }
  ```
- Implement the guard either inside `callbacks.authorized` (in `auth.config.ts`) or in the middleware callback.
  Recommended: put the rules in `authorized({ auth, request })` so the same logic protects Server Actions:

  | Path prefix | Rule | Anon → | Authed-but-forbidden → |
  |-------------|------|--------|------------------------|
  | `/admin` | `role ∈ {staff, admin}` | `/login?next=<path>` | `/dashboard` (or a `/403` page) |
  | `/account` | authenticated | `/login?next=<path>` | — |
  | `/dashboard` | authenticated | `/login?next=<path>` | — |

  `auth.user.role` is available on the token (from the `session` callback), so no DB call on the edge.

**Data touched:** none (JWT only).

**Edge cases**
- Preserve the intended destination: redirect to `/login?next=<original path+query>`; the login server actions
  read `next` and pass it as `redirectTo`. Sanitize `next` (must start with `/`, no protocol) to prevent open
  redirect.
- Matcher must **exclude** `/api/auth/*`, static assets, and `_next` (the matcher above already only lists the
  three protected prefixes, so this is inherent — do not broaden it).
- `/admin` for a logged-in `customer` must **not** leak the admin shell — redirect before render; also enforce
  again in the page (defense in depth, Task 1.2c) since middleware can be bypassed by direct RSC payload fetches
  in edge cases.
- Hash-only nav (`/dashboard#cycle`) stays same-path — no redirect churn.

**Acceptance check:** as anon, GET `/admin`, `/account`, `/dashboard` each 302 → `/login?next=…`. As a
`customer`, `/admin` 302 → `/dashboard`; `/account` and `/dashboard` render. As `admin` (log in via
`admin@femi9.in`), all three render. Verify via `curl -I` following redirects with/without a session cookie.

**Depends on:** 1.1a (config), 1.1b/1.1c (a way to obtain a session). **Blocks:** 1.3 pages rely on it.

---

### Task 1.2c — Session helpers + ownership checks

**Files**

- `src/lib/session.ts` (`import 'server-only'`):
  - `getSessionUser()` → `auth()` then `session?.user ?? null`.
  - `requireUser()` → returns the user or `redirect("/login")` (for pages) / throws `Unauthorized` (for routes).
  - `requireRole(...roles)` → asserts `role ∈ roles` else `forbidden()`.
  - `assertOwner(resourceUserId)` → throws `forbidden()` unless `resourceUserId === session.user.id`
    (staff/admin bypass optional — **default: no bypass** for `/account` data; admins use `/admin` services).
- Add matching 401/403 helpers already exist in `src/lib/api.ts` (`unauthorized`, `forbidden`) — reuse them.

**Rule for every per-user read/write (services in Epic 1.3 and all later phases):** never accept a `userId`
from the client. Derive it from `getSessionUser().id`. Any handler that loads a resource by id
(`Address`, `Order`, `Subscription`, `PeriodLog`, `SymptomLog`, `PointsLedger`) must either filter by
`userId: session.user.id` in the `where`, or load then `assertOwner(row.userId)`.

**Data touched:** reads `User` via session; enforced against `userId` FKs on owned tables.

**Edge cases**
- `SetNull` FKs (`Order.userId`, `WallPost.userId`) can be null (guest orders) — ownership check must treat
  `null !== session.id` as forbidden, not "match".
- Admin-context reads (Phase 3) will use a *separate* set of services that pass `requireRole('staff','admin')`
  and are **not** filtered by the caller's own id — keep those out of the `/account` service to avoid confusion.

**Acceptance check:** covered by Task 1.2d's automated test.

**Depends on:** 1.1a.

---

### Task 1.2d — Ownership acceptance test

**Files**

- `vitest.config.ts` (root) + `src/lib/services/__tests__/ownership.test.ts`.
- Test uses a test DB (or the dev DB with two seeded users). Seed a second customer:
  `userB` alongside the existing demo customer `userA`.

**Test cases**
1. `getAddresses(userA.id)` returns only A's addresses; none of B's.
2. `updateAddress(userA.id, addressOfB.id, …)` → throws `forbidden` (does not mutate B's row).
3. `getAccountData(userB.id)` never includes A's orders/points.
4. `deleteAddress(userA.id, addressOfB.id)` → `forbidden`, B's address still present.
5. A request to `PATCH /api/account/addresses/[B's id]` with A's session cookie → HTTP 403.

**Acceptance check (Epic 1.2 exit ✓):** `npx vitest run` green; case 5 additionally verified end-to-end via a
Playwright/`curl` script with two real session cookies. "A user cannot read another user's orders/cycle data."

**Depends on:** 1.2c, 1.3a/1.3e (the services under test).

---

## Epic 1.3 — Account pages on real data

Replace `import { user } from '@/data/account'` (and `addresses`, `orders`, `subscription`, `spendTrend`) in the
four files that use it: `src/app/Shell.tsx`, `src/screens/Account.tsx`, `src/screens/UserDashboard.tsx`,
`src/components/Rewards.tsx`. The pattern: **page becomes a server component** that reads the session + loads
data via a service, and passes it as props to the (now explicitly `'use client'`) screen.

### Task 1.3a — Account service + cut over `/account`

**Files to create**

- `src/lib/services/account.ts` (`import 'server-only'`):
  - `getAccountData(userId)` → one payload for the Account page:
    - `profile`: `{ id, name, email, phone, tier, role, since: createdAt }` from `User`.
    - `addresses`: `Address[]` where `userId`, ordered `isPrimary desc, id`.
    - `orders`: `Order[]` where `userId`, `include: { items: true }`, `orderBy: placedAt desc` — map to the
      screen's `{ id: orderNo, date: placedAt, items:[{name: productName, qty}], total, status }` shape.
    - `subscription`: first `Subscription` where `userId, status: active`, `include: { variant: { product }, cadence }`
      → `{ product, qty, frequency: cadence.label, nextDelivery: nextDeliveryAt, saved: savedTotal }` or `null`.
    - `points`: balance from `getPointsSummary` (Task 1.3c).
    - `spendTrend`: last 6 calendar months of `Order.total` where `status ∈ {paid,…,delivered}`, grouped by
      month → `{ labels, values }` (raw SQL `date_trunc` or in-memory bucketing).
  - `initialsOf(name)` helper (server or shared util) — `"Aishwarya Menon" → "AM"`; fallback to phone/email first
    char when name is null.

**Files to edit**

- `app/account/page.tsx` — convert from `'use client'` re-export to a **server component**:
  ```tsx
  import { requireUser } from "@/lib/session"
  import { getAccountData } from "@/lib/services/account"
  import { Account } from "@/screens/Account"
  export default async function Page() {
    const u = await requireUser()
    const data = await getAccountData(u.id)
    return <Account data={data} />
  }
  ```
- `src/screens/Account.tsx` — add `'use client'`; change signature to `Account({ data }: { data: AccountData })`;
  replace all `user.*`, `addresses`, `orders`, `subscription`, `spendTrend` references with `data.*`. Wire the
  "Edit profile" and "Add new"/"Add address" buttons (Tasks 1.3d/1.3e).
- `src/app/Shell.tsx` — remove `import { user }`; accept an optional `user` prop
  (`{ name, initials, tier }`) for the footer/topbar avatar. Pages that render `Shell` (via the screens) pass it
  down. For the `admin` variant keep the static "Femi9 Ops" label or pass the admin's name.

**Data touched:** `User`, `Address`, `Order`+`OrderItem`, `Subscription`+`Cadence`+`ProductVariant`+`Product`,
`PointsLedger`. All reads filtered by `userId`.

**Edge cases**
- New user (OTP-only, no orders/addresses/subscription): every section must render an empty state, not crash.
  `orders.length === 0`, `subscription === null`, `addresses === []`, points `0`.
- `name` null → show phone/email + initials fallback; `tier` null → hide the tier chip.
- Money is stored as integer rupees (`basePrice`/`price`/`total` are `Int`) — `fmtRs` already assumes rupees, no
  paise conversion.
- Order `status` enum is lowercase (`delivered`); the screen's badge class did `status.toLowerCase()` — keep it,
  and map enum → display label (`delivered → "Delivered"`).

**Acceptance check (✓ Epic 1.3):** log in as the demo customer → `/account` shows their real name, email, phone,
tier, the seeded addresses, real order rows (once P2 creates any — until then empty state), and the real Bloom
points balance from `PointsLedger` (1240 from the seeded opening balance). Logging in as a *different* user
shows *that* user's data only.

**Depends on:** 1.2b (guard), 1.2c (session), 1.3c (points). Note: **order rows depend on Phase 2** (no orders
exist until checkout ships) — the account page renders the empty state correctly until then; do not fake orders.

---

### Task 1.3b — Cut over `/dashboard` to the session user

**Files to edit**

- `app/dashboard/page.tsx` — server component: `requireUser()`, pass `user` (at minimum `{ name }`) to the screen.
- `src/screens/UserDashboard.tsx` — add `'use client'`; accept `{ user }` prop; replace
  `import { user } from '../data/account'` and the `Hello, ${user.name}` greeting + Shell footer with the session
  user's name.

**Scope boundary (important):** the cycle **predictions, calendar, trend, insights, symptom log** on this page
come from `src/data/cycle.ts` and remain static in Phase 1. Real cycle logs → predictions is **Phase 5.2**
(`CyclePredictionService.predict(userId)` over `PeriodLog`/`SymptomLog`). Phase 1 only replaces the *identity*
(greeting/name/avatar) with the session user. Leave a `// TODO(Phase 5.2)` where cycle data is still imported.

**Data touched:** `User` (name) only.

**Edge cases**
- Name null (OTP-only user) → greeting "Hello, there" fallback rather than "Hello, undefined".
- The hardcoded reorder link `to="/product/p330dw"` stays (real reorder is later); keep as-is.

**Acceptance check:** `/dashboard` greets the logged-in user by first name (not "Aishwarya"); switching users
switches the greeting; cycle widgets still render (static) without error.

**Depends on:** 1.2b, 1.2c.

---

### Task 1.3c — Rewards on the real ledger (off `localStorage`)

**Files**

- Add to `src/lib/services/account.ts`: `getPointsSummary(userId)`:
  - `balance` = the most recent `PointsLedger.balanceAfter` for the user (or `sum(delta)` if no rows) — both
    are consistent because the ledger is append-only with running `balanceAfter`.
  - `activity` = last N `PointsLedger` rows mapped to `{ label: reason, date: createdAt, pts: (delta>0?'+':'')+delta }`.
- Edit `src/components/Rewards.tsx`:
  - Remove the `localStorage` `loadBalance`/`saveBalance`/`STORE_KEY` logic and the `user`/`orders` imports.
  - Accept `{ balance, activity }` as props (passed from `Account` screen, which got them from `getAccountData`).
  - Keep the static `EARN` copy and the `REDEEMABLES` list for display, but **the redeem action is deferred to
    Phase 4.1** (real coupon + email + transactional ledger debit). For Phase 1: render the redeem buttons but
    have `redeem()` no-op with a "coming soon"/disabled state, or hide the CTA — do **not** mutate the balance
    client-side. Leave `// TODO(Phase 4.1): POST /api/rewards/redeem`.

**Data touched:** `PointsLedger` (read only in Phase 1).

**Edge cases**
- Empty ledger → `balance = 0`, `activity = []`, progress bar at 0, no crash.
- `balanceAfter` must be trusted from the ledger, never recomputed client-side (prevents the old
  localStorage tampering).
- The old "recent activity" derived rows from static `orders` — replace entirely with ledger rows.

**Acceptance check:** `/account` Rewards panel shows the real balance (seeded 1240 for the demo customer) sourced
from `PointsLedger`; refreshing the page does not change it (no localStorage); a brand-new user shows 0.
Redeeming does not alter the balance (deferred).

**Depends on:** 1.3a. **Note:** RewardOption rows are already seeded — Phase 4 will drive redeem off them.

---

### Task 1.3d — Profile edit (persist to DB)

**Files**

- `src/lib/validation/account.ts` (shared Zod, per Phase 0 convention): `profileUpdateSchema = z.object({ name: z.string().min(1).max(80) })`.
  (Email/phone changes require re-verification → out of scope for Phase 1; edit **name** and, optionally, an
  avatar URL later. `tier`/`role` are **admin-only**, never editable here.)
- `app/api/account/profile/route.ts` (`runtime = "nodejs"`):
  - `PATCH` → `requireUser()`, parse body with `profileUpdateSchema`, `prisma.user.update({ where:{id:user.id}, data:{ name } })`, return the updated profile.
- Edit `src/screens/Account.tsx` — wire the "Edit profile" button to an inline form/modal that `PATCH`es and
  refreshes (`router.refresh()` so the server component re-reads).

**Data touched:** `User.name` (only the caller's own row — `where: { id: session.user.id }`).

**Edge cases**
- Reject empty/whitespace name (Zod). Trim.
- Client must not be able to send `role`/`tier`/`email` — the schema strips them; `data` only ever contains
  `name`. Verify a crafted payload with `role:"admin"` is ignored (no privilege escalation).
- Concurrent edits: last-write-wins on a single field is acceptable.

**Acceptance check (✓ Epic 1.3 "Edit profile persists"):** change the name in the UI → row updated in DB, page
reflects it after `router.refresh()`; a POST with `{name, role:"admin"}` leaves `role` unchanged; the endpoint
returns 401 with no session and 403 is not applicable (own-profile only).

**Depends on:** 1.2c.

---

### Task 1.3e — Addresses CRUD + set-primary (persist to DB)

**Files**

- `src/lib/validation/account.ts` — `addressSchema = z.object({ label, name, line, city, state?, pincode?, phone? })`
  matching `Address` columns (`pincode` optional string; validate `^\d{6}$` if present).
- `src/lib/services/account.ts` — add owner-scoped CRUD:
  - `listAddresses(userId)`, `createAddress(userId, input)`, `updateAddress(userId, id, input)` (assertOwner),
    `deleteAddress(userId, id)` (assertOwner), `setPrimaryAddress(userId, id)`.
  - `setPrimaryAddress` runs in a **transaction**: `updateMany({ where:{userId}, data:{isPrimary:false} })` then
    `update({ where:{id, userId?}, data:{isPrimary:true} })` — after `assertOwner`.
  - First address created for a user should default `isPrimary: true` if none exists.
- Routes (all `runtime = "nodejs"`, all `requireUser()` + ownership):
  - `app/api/account/addresses/route.ts` — `GET` (list), `POST` (create).
  - `app/api/account/addresses/[id]/route.ts` — `PATCH` (edit), `DELETE`.
  - `app/api/account/addresses/[id]/primary/route.ts` — `POST` (set primary).
- Edit `src/screens/Account.tsx` — wire "Add new", per-address edit/delete, and "set primary" controls; call the
  routes then `router.refresh()`.

**Data touched:** `Address` (create/update/delete), all constrained to `userId = session.user.id`.

**Edge cases**
- **Ownership:** `updateAddress`/`deleteAddress`/`setPrimary` must 403 when the `id` belongs to another user
  (verified by Task 1.2d). Prefer `where: { id, userId }` on writes so a mismatched owner affects 0 rows → treat
  count 0 as 404/403.
- **Exactly one primary:** setting a new primary unsets others in the same transaction; deleting the primary
  should promote another address to primary (or leave none if it was the last) — decide and implement (recommend:
  promote the most recently created remaining address).
- `pincode`/`phone` optional and nullable in schema — allow blank.
- Deleting an address referenced by an existing `Order.addressId` (`Order.address` relation, nullable FK): the FK
  is `addressId String?` with no cascade — a delete would violate the reference if orders exist. Guard: if the
  address is referenced by any order, **soft-handle** (block delete with a 409 "address used by past orders", or
  set those orders' `addressId` to null). Recommend blocking with 409 to preserve order history. (Relevant once
  Phase 2 creates orders; until then no orders reference addresses.)

**Acceptance check (✓ Epic 1.3 "add-address / set-primary persist"):** add an address → row in `Address` with the
caller's `userId`; set another as primary → exactly one `isPrimary=true` for that user; delete → gone; every
mutation with another user's address id → 403; deleting a primary promotes a replacement.

**Depends on:** 1.2c, 1.3a.

---

## Phase 1 exit checklist (maps to `Femi9-Backend-Tasks.md` ✓s)

- [ ] Sign up / log in by **phone OTP** and by **email magic link** both work (1.1b, 1.1c).
- [ ] Repeated OTP requests are **throttled** (429) and codes are single-use with 5-min expiry (1.1c, 1.2a).
- [ ] `/admin` requires `staff|admin`; `/account` & `/dashboard` require login; **anon is redirected** to
      `/login?next=…` (1.2b).
- [ ] A user **cannot read another user's** orders/addresses/points — ownership test green (1.2c, 1.2d).
- [ ] `/account`, `/dashboard`, Rewards render the **logged-in user from DB**; no `data/account` imports remain
      in `Shell.tsx`, `Account.tsx`, `UserDashboard.tsx`, `Rewards.tsx` (1.3a–1.3c).
- [ ] Edit profile / add-address / set-primary **persist to DB** (1.3d, 1.3e).
- [ ] `Account`/`Session` models remain (adapter contract); `VerificationToken` + `User` are written by both
      flows; JWT carries `role` (0.1).

**Grep gate:** `grep -rn "data/account" app src` returns **zero** matches when Phase 1 is complete.

## Known deferrals (do not scope-creep into Phase 1)

- Order rows on `/account` populate in **Phase 2** (checkout); empty state until then.
- Rewards **redeem → coupon + email** is **Phase 4.1**; Phase 1 only reads the balance.
- Cycle **predictions from real logs** are **Phase 5.2**; Phase 1 keeps static cycle widgets + real greeting.
- Email/phone **change with re-verification** is out of Phase 1 (name-only profile edit).
- `User.phoneVerified` column is an optional schema addition (0.7) — adopt if audit trail is wanted.
