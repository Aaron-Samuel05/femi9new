# Femi9 Backend — Phase & Task Breakdown

> Companion to **Femi9-Backend-PRD.pdf**. Each phase is independently shippable and ordered revenue-first.
> Format: **Epic → tasks**. Each task has an acceptance check (✓). Convert epics into tickets/issues as-is.
> Legend: 🔒 gated on a founder-action item · ↩ depends on an earlier phase.
>
> **Build status (2026-07-18):** Phase 0 is ✅ done (built in `femi9-next/`, verified). Detailed
> per-phase execution specs for Phases 1–5 live in `femi9-next/docs/phases/`.
> **Stack change:** hosting is **AWS ECS Fargate + Aurora Serverless v2 (Mumbai)**, not Vercel/Neon —
> the notes below still say Vercel/Neon in places; the schema/app are portable and unaffected.

---

## Phase 0 — Foundation ✅ DONE
**Goal:** same site, now a full-stack Next.js app backed by a real database. No user-visible feature change.

### Epic 0.1 — Next.js migration ✅
- [x] Scaffold Next.js (App Router, TS) and port the existing `femi9-lavender` UI into it.
  ✓ Every current route renders identically to the Vite build. **Verified in browser.**
- [x] Move client-only motion libs (GSAP, Lenis, three) into client components; keep route code-splitting.
  ✓ Providers wrap the app; route code-splitting preserved; build passes all 11 routes.
- [x] Remove the SPA `vercel.json` rewrite (Next handles routing).
  ✓ File-based routing; deep links/refresh work natively.

### Epic 0.2 — Database & ORM ✅
- [x] Provision Postgres (local for dev; **Aurora Serverless v2** for prod). 🔒 *Aurora needs AWS account (deferred)*
  ✓ App connects to local Postgres; schema deploys to Aurora unchanged.
- [x] Add Prisma; author the full schema from PRD §6.
  ✓ 31 models, `prisma migrate` applied clean, typed client generated.
- [x] Write a seed script from `src/data/*` (5 products + variants, 12 blog posts, cadences, categories).
  ✓ DB matches current content; **product ids used as slugs/FKs**, variants captured (both data bugs fixed).

### Epic 0.3 — Service layer & read APIs ✅ (tail: page cutovers pending)
- [x] Typed service module pattern (`src/lib/services/*`) + Zod validation + shared `@/lib/api` envelope.
  ✓ Route handlers are thin wrappers over services.
- [x] Read-side REST API live: products, blog, settings, cart (guest, variant-aware), health, events.
  ✓ All endpoints return live seeded data; `curl`-verified. `/product/[id]` cut over to a server component.
- [ ] Cut the remaining pages (Home grid, blog list/post, cart drawer) over to the APIs.
  ✓ No page imports `src/data/*` for catalog/blog. *(next step — no external accounts needed)*
- [ ] Sentry + structured logging.
  ✓ Errors surface in Sentry; secrets only in env.

### Epic 0.4 — CI / deploy 🔒 (AWS — deferred)
- [ ] ECS Fargate service + ALB/CloudFront; Aurora Serverless v2 (Mumbai) via RDS Proxy; per-PR preview. 🔒 *needs AWS account*
  ✓ Pushes deploy to a container; DB reachable in-VPC.

**Phase 0 done when:** the current site runs on Next.js, reads catalog/blog from Postgres, and deploys via CI.
**→ Now:** app is on Next.js reading catalog/blog/cart from Postgres via APIs; deploy (0.4) waits on AWS.

---

## Phase 1 — Auth & accounts ↩0
**Goal:** real users replace the hardcoded "Aishwarya Menon"; protected pages are actually protected.

### Epic 1.1 — Authentication
- [ ] Integrate Auth.js (v5): email magic-link + phone OTP. 🔒 *needs SMS + email provider*
  ✓ User can sign up / log in by phone OTP and by email link.
- [ ] OTP rate-limiting + single-use short expiry (Upstash). 🔒 *needs Redis*
  ✓ Repeated OTP requests are throttled.

### Epic 1.2 — Roles & guards
- [ ] Role field (`customer|affiliate|partner|staff|admin`) + route-group middleware.
  ✓ `/admin` requires staff/admin; `/account`,`/dashboard` require login; anon is redirected.
