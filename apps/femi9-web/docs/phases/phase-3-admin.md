# Phase 3 — Custom Admin (`/admin`)

> Implementation spec. Goal: staff run the entire business — catalog, inventory,
> orders, customers, coupons, settings, content, and analytics — from a custom,
> branded `/admin`, with **no deploy** required to change store data.
>
> Companion to `Femi9-Backend-Tasks.md` (Phase 3, Epics 3.1–3.5). Reference schema
> is `prisma/schema.prisma`. Stack is fixed: Next.js App Router on ECS Fargate,
> Aurora Serverless v2 Postgres, Prisma, Razorpay, Auth.js, custom admin.

---

## 0. Preconditions, dependencies & blockers

### Depends on earlier phases (hard)
| Dependency | Provides | Used by |
|---|---|---|
| **Phase 1 — Auth** ↩1 | `auth()` session helper (assumed `@/lib/auth`), `User.role` enum (`customer│affiliate│partner│staff│admin`), session middleware | **All** admin gating (§1). Without it there is nothing to gate on. |
| **Phase 2 — Commerce** ↩2 | `Order`/`OrderItem`/`Payment` rows, pricing service reading `getSettings()`, Razorpay client + Refunds API wrapper | Orders console (§3.2), refunds, revenue analytics (§3.5) |
| **Phase 0 — Foundation** (DONE) | `handle/ok/created/badRequest/forbidden/notFound` in `@/lib/api`; service pattern in `src/lib/services/*`; `prisma` in `@/lib/db`; chart components in `src/charts/*`; `getSettings()` in `src/lib/services/settings.ts` | Everything |

> **If Phase 1 is not merged when Phase 3 starts**, build against a temporary
> `requireStaff()` stub that reads a signed dev cookie, and swap it for the real
> `auth()` call at integration. Do **not** ship the stub.

### Founder-action blockers (🔒)
| # | Item | Blocks | Note |
|---|---|---|---|
| 5 | **Image storage** (Cloudinary or S3 bucket + creds) | Catalog image upload (§3.1, Task 3.1.3) | The rest of catalog CRUD works without it; only image upload is blocked. Store the returned URL in `ProductImage.url`. |
| 2 | **Razorpay account + KYC** | Admin-initiated refunds (§3.2, Task 3.2.4) | Already required by Phase 2. Admin refund calls the same Razorpay Refunds API wrapper. On test keys, refunds work in test mode. |
| 8 | **Admin seed users** (emails/phones) | Actually logging in to `/admin` | Seed at least one `role = admin` user. See §1.4. |
| 4 | Transactional email (Resend) | *Optional* refund / shipping-update emails from the orders console | Not blocking; console works without notifications. |

### Schema additions required by this phase
These fields/models are **not** in `schema.prisma` today and must be added by a migration **before** the tasks that use them. Each is called out again inline.

```prisma
// ── Add to model Order ────────────────────────────────────────────────
model Order {
  // ...existing fields...
  invoiceNo      String?   @unique          // generated on first "paid" transition
  trackingCarrier String?                   // "Delhivery" | "BlueDart" | ...
  trackingNumber String?
  trackingUrl    String?
  staffNote      String?                    // internal ops note
  cancelReason   String?
  refunds        Refund[]
}

// ── New model: partial/whole refunds (Payment.status=refunded is not enough) ──
model Refund {
  id                 String   @id @default(cuid())
  orderId            String
  order              Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  paymentId          String?
  amount             Int                       // rupees, <= paid amount minus prior refunds
  reason             String?
  razorpayRefundId   String?  @unique
  status             String   @default("pending") // pending | processed | failed
  createdByUserId    String?
  createdAt          DateTime @default(now())
  @@index([orderId])
}

// ── New model: audit trail for every admin mutation ───────────────────
model AdminAuditLog {
  id         String   @id @default(cuid())
  actorId    String                          // User.id of the staff/admin
  action     String                          // "product.update" | "order.refund" | ...
  entity     String                          // "Product" | "Order" | ...
  entityId   String?
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())
  @@index([entity, entityId])
  @@index([actorId])
  @@index([createdAt])
}

// ── New model: editable homepage/hero blocks (used lightly here, fully in Phase 5) ──
// Not required for Phase 3; content CMS (§3.6) covers blog only. Skip unless scoped in.
```

Low-stock threshold (Epic 3.1 / 2.4): there is **no** threshold column today. Implement
as a **global `Setting` key `lowStockThreshold`** (default 10) with an **optional
per-variant override**:

```prisma
model ProductVariant {
  // ...existing...
  lowStockThreshold Int?   // null → fall back to Setting.lowStockThreshold
}
```

Migration command: `npm run db:migrate -- --name phase3_admin` (dev) / `prisma migrate deploy` (ECS).

---

## 1. Admin auth gating & module shell

### 1.1 Route-level gate — `middleware.ts`
**File (create):** `/middleware.ts` (repo root, alongside `next.config.mjs`)

- Match `/admin/:path*` and `/api/admin/:path*`.
- Read the Auth.js session (Phase 1). If no session → redirect `/admin/*` to `/login?next=…`; return `401` JSON for `/api/admin/*`.
- If `session.user.role` ∉ {`staff`,`admin`} → redirect `/admin/*` to `/` ; return `403` for API.
- Config: `export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] }`.

**Edge cases:** middleware runs on the Edge runtime — do **not** import Prisma there; rely on the JWT/session claim for `role` (ensure Phase 1 puts `role` in the token). Static assets and `/admin/login` (if any) must be excluded from the matcher or allowlisted.

### 1.2 Server-side guards — `src/lib/admin/guard.ts`
**File (create):** `src/lib/admin/guard.ts`

```
requireStaff(): Promise<SessionUser>   // throws ForbiddenError if role ∉ {staff,admin}
requireAdmin(): Promise<SessionUser>   // throws ForbiddenError if role !== admin
```
- Calls Phase 1 `auth()`; middleware is defence-in-depth, these are the real authority for every mutation (never trust the middleware alone).
- `requireAdmin` gates destructive/config actions: settings writes, role changes, product delete/archive, refunds.
- Add a `withStaff(handler)` / `withAdmin(handler)` wrapper so route files stay thin, mirroring the existing `handle()` pattern:

```ts
export const POST = (req: Request) => handle(() => withAdmin(async (actor) => { ... }))
```
- On guard failure return `forbidden()` (403) via the existing `@/lib/api` helper.

**Acceptance:** an authenticated `customer` hitting `GET /api/admin/products` gets `403`; a `staff` user gets `200`. A `staff` user hitting `POST /api/admin/settings` (admin-only) gets `403`; `admin` gets `200`. Verified by integration test hitting each route with three fabricated sessions (customer/staff/admin).

### 1.3 Audit logging — `src/lib/services/admin/audit.ts`
**File (create):** `src/lib/services/admin/audit.ts`
- `logAudit({ actorId, action, entity, entityId, before, after })` → writes `AdminAuditLog` (schema addition above).
- Fire-and-forget on read; **awaited inside the same transaction** for mutations so a create/update and its audit row commit together.
- Every write endpoint in §§3.1–3.6 calls `logAudit`.

**Acceptance:** editing a product price writes one `AdminAuditLog` row with `action="product.update"`, `before`/`after` diffs, and `actorId` = the acting admin.

### 1.4 Admin seed users
**File (edit):** `prisma/seed.ts`
- Add an idempotent upsert of admin/staff users from an env list `ADMIN_SEED_EMAILS` (comma-separated), `role = admin`. 🔒 founder-action #8 supplies the list.
- **Acceptance:** after `npm run db:seed`, the provided emails exist with `role = admin` and can pass `requireAdmin()`.

### 1.5 Module shell & navigation
**File (edit):** `src/app/Shell.tsx` — replace the analytics-only `ADMIN_NAV` with the full module list; keep the existing sidebar/topbar markup.

**Module list (the `/admin` sidebar):**
| Group | Item | Route |
|---|---|---|
| Overview | Dashboard | `/admin` |
| Catalog | Products | `/admin/products` |
| | Inventory | `/admin/inventory` |
| Sales | Orders | `/admin/orders` |
| | Coupons | `/admin/coupons` |
| People | Customers | `/admin/customers` |
| Content | Blog | `/admin/content/blog` |
| Config | Settings | `/admin/settings` |
| Config | Audit log | `/admin/audit` (admin only) |

- Gate "Settings", "Audit log", and any role-change UI behind `role === 'admin'` (hide for `staff`).
- Replace the hardcoded footer `{ name: 'Femi9 Ops', ... }` with the real session user (Phase 1).

**Files (create) — admin section layout:**
- `app/admin/layout.tsx` — server component: `await requireStaff()`; renders `<Shell variant="admin">`. Redirect on failure (defence in depth with middleware).
- Convert the current single `app/admin/page.tsx` into the **Overview/analytics** route (see §3.5). Each module below gets its own subroute folder.

**Acceptance:** the `/admin` sidebar shows all nine items; a `staff` user does not see Settings/Audit; clicking each item routes to a rendered page (even if a stub initially).

### 1.6 Conventions for all Phase 3 API routes
- Location: `app/api/admin/<module>/route.ts` (+ `[id]/route.ts` for item ops).
- Thin handlers: `handle()` + `withStaff`/`withAdmin`; all business logic in `src/lib/services/admin/*`.
- Validation: Zod v4 schemas in `src/lib/validation/admin.ts` (one exported schema per input). Reject with `badRequest(msg, parsed.error.flatten())`.
- All list endpoints support `?q=`, `?page=`, `?pageSize=` (default 20, max 100), `?sort=`; return `{ rows, total, page, pageSize }`.
- All mutations write `AdminAuditLog`.
- Money is **integer rupees** (matches `Product.basePrice`, `*.price`, `Order.total`). No paise.

---

## 2. Epic 3.1 — Catalog & inventory management

Storefront reads only `status = 'active'` products and `active = true` variants
(`src/lib/services/products.ts`). Admin must read/write **all** statuses.

### Task 3.1.1 — Product CRUD
**Service (create):** `src/lib/services/admin/catalog.ts`
- `listProductsAdmin({ q, status, page, pageSize, sort })` → all statuses, with variant count, primary image, aggregate stock. Do **not** filter by `status='active'`.
- `getProductAdmin(id)` → full product incl. `variants`, `images`, `features`, `specs` (all, ordered by `position`).
- `createProduct(input)` → `Product` (fields: `slug`, `name`, `type`, `basePrice`, `meta`, `flow`, `description`, `longDescription?`, `tag?`, `tagClass?`, `status` default `draft`). Auto-slug from name if omitted; enforce `slug` uniqueness.
- `updateProduct(id, patch)` → partial update; `updatedAt` auto.
- `setProductStatus(id, 'draft'|'active'|'archived')`.
- `deleteProduct(id)` → **guard**: refuse hard-delete if any `OrderItem` references its variants (FK is `variantId` on `OrderItem` with no cascade — a delete would orphan order history). Instead **archive**. Only allow hard delete when the product has zero order items; cascade removes variants/images/features/specs.