- [ ] Ownership checks on all per-user reads.
  ✓ A user cannot read another user's orders/cycle data (verified by test).

### Epic 1.3 — Account pages on real data
- [ ] Replace `import { user } from data/account` everywhere with the session user.
  ✓ `/account`, `/dashboard`, Rewards render the logged-in user from DB.
- [ ] Wire profile + addresses CRUD (the current stub buttons).
  ✓ Edit profile / add-address / set-primary persist to DB.

**Phase 1 done when:** anyone can create a real account, log in, and see only their own data; `/admin` is closed to non-staff.

---

## Phase 2 — Commerce core ↩1
**Goal:** the store can take real, paid orders. **Revenue-critical.**

### Epic 2.1 — Cart
- [ ] Server-persisted cart with variant-aware line items (guest cart by cookie, merges on login).
  ✓ Cart survives refresh; pack/panty-size captured; guest→login merge works.

### Epic 2.2 — Checkout & orders
- [ ] `POST /api/checkout`: server recomputes totals from `product_variant.price`, validates stock.
  ✓ Client-sent prices are ignored; overselling impossible (tx-guarded).
- [ ] Order + order_item records with price/name snapshots.
  ✓ Order history shows correct line items by id.
- [ ] Pricing rules server-side: free-ship threshold, subscribe-save %, coupon apply.
  ✓ Totals match rules; invalid coupons rejected.

### Epic 2.3 — Razorpay 🔒 *needs Razorpay account + keys*
- [ ] Create Razorpay order in checkout; Checkout modal on client (UPI/card/netbanking).
  ✓ Payment completes in test mode.
- [ ] Synchronous signature verification **and** `razorpay` webhook (source of truth), idempotent on payment id.
  ✓ Order marked paid only on verified capture; duplicate webhooks are no-ops.
- [ ] Post-payment: decrement stock, award points, attribute affiliate — in one transaction.
  ✓ Stock/points update exactly once per paid order.
- [ ] Reconciliation cron for stuck `pending` orders; refund flow via Razorpay Refunds API.
  ✓ Stuck orders resolve; refunds reverse points.

### Epic 2.4 — Inventory
- [ ] Stock on `product_variant`; low-stock threshold.
  ✓ Out-of-stock variants can't be ordered.

### Epic 2.5 — WhatsApp fallback
- [ ] Keep the existing WhatsApp order button as secondary path.
  ✓ Both Razorpay and WhatsApp checkout available.

**Phase 2 done when:** a customer places a real order, pays via Razorpay, stock/points update, and the order is recorded.

---

## Phase 3 — Admin panel ↩2
**Goal:** staff run the business without a deploy. Custom, branded `/admin`.

### Epic 3.1 — Catalog & inventory management
- [ ] CRUD products, variants, images, features, specs; status draft/active/archived. 🔒 *needs image storage*
  ✓ New product appears live on storefront without a deploy.
- [ ] Inventory view + stock adjustments + low-stock alerts.
  ✓ Editing stock reflects on the store.

### Epic 3.2 — Orders console
- [ ] List/search/filter orders; detail view; status updates; tracking; invoice; refunds.
  ✓ Staff can move an order through its lifecycle and refund it.

### Epic 3.3 — Customers & coupons
- [ ] Customer search; view orders/points/tier; adjust points; change roles.
- [ ] Coupon CRUD + usage stats.
  ✓ Created coupon works at checkout; usage tracked.

### Epic 3.4 — Settings ("customizable backend")
- [ ] Editable settings: free-ship threshold, subscribe-save %, tax, reward rules, cadences, staff roles.
  ✓ Changing a setting changes store behavior with no deploy (replaces hardcoded `FREE_SHIP`/`SUBSCRIBE_PCT`).

### Epic 3.5 — Live analytics
- [ ] Rebuild the current admin charts from real aggregation queries (KPIs, revenue, mix, orders/month, regional).
  ✓ Dashboard numbers derive from real orders/events, not static data.

**Phase 3 done when:** all catalog, orders, customers, coupons, settings, and analytics are managed from `/admin`.

---

## Phase 4 — Growth programs ↩3
**Goal:** rewards, affiliate, partner, and community become real (off `localStorage`).