**Zod:** `productCreateSchema`, `productUpdateSchema` in `src/lib/validation/admin.ts`.

**Routes (create):**
- `app/api/admin/products/route.ts` — `GET` (list), `POST` (create) [admin].
- `app/api/admin/products/[id]/route.ts` — `GET`, `PATCH` (update/status) [staff for edit, admin for status→archived/delete], `DELETE` [admin].

**UI (create):** `app/admin/products/page.tsx` (list, server component → table), `app/admin/products/[id]/page.tsx` (editor), screens in `src/screens/admin/ProductsList.tsx`, `ProductEditor.tsx`. Reuse `.panel`, `.dash-grid` classes already in the admin CSS.

**Data touched:** `Product`, and via nested writes `ProductVariant`, `ProductImage`, `ProductFeature`, `ProductSpec`. Reads: `OrderItem` (delete guard).

**Edge cases:** duplicate slug → `409`/`badRequest`; `type=panty` products should use `size` variants, `type=pad` should use `pack` variants (validate in §3.1.2, warn otherwise); archiving a product must not break existing carts (CartItem references variant, not product — acceptable, but out-of-stock/inactive variants are already excluded at checkout in Phase 2).

**Acceptance:** create a product with `status=draft` → it does **not** appear on the storefront `GET /api/products`; flip to `active` → it appears **without a deploy** (Epic 3.1 ✓). Editing `name`/`basePrice` reflects on `/product/[slug]` on next load.

### Task 3.1.2 — Variant CRUD
**Service (extend `catalog.ts`):**
- `addVariant(productId, { kind, label, packCount?, size?, price, sku?, stock?, active? })`.
- `updateVariant(id, patch)`, `deleteVariant(id)` (guard: refuse if referenced by `OrderItem`/`Subscription`; deactivate instead), `setVariantActive(id, bool)`.

**Data touched:** `ProductVariant` (`kind`, `label`, `packCount`, `size`, `price`, `sku` unique, `stock`, `active`, `lowStockThreshold` [schema addition]).

**Routes (create):** `app/api/admin/products/[id]/variants/route.ts` (`POST`), `app/api/admin/variants/[id]/route.ts` (`PATCH`,`DELETE`).

**Edge cases:** `sku` is `@unique` → collision returns `badRequest`; `kind=pack` requires `packCount`, `kind=size` requires `size` (Zod refinement); price must be `> 0`; deleting the last active variant should warn (product becomes unbuyable).

**Acceptance:** adding a `pack` variant (e.g. "12 pcs", price 289, stock 50) makes it selectable on the product detail page; `GET /api/products/[slug]` returns it in `variants`.

### Task 3.1.3 — Image, feature & spec management 🔒 (image storage)
**Image upload flow (create):**
- `app/api/admin/uploads/sign/route.ts` — `POST` [staff]: returns a signed Cloudinary upload signature **or** an S3 presigned `PUT` URL (per founder-action #5). Client uploads the file **directly** to storage (keeps large binaries off the ECS request path).
- `app/api/admin/products/[id]/images/route.ts` — `POST` [staff]: persist `{ url, alt?, position }` into `ProductImage` after the client upload succeeds.
- `app/api/admin/images/[id]/route.ts` — `PATCH` (alt/position reorder), `DELETE`.
- `next.config.mjs` — add the storage host to `images.remotePatterns` if using `next/image` (currently no remotePatterns configured).

**Features & specs (create):** `app/api/admin/products/[id]/features/route.ts`, `.../specs/route.ts` — `POST`/`PATCH`/`DELETE` writing `ProductFeature{title,body,position}` and `ProductSpec{key,value,position}`.

**Data touched:** `ProductImage`, `ProductFeature`, `ProductSpec`.

**Edge cases:** reordering must renumber `position` transactionally; deleting image at `position 0` should promote the next image to primary (storefront uses `images[0]`); reject non-image MIME on the sign endpoint; orphaned storage objects on delete are acceptable (or enqueue a cleanup — out of scope).

**Acceptance:** upload two images, reorder so image B is `position 0` → product card and `getProduct()` gallery show B first; add a feature → it renders on the detail page. **Blocked until founder-action #5 is provided; the DB persistence half is testable with a stub URL.**

### Task 3.1.4 — Inventory view & stock adjustments
**Service (create):** `src/lib/services/admin/inventory.ts`
- `listInventory({ q, lowOnly, page, pageSize })` → per-variant rows: product name, variant label, `sku`, `stock`, effective threshold (`variant.lowStockThreshold ?? Setting.lowStockThreshold`), `low` boolean.
- `adjustStock(variantId, delta, reason)` → **transaction**: `stock = stock + delta`, clamp `>= 0` (refuse if result `< 0` unless `delta` is an explicit set), write an `AdminAuditLog` (`action="inventory.adjust"`, `after.stock`). Optionally emit an `EventLog{type:"stock_adjust"}`.
- `setStock(variantId, value, reason)` → absolute set.
- `lowStockList()` → all variants at/under threshold (drives the alert badge).

**Routes (create):** `app/api/admin/inventory/route.ts` (`GET`), `app/api/admin/inventory/[variantId]/route.ts` (`PATCH` — `{delta}` or `{set}`).

**UI (create):** `app/admin/inventory/page.tsx`, `src/screens/admin/Inventory.tsx` — filterable table with inline +/- and a "low stock" filter; header badge shows low-stock count.

**Data touched:** `ProductVariant.stock`, `Setting.lowStockThreshold`, `AdminAuditLog`.

**Edge cases:** concurrent adjustments must not lose updates — use `prisma.$transaction` with `update({ data:{ stock:{ increment: delta } } })` (atomic increment, not read-modify-write); a set-to-negative is rejected; low-stock threshold of `0` disables the alert for that variant.

**Acceptance:** set a variant's stock to `0` → checkout (Phase 2) rejects ordering it (Epic 2.4 ✓); reduce another variant below its threshold → it appears in the low-stock list and the sidebar badge count increments. Editing stock is reflected on the storefront variant availability (Epic 3.1 ✓).

---

## 3. Epic 3.2 — Orders console

### Task 3.2.1 — List / search / filter
**Service (create):** `src/lib/services/admin/orders.ts`
- `listOrders({ q, status, from, to, channel, page, pageSize, sort })` → `Order` rows with `user` (name/email/phone), item count, `total`, `status`, `placedAt`, payment status. `q` matches `orderNo`, customer email/phone, or `invoiceNo`.
- Filters: `status` (`OrderStatus`), date range on `placedAt`, `channel` (`web`|`whatsapp`).

**Route (create):** `app/api/admin/orders/route.ts` (`GET`).
**UI (create):** `app/admin/orders/page.tsx`, `src/screens/admin/OrdersList.tsx`.

**Data touched (read):** `Order` (+ `@@index([status])`, `@@index([userId])` already present), `OrderItem`, `Payment`, `User`.

**Edge cases:** guest orders have `userId = null` (schema allows) — search must still match by `orderNo`/address phone; large ranges must paginate; default sort `placedAt desc`.

**Acceptance:** filtering `status=paid` and a date range returns only matching orders; searching an `orderNo` returns that one order.

### Task 3.2.2 — Order detail view
**Service (extend `orders.ts`):** `getOrderAdmin(id)` → order with `items` (name/label/unitPrice/qty/lineTotal snapshots), `address`, `coupon`, `affiliate`, `payments`, `refunds` (schema addition), `points` ledger entries tied to the order, and derived `paidAmount`/`refundedAmount`.

**Route (create):** `app/api/admin/orders/[id]/route.ts` (`GET`).
**UI (create):** `app/admin/orders/[id]/page.tsx`, `src/screens/admin/OrderDetail.tsx`.

**Data touched (read):** `Order`, `OrderItem`, `Address`, `Coupon`, `Affiliate`, `Payment`, `Refund`, `PointsLedger`.

**Acceptance:** the detail page shows correct line items **by id** with purchase-time snapshots (Epic 2.2 ✓ surfaced), the payment record(s), and any refunds.

### Task 3.2.3 — Status transitions, tracking & invoice
**Service (extend `orders.ts`):**
- `transitionStatus(orderId, next, actor)` — enforce a legal state machine over `OrderStatus`:
  `pending → paid → processing → shipped → delivered`; `pending|paid|processing → cancelled`; `paid|…→ refunded` only via the refund flow (Task 3.2.4). Reject illegal jumps with `badRequest`.
  - On `cancelled` from a stock-decremented state: **restock** the order's variants in the same transaction (reverse Phase 2 decrement) and record the reason (`Order.cancelReason`).
  - On first entry to `paid` (if reached manually, e.g. WhatsApp/COD orders): generate `invoiceNo` (`FEMI9-<yyyymm>-<seq>`), unique.
- `setTracking(orderId, { carrier, number, url })` → writes `trackingCarrier`/`trackingNumber`/`trackingUrl` (schema additions); allowed only when status ≥ `processing`.
- `getInvoice(orderId)` → server-rendered invoice (HTML → PDF via a lightweight renderer, or printable HTML route). Pulls snapshots from `OrderItem`; **never** re-price from live variants.

**Routes (create):**
- `app/api/admin/orders/[id]/status/route.ts` (`PATCH` `{ status, reason? }`).
- `app/api/admin/orders/[id]/tracking/route.ts` (`PATCH`).
- `app/api/admin/orders/[id]/invoice/route.ts` (`GET` — returns printable HTML/PDF).

**Data touched:** `Order.status`, `Order.cancelReason`, `Order.invoiceNo`, tracking fields (schema additions); `ProductVariant.stock` (restock on cancel); `AdminAuditLog`.

**Edge cases:** double-transition (idempotent — setting the current status is a no-op, not an error); marking `shipped` without tracking should warn but not block; cancelling an already-`delivered` order is rejected; concurrent transitions guarded by transaction + optimistic check on current status.

**Acceptance:** staff move an order `paid → processing → shipped` (adding tracking) `→ delivered`; an illegal `delivered → pending` is rejected; cancelling a `processing` order restocks its variants and records the reason (Epic 3.2 ✓ lifecycle).

### Task 3.2.4 — Refunds 🔒 (Razorpay)
**Service (create):** `src/lib/services/admin/refunds.ts`
- `createRefund(orderId, { amount, reason }, actor)` — **transaction**:
  1. Load order + `payments` (captured) + prior `refunds`; validate `amount > 0` and `amount ≤ paidAmount − alreadyRefunded` (support **partial** refunds).
  2. Call the Phase 2 Razorpay Refunds API wrapper with the `razorpayPaymentId`; store `razorpayRefundId`.
  3. Insert `Refund{ status:'processed' }`; if the whole amount is refunded, set `Order.status = refunded` and `Payment.status = refunded`.
  4. **Reverse loyalty:** insert a negative `PointsLedger` entry for points awarded on this order (Epic 2.3 note "refunds reverse points"): `delta = -(sum of positive points where orderId=order.id)`, `reason="refund"`, recompute `balanceAfter`.
  5. `logAudit(action="order.refund")`.
- Guard: **admin only** (`requireAdmin`).

**Route (create):** `app/api/admin/orders/[id]/refund/route.ts` (`POST` `{ amount, reason }`).
**UI:** refund modal inside `OrderDetail.tsx`.

**Data touched:** `Refund` (schema addition), `Payment.status`, `Order.status`, `PointsLedger`, `AdminAuditLog`.

**Edge cases:** over-refund (> paid − prior) rejected; Razorpay API failure → transaction rolls back, `Refund.status='failed'` recorded (outside the tx, for audit), order status unchanged; duplicate refund click idempotent on `razorpayRefundId`; refunding an order with no captured payment (e.g. WhatsApp/COD) is a manual `status=refunded` set with **no** Razorpay call — branch on payment presence.

**Acceptance:** a partial refund on a paid order creates a `Refund`, leaves order `paid`; a full refund flips order → `refunded`, reverses the order's awarded points (balance drops by exactly the awarded amount), and appears in Razorpay test dashboard (Epic 3.2 ✓ / Epic 2.3 ✓).

---

## 4. Epic 3.3 — Customers & coupons

### Task 3.3.1 — Customer search & detail
**Service (create):** `src/lib/services/admin/customers.ts`
- `listCustomers({ q, role, page, pageSize })` → `User` rows (`name`, `email`, `phone`, `role`, `tier`, `createdAt`) + order count + points balance. `q` matches name/email/phone.
- `getCustomer(id)` → user with `orders` (summary), `addresses`, points balance (sum of `PointsLedger.delta`) and recent ledger entries, `subscriptions`, `affiliate` (if any). **Do not** expose `periods`/`symptoms` (health data — ownership-isolated, Phase 5; explicitly excluded here).

**Routes (create):** `app/api/admin/customers/route.ts` (`GET`), `app/api/admin/customers/[id]/route.ts` (`GET`).
**UI (create):** `app/admin/customers/page.tsx`, `app/admin/customers/[id]/page.tsx`, `src/screens/admin/Customers*.tsx`.

**Data touched (read):** `User`, `Order`, `Address`, `PointsLedger`, `Subscription`, `Affiliate`.

**Acceptance:** searching a customer email returns the user; the detail shows their orders, tier, and points balance = ledger sum.

### Task 3.3.2 — Points adjustment
**Service (extend `customers.ts`):** `adjustPoints(userId, delta, reason, actor)` — **transaction**: read current balance (last `balanceAfter` or ledger sum), append `PointsLedger{ delta, reason, balanceAfter }`, audit. Ledger is append-only (never mutate/delete rows).

**Route (create):** `app/api/admin/customers/[id]/points/route.ts` (`POST` `{ delta, reason }`) [admin].

**Data touched:** `PointsLedger`, `AdminAuditLog`.

**Edge cases:** adjustment that would take balance `< 0` is rejected (or allowed only for `admin` with an explicit override flag); `reason` required.

**Acceptance:** granting `+200` points appends one ledger row and the customer's balance increases by exactly 200.

### Task 3.3.3 — Role changes
**Service (extend `customers.ts`):** `setRole(userId, role, actor)` [admin]. Guard: an admin cannot demote themselves to below `admin` if they are the **last** admin (count check); log audit.

**Route (create):** `app/api/admin/customers/[id]/role/route.ts` (`PATCH` `{ role }`) [admin].

**Data touched:** `User.role`, `AdminAuditLog`.

**Edge cases:** promoting to `affiliate` does **not** auto-create an `Affiliate` row (that's Phase 4's approval flow) — surface a warning; last-admin guard as above.

**Acceptance:** changing a customer to `staff` lets them pass `requireStaff()`; the last remaining admin cannot self-demote.

### Task 3.3.4 — Coupon CRUD + usage stats
**Service (create):** `src/lib/services/admin/coupons.ts`
- `listCoupons({ q, active })` → `Coupon` rows + live usage = `usedCount` and orders-applied count (`Order` where `couponId`).
- `createCoupon({ code, type, value, minOrder?, maxUses?, expiresAt?, active? })` — `code` uppercased + unique; `type` ∈ {`flat`,`pct`}; if `pct`, `value` ∈ 1..100.
- `updateCoupon(id, patch)`, `setCouponActive(id, bool)`, `deleteCoupon(id)` (refuse delete if `Order` references it → deactivate instead).
- `couponStats(id)` → `usedCount`, total discount given (sum `Order.discount` where `couponId=id`), revenue on coupon orders, redemption rate vs `maxUses`.

**Routes (create):** `app/api/admin/coupons/route.ts` (`GET`,`POST`), `app/api/admin/coupons/[id]/route.ts` (`GET`stats,`PATCH`,`DELETE`).
**UI (create):** `app/admin/coupons/page.tsx`, `src/screens/admin/Coupons.tsx`.

**Data touched:** `Coupon` (`code`,`type`,`value`,`minOrder`,`maxUses`,`usedCount`,`expiresAt`,`active`); reads `Order.couponId`/`Order.discount`.

**Edge cases:** duplicate `code` (unique) → `badRequest`; `maxUses < usedCount` on edit is allowed (further use blocked at checkout); `expiresAt` in the past effectively disables; `usedCount` is incremented at checkout by Phase 2 — admin edits must not clobber it (patch only the editable fields).

**Acceptance:** create `WELCOME10` (`pct`, 10, `minOrder=499`) → it applies at checkout (Phase 2) reducing the total; the coupon list shows `usedCount` increment and the stats endpoint reports total discount given (Epic 3.3 ✓ "created coupon works at checkout; usage tracked").

---

## 5. Epic 3.4 — Settings ("customizable backend")

The pricing constants already read from `getSettings()` (Phase 0 seam). This epic
adds the **write path + editor UI** so behaviour changes with no deploy.

### Task 3.4.1 — Settings write service
**File (edit):** `src/lib/services/settings.ts` — add writers to the existing getter module:
- `updateSettings(patch: Partial<Settings>, actor)` — validate with a Zod schema, upsert each key into `Setting{ key, value }`, audit. Keep `getSettings()` as the typed read.
- Extend the `Settings` interface + `DEFAULTS` with the Phase 3 editable keys:
  | Key | Type | Replaces / drives |
  |---|---|---|
  | `freeShipThreshold` | int | existing free-ship rule |
  | `subscribeSavePct` | int | existing subscribe-&-save % |
  | `whatsappNumber` | string | WhatsApp fallback link |
  | `pointsPerRupee` | number | earn rule |
  | `firstOrderBonusPoints` | int | earn rule |
  | `taxPct` | number | **new** — GST/tax at checkout (open decision; default 0) |
  | `lowStockThreshold` | int | **new** — inventory alerts (§3.1.4) |
  | `shippingFlat` | int | **new** — flat shipping below threshold |

**Route (create):** `app/api/admin/settings/route.ts` — `GET` (current values) and `PATCH` (`updateSettings`) [admin]. (The public `GET /api/settings` from Phase 0 stays read-only.)

**UI (create):** `app/admin/settings/page.tsx`, `src/screens/admin/Settings.tsx` — grouped form: Pricing & shipping, Rewards, Inventory, Contact/WhatsApp, Tax.

**Data touched:** `Setting` (Json rows), `AdminAuditLog`.

**Edge cases:** each value coerced/validated (reuse the existing `coerce()` tolerance); a malformed row must never break the store (getter already defaults); `taxPct`/`subscribeSavePct` bounded 0..100; changing `whatsappNumber` must be digits only.

**Acceptance:** raise `freeShipThreshold` from 999 → 1499 in the UI → a 1200-rupee cart now shows shipping charged at checkout **with no deploy** (Epic 3.4 ✓); lower `lowStockThreshold` and watch the inventory alert list change.

### Task 3.4.2 — Cadences editor
Cadences are their own table (`Cadence{ code, label, sub, days, active, position }`), consumed by subscriptions (Phase 5).
- **Service (create):** `src/lib/services/admin/cadences.ts` — `listCadences`, `createCadence`, `updateCadence`, `reorderCadences`, `setActive`.
- **Route (create):** `app/api/admin/cadences/route.ts`, `.../[id]/route.ts`.
- **Edge cases:** `code` unique; deactivating a cadence with active subscriptions must not delete it (deactivate only); `days > 0`.
- **Acceptance:** adding a "5-week" cadence makes it selectable wherever cadences are offered.

### Task 3.4.3 — Reward options editor
`RewardOption{ title, costPoints, couponType, couponValue, active, position }` — the redemption catalogue (Phase 4 consumes it).
- **Service (create):** `src/lib/services/admin/rewards.ts` — CRUD + reorder.
- **Route (create):** `app/api/admin/reward-options/route.ts`, `.../[id]/route.ts`.
- **Acceptance:** editing a reward's `costPoints` changes what the rewards UI shows (Epic 3.4 "reward rules" ✓).

### Task 3.4.4 — Staff roles surface
Staff-role management is Task 3.3.3 (role changes). The Settings page links to it; no separate storage. **Acceptance:** covered by 3.3.3.

---

## 6. Epic 3.6 (bridge) — Content / Blog CMS

> The tasks doc places full CMS in Phase 5 (Epic 5.3); the Phase 3 brief explicitly
> scopes **blog CRUD** into the admin. Build the blog editor now; homepage-section
> editing stays in Phase 5.

### Task 3.6.1 — Blog category CRUD
**Service (create):** `src/lib/services/admin/content.ts`
- `listCategories`, `createCategory({ name, color, tint })`, `updateCategory`, `deleteCategory` (refuse if `BlogPost` references it).
- **Route (create):** `app/api/admin/blog/categories/route.ts`, `.../[id]/route.ts`.
- **Data touched:** `BlogCategory{ name unique, color, tint }`.

### Task 3.6.2 — Blog post CRUD + draft→publish
**Service (extend `content.ts`):**
- `listPostsAdmin({ q, status, categoryId, page, pageSize })` → **all** statuses (storefront shows only `approved`).
- `getPostAdmin(id)`, `createPost(input)`, `updatePost(id, patch)`, `setPostStatus(id, status)`, `deletePost(id)`.
- Fields map to `BlogPost`: `slug`(unique), `title`, `categoryId`, `excerpt`, `author`, `readTime`, `tone`, `image?`, `featured`, `status`, `body String[]`, `publishedAt`.
- **`body` convention (preserve exactly):** array of lines where `'## '` → heading, `'> '` → pull-quote, else paragraph (matches `src/data/blog.ts` and the `BlogPost` renderer). The editor is a line/block editor that round-trips this array — do **not** switch to a single markdown blob.

**Draft→publish mapping (no enum change needed):** `BlogPost.status` is `ModerationStatus`:
| CMS state | `status` value |
|---|---|
| Draft | `pending` |
| Published | `approved` |
| Unpublished/archived | `hidden` |
The public blog service filters `status = 'approved'`. Document this mapping in `content.ts`. *(Optional schema improvement: add a dedicated `ContentStatus { draft, published, archived }` enum — call out but not required.)*

**Routes (create):** `app/api/admin/blog/posts/route.ts` (`GET`,`POST`), `app/api/admin/blog/posts/[id]/route.ts` (`GET`,`PATCH`,`DELETE`).
**UI (create):** `app/admin/content/blog/page.tsx` (list), `app/admin/content/blog/[id]/page.tsx` (editor with a live preview using the existing `BlogPost` renderer), `src/screens/admin/BlogList.tsx`, `BlogEditor.tsx`.

**Data touched:** `BlogPost`, `BlogCategory`, `AdminAuditLog`.

**Edge cases:** duplicate `slug` → `badRequest`; a post cannot be `approved` without a `categoryId`; `featured` should be limited (warn if > N featured); `image` optional (poster falls back to category `tint`); publishing sets `publishedAt` if not already set.

**Acceptance:** create a draft post (`status=pending`) → it is **absent** from the public `/blog` list; publish it (`approved`) → it appears at `/blog/[slug]` with `##`/`>` lines rendered as headings/quotes, no deploy (Epic 5.3 preview ✓).

---

## 7. Epic 3.5 — Live analytics (rebuild charts from real queries)

The current `src/screens/AdminDashboard.tsx` renders **entirely from static
`src/data/analytics.ts`**. Rebuild every panel from aggregation queries; keep the
chart components (`AreaChart`, `BarChart`, `DonutChart`, `StatTile`, `RankBars`,
`Legend`) **unchanged** — they are presentational and prop-driven. The service must
return the **exact shapes** those props expect (see `src/data/analytics.ts` for the
target types).

### Task 3.5.1 — Analytics service
**File (create):** `src/lib/services/admin/analytics.ts` — one function per panel, all reading real tables. "Paid" = `Order.status ∈ {paid, processing, shipped, delivered}` (exclude `pending`/`cancelled`/`refunded` from revenue; net out refunds where noted).

| Panel (current export) | Real query | Tables/fields |
|---|---|---|
| `kpis[0]` Revenue (month) | `SUM(total)` paid orders this month; delta vs last month; spark = last 7 months | `Order.total`, `Order.status`, `Order.placedAt` |
| `kpis[1]` Orders (month) | `COUNT` paid orders this month + delta + spark | `Order` |
| `kpis[2]` Active subscribers | `COUNT` `Subscription.status='active'` + delta/spark by `createdAt` | `Subscription` |
| `kpis[3]` Avg cycle (cohort) | `AVG(lengthDays)` over consenting `PeriodLog` | `PeriodLog.lengthDays` |
| `revenueTrend` | monthly `SUM(total)` grouped by month, last 9 months; `forecastFrom` = last real month index | `Order` grouped by `date_trunc('month', placedAt)` |
| `ordersByMonth` | monthly `COUNT`, last 7 months | `Order` |
| `productMix` | `SUM(qty)` grouped by product (via `OrderItem`→variant→product) this month, top 5 + "other"; assign `CATEGORICAL` colors in fixed order | `OrderItem.qty`, `OrderItem.variantId`→`ProductVariant.productId`→`Product.name` |
| `cycleDistribution` | histogram of `PeriodLog.lengthDays` (buckets 24..34), `modeIndex` = max bucket | `PeriodLog` |
| `regionalDemand` | `COUNT` orders grouped by `Address.city`, ranked top 6 | `Order.addressId`→`Address.city` |
| `demandForecast` | units/week from `OrderItem` for pads; forecast segment depends on Phase 5 `CyclePredictionService` — **for Phase 3 render the real trailing weeks and mark the forecast tail as "n/a" until Phase 5** | `OrderItem`, `Order.placedAt` |
| `modelPanel` | prediction stats — **depends on Phase 5** cycle predictions; until then compute `windowUsers` naively from `PeriodLog` recency or hide the panel | `PeriodLog` |

- Use **raw SQL** (`prisma.$queryRaw`) or `groupBy` for the `date_trunc` monthly rollups (Prisma `groupBy` cannot bucket by month directly). Aurora Postgres supports `date_trunc`.
- Add DB indexes if missing: `Order.placedAt`, `OrderItem.variantId` (present), `PeriodLog.userId` (present). Consider a composite `Order(status, placedAt)` index for the revenue rollups.

**Route (create):** `app/api/admin/analytics/route.ts` (`GET`, `?range=6M|FY`) [staff] → returns the full analytics payload matching `src/data/analytics.ts` shapes.

### Task 3.5.2 — Wire the dashboard to live data
**File (edit):** `app/admin/page.tsx` — make it a **server component** that calls `getAnalytics()` and passes data to the client screen (or fetches `GET /api/admin/analytics`).
**File (edit):** `src/screens/AdminDashboard.tsx` — replace `import { … } from '../data/analytics'` with props from the server component. Keep all chart JSX identical; only the data source changes. The `range` toggle (`6M`/`FY`) now re-fetches or slices server data.
**File (keep, then delete later):** `src/data/analytics.ts` becomes the **type reference / dev fallback**; remove once live data is verified.

**Data touched (read only):** `Order`, `OrderItem`, `ProductVariant`, `Product`, `Subscription`, `Address`, `PeriodLog`, `EventLog`.

**Edge cases:** empty database (fresh env) → every panel must render zeros/empty gracefully, not crash (guard `Math.max(1, …)` on denominators — `RankBars` already does); a month with no orders → 0, not a gap; cycle/`modelPanel` panels must respect **consent** (Phase 5 consent flag) and remain de-identified/aggregate — never render a single-user value; timezone: bucket in Asia/Kolkata to match the business.

**Acceptance:** with seeded orders, the dashboard KPIs, revenue trend, orders/month, product mix, and regional bars all derive from real `Order`/`OrderItem`/`Address` rows — changing an order's status or placing a new paid order changes the numbers on reload; **no** value traces back to `src/data/analytics.ts` (Epic 3.5 ✓ "numbers derive from real orders/events, not static data"). Cycle-distribution and model panels are wired to `PeriodLog` and flagged where they await Phase 5 prediction.

---

## 8. Test plan (phase acceptance)

| # | Check | Ties to |
|---|---|---|
| 1 | `customer`/`staff`/`admin` sessions get `403`/`200` correctly on representative admin routes | §1.2 |
| 2 | Every mutation writes exactly one `AdminAuditLog` row with actor + before/after | §1.3 |
| 3 | New `draft` product invisible on storefront; flip to `active` → visible with no deploy | Epic 3.1 |
| 4 | Stock set to 0 blocks checkout; low-stock list + badge update | Epic 3.1 / 2.4 |
| 5 | Order lifecycle `paid→processing→shipped→delivered`; illegal transition rejected; cancel restocks | Epic 3.2 |
| 6 | Partial + full refund via Razorpay test; full refund flips status and reverses points | Epic 3.2 / 2.3 |
| 7 | Coupon created in admin applies at checkout and increments `usedCount`; stats correct | Epic 3.3 |
| 8 | Points adjustment appends ledger; balance = ledger sum | Epic 3.3 |
| 9 | Changing `freeShipThreshold`/`subscribeSavePct` changes checkout behaviour with no deploy | Epic 3.4 |
| 10 | Blog draft hidden publicly; publish → live with `##`/`>` rendering | Epic 5.3 (bridged) |
| 11 | Dashboard numbers change when a new paid order is placed; nothing sourced from `data/analytics.ts` | Epic 3.5 |

**Phase 3 done when:** all catalog, inventory, orders, customers, coupons, settings,
blog content, and analytics are managed from `/admin`, gated to `staff`/`admin`,
audited, and every storefront-visible change happens without a deploy.

---

## 9. File manifest (new/edited)

**Create — guards & shared:** `/middleware.ts`, `src/lib/admin/guard.ts`, `src/lib/validation/admin.ts`, `src/lib/services/admin/audit.ts`.
**Create — services:** `src/lib/services/admin/{catalog,inventory,orders,refunds,customers,coupons,cadences,rewards,content,analytics}.ts`.
**Edit — services:** `src/lib/services/settings.ts` (writers + new keys), `src/screens/AdminDashboard.tsx`, `src/app/Shell.tsx` (module nav), `prisma/seed.ts` (admin users), `next.config.mjs` (image host), `prisma/schema.prisma` (schema additions in §0).
**Create — API routes (under `app/api/admin/`):** `products`, `products/[id]`, `products/[id]/{variants,images,features,specs}`, `variants/[id]`, `images/[id]`, `uploads/sign`, `inventory`, `inventory/[variantId]`, `orders`, `orders/[id]`, `orders/[id]/{status,tracking,invoice,refund}`, `customers`, `customers/[id]`, `customers/[id]/{points,role}`, `coupons`, `coupons/[id]`, `settings`, `cadences(+[id])`, `reward-options(+[id])`, `blog/categories(+[id])`, `blog/posts(+[id])`, `analytics`.
**Create — admin UI:** `app/admin/layout.tsx`, `app/admin/page.tsx` (edit), `app/admin/{products,inventory,orders,coupons,customers,settings,audit}/…`, `app/admin/content/blog/…`, and `src/screens/admin/*` for each.