### Epic 4.1 — Rewards ledger
- [ ] Append-only `points_ledger`; earn rules on order/review/referral; redeem → real coupon + email.
  ✓ Balance = ledger sum; redemption is transactional, no double-spend.

### Epic 4.2 — Affiliate program
- [ ] Application → admin approval → **server-allocated unique** promo code.
  ✓ No client-side hash codes; codes are unique.
- [ ] `/r/:code` click logging + attribution cookie; order attribution at checkout; commission accrual.
  ✓ Affiliate dashboard shows real clicks/orders/earnings.
- [ ] Admin payout runs (record UPI ref, mark paid).
  ✓ Payout history per affiliate.

### Epic 4.3 — Partner CRM
- [ ] Application writes `partner_application`; applicant + ops notified. 🔒 *notification providers*
  ✓ Lead appears in admin board; no more localStorage-only saves.
- [ ] Admin lead board: new → contacted → onboarded/rejected + notes.
  ✓ Staff can work leads through the pipeline.

### Epic 4.4 — Community wall + moderation
- [ ] Posts/likes/replies persist server-side; posts default `pending`.
  ✓ Wall is shared across all visitors; likes persist.
- [ ] Admin moderation queue (approve/hide, handle flags); optional keyword filter.
  ✓ Only approved posts show publicly.

**Phase 4 done when:** rewards, affiliate attribution/payouts, partner leads, and the moderated wall all run server-side.

---

## Phase 5 — Lifecycle & content ↩4
**Goal:** retention + content self-serve.

### Epic 5.1 — Subscriptions
- [ ] Subscription CRUD (pause/skip/change/cancel) from `/account`.
- [ ] Renewal cron generates orders; payment via pay-link reminder (auto-charge later — see decision #2).
  ✓ Due subscriptions generate orders; "saved so far" computed from real orders.

### Epic 5.2 — Cycle tracking & predictions
- [ ] `period_log` + `symptom_log` CRUD; `CyclePredictionService.predict(userId)` computes all predictions server-side.
  ✓ Dashboard predictions come from the user's real logs.
- [ ] Encrypt cycle data at rest; strict ownership; consent flag for aggregate use.
  ✓ Health data isolated; aggregates de-identified.

### Epic 5.3 — Blog / content CMS
- [ ] Blog posts editable in admin (markdown/blocks preserving `##`/`>` conventions); draft→publish.
- [ ] Editable homepage sections (hero, impact stats).
  ✓ Marketing copy changes without a code deploy.

### Epic 5.4 — Notifications
- [ ] Notification service + templates (email/SMS/WhatsApp) for the triggers in PRD §20.
  ✓ Order confirmation, OTP, shipping, coupon emails/SMS send reliably.

**Phase 5 done when:** subscriptions renew, cycle predictions are real, and blog/homepage content is editable.

---

## Launch — Hardening
- [ ] Security review (authz on every mutation, ownership, webhook signatures, no card data stored).
- [ ] Load test hot paths; add DB indexes; cache catalog/blog.
- [ ] Backups on; Sentry alerts; payment/webhook audit trail verified.
- [ ] Switch to **live Razorpay keys**; domain cutover; smoke test the full purchase flow in production. 🔒
  ✓ A real paid order completes end-to-end on the live domain.

---

## Founder-action checklist (blocks the 🔒 items)
These need **your** accounts/KYC — they can't be created on your behalf. Build proceeds on test keys; go-live is gated here.

| # | Item | Blocks | Recommended |
|---|------|--------|-------------|
| 1 | Database provider account | Phase 0 | Neon |
| 2 | Razorpay account + KYC + bank | Phase 2, Launch | Razorpay (UPI-first) |
| 3 | SMS/OTP provider | Phase 1 | MSG91 (India) |
| 4 | Transactional email provider | Phase 1/4 | Resend |
| 5 | Image storage account | Phase 3 | Cloudinary |
| 6 | Redis (rate limiting) | Phase 1 | Upstash |
| 7 | Domain + DNS access | Launch | — |
| 8 | Admin seed users (emails/phones) | Phase 1/3 | provide list |

## Open decisions to confirm (PRD §24)
DB host · subscription payment model (pay-link vs auto-charge) · guest checkout (recommended: allow) · OTP provider · image storage · keep WhatsApp option (recommended: yes) · GST/tax at launch? · admin user list.
