# CLAUDE.md — Admin console (`apps/admin`)

One console, two brands. Read this before touching it.

## What it is

The shared back office for Femi9 and Lumi9. Next 16 · React 19 · its own plain
CSS. It is an internal tool and deliberately inherits nothing from either
storefront's design system — brand identity here is one accent colour, set per
request.

## The stylesheets

Three global sheets, all imported by `app/layout.tsx`, in this order:

```
app/globals.css        the bare document, plus /group — the one screen outside
                       the console shell.
src/styles/admin.css   THE design system. `.adm` (console) and `.adm-auth`
                       (login) scope every `.adm-*` class the fifteen sections
                       compose. Feature modules COMPOSE these; they never author
                       new component CSS.
src/charts/charts.css  the primitives the dashboard's three charts draw into.
```

**All three must stay imported in the root layout.** `admin.css` arrived with
the pages when the console left the storefront, and for a while nothing
imported it — every section still carried its `.adm-*` classes and every one of
them rendered as unstyled HTML. Nothing fails at build time when that sheet is
orphaned, and typecheck has no opinion either; the only signal is the console
looking like a 1994 form.

Brand skinning is one CSS variable ramp. `--plum` / `--plum2` / `--plum-deep` /
`--plum-tint` are what the whole sheet draws in, and `data-brand` on `.adm` /
`.adm-auth` re-points them. Add a brand, add a `data-brand` block — do not add a
second copy of the sheet.

Urbanist and Newsreader (`--sans` / `--serif`) load from a `<link>` in the root
layout, not `next/font`: the Docker build stage has no reason to need the
network, and every font token declares a system fallback.

Runs on `:3002` (`npm run dev:admin` from the repo root).

## The four rules

**1. Brand comes from the SESSION, never from the URL.**
`/[brand]/orders` has the brand in the path, but that segment only decides which
console you are *asking* for. `requireConsole()` returns a session, and the brand
on that session is what every read and write must use. Reading the brand off
`params` and passing it to a service is how one brand's console ends up showing
another's orders.

**2. A module the brand does not have is 404, never 403.**
`hasModule(brand, m)` gates the route, not just the nav link. Lumi9's staff
should not learn that Thara exists by guessing a URL, and 403 tells them it does.
Hiding a nav link is decoration; the guard is the enforcement.

That sentence was true of the RULE and false of the CODE for a long time, in a
way worth knowing about because it will recur. `requireConsole(brand, module?)`
takes the module as an OPTIONAL argument, and a page that omits it is gated by
nothing. Every client-component page omitted it — they cannot call it at all —
so `/lumi9/thara`, `/lumi9/partners` and `/lumi9/community` rendered in full for
a Lumi9 admin, complete with the console shell, while the nav dutifully hid the
links. The API half was worse: `wall` and `partners` had no gate either, and
every `thara` route gated on `isTharaEnabled()`, a GLOBAL env flag — so one
console serving both brands means the day Thara is switched on for Femi9, every
Thara endpoint starts answering for Lumi9. `infra/terraform/variables.tf` still
documented the opposite ("Lumi9's brand config does not include the module, so
the console 404s it there regardless of this"), which was simply untrue.

**A client page gets its gate from a server `layout.tsx` in the same segment**,
calling `requireConsole(brand, '<module>')` and rendering `{children}`. Nine of
those exist now, one per client-rendered section. `test/unit/route-module-gates.test.ts`
is what keeps them: it derives the set of modules at least one brand lacks and
fails if any page or API route for one of them is ungated, and it fails on a
route directory nobody has classified.

⚠️ **Modules diverge in BOTH directions now.** Lumi9's list used to be Femi9's
with things removed, and `module-gating.test.ts` asserted exactly that. It is no
longer true: `parenting` is **Lumi9-only**, because `/parenting-tools` is a
storefront surface Femi9 does not have. The test asserts the stronger invariant
instead — every listed module is classified `FEMI9_ONLY` / `LUMI9_ONLY` /
`SHARED`, and the three cover `ADMIN_MODULES` exactly. Do not reinstate the
subset assertion.

**A CLIENT page needs a server segment layout to be gated at all.** `requireConsole`
takes a module name, but a client component cannot call it — so `/[brand]/parenting`
carries a `layout.tsx` whose only job is `requireConsole(brand, 'parenting')`.
Any interactive section added the same way needs the same wrapper, or the module
list gates its nav link and nothing else.

**3. A role is enforced by the API, not by the nav.**
`requireConsoleApi(brand, minRole)` takes the minimum role for the operation:
reads pass `readonly` (the default), ordinary writes `support`, anything that
moves money or changes who can do what `manager`. This was decorative for a long
time — `create-admin` issued four roles and `hasAtLeast()` existed to compare
them, and NOTHING called it, so a `readonly` account could refund an order,
rewrite a price and change a customer's account role. Adding a route means
choosing its tier.

Unlike `hasModule`, an insufficient role is **403, not 404** — the opposite call,
deliberately. Hiding Thara from Lumi9's staff hides a programme they should not
know exists; hiding "refund" from a support agent hides a button they can already
see, in a console they are legitimately signed into.

**4. Every way of failing to sign in looks the same.**
Wrong password, unknown email, disabled account, and a valid password for a
brand you hold no role in all return the identical 401 with the identical
message. The not-found path also spends the same time a real verify costs
(`fakeVerify`), because microseconds-versus-100ms enumerates your staff. Do not
add a friendlier message.

## Layout

```
proxy.ts                      route guard (Node runtime — see below)
app/
  layout.tsx                  imports ALL THREE global sheets — see above
  login/                      page.tsx + LoginCard.tsx (the brand toggle)
  api/auth/login|logout/      sign in / sign out, per brand
  [brand]/(panel)/            16 console sections — 15 moved from the storefront,
                              plus `parenting`, which is new and Lumi9-only
    layout.tsx                server half: guard + nav built from the brand's
                              module list
    _shell.tsx                the `.adm` markup; client only for the mobile
                              drawer's open bit
    _nav.tsx                  active-route link + one icon per module
  [brand]/api/                34 route handlers — 31 moved from /api/admin, plus
                              the three under api/parenting/
src/lib/
  guard.ts                    requireConsole(brand, module?) — call it in EVERY page
  api-guard.ts                requireConsoleApi(brand, minRole?) — EVERY route
  audit.ts                    auditConsole(session, req, action, …) — after a write
  safe-next.ts                validates ?next= before it reaches a Location header
src/charts/ src/components/ src/styles/   moved with the pages
test/unit/                    identity · redirect safety · module gating
```

Client components get the brand from `useParams()`, and call
`` `/${brand}/api/…` `` — never a bare `/api/admin/…`, which no longer exists
anywhere.

## Why `proxy.ts` and not `middleware.ts`

Next 16 renamed the convention, and `proxy` runs on the **Node** runtime. That is
the point: it can import the real `verifyAdminSession` from
`@femi9/core/admin-session`. Femi9's storefront still uses `middleware.ts`
because it is written for the edge runtime, and pays for that by re-implementing
JWT verification inline — the same check written twice, where changing one means
remembering the other. This app has one verifier.

The guard is still the *first* gate, not the only one. Pages re-check via
`requireConsole` because a matcher is a routing rule, not an authorisation: a
rewrite or a route added outside the pattern would silently unguard a page.

## Sessions

One cookie per brand (`f9_admin_femi9`, `f9_admin_lumi9`) and a brand-specific
JWT audience. So Femi9 in one tab and Lumi9 in another do not overwrite each
other, and a cookie copied between consoles is inert. Sessions last 8 hours —
short, because this console can refund money.

## Passwords

scrypt from `node:crypto`, in `@femi9/core/admin-password`. Not argon2id, and
that is deliberate: every argon2 binding for Node is native, this image is
Alpine built from a workspace root, and a prebuilt that resolves to the wrong
libc is a deploy failure on the one endpoint that must never be down. The
encoded hash names its own algorithm and cost, so argon2id can be adopted later
and old hashes upgraded on next sign-in via `needsRehash`.

## Creating an admin

There is no self-service sign-up, and there should not be.

```bash
DATABASE_URL_PLATFORM=... ADMIN_SEED_PASSWORD='at least twelve chars' \
  npm run create-admin --workspace @femi9/db-platform -- \
  --email priya@company.com --name "Priya" --brand femi9 --role owner
```

Re-running for the same email grants an additional brand and does **not** reset
the password. Roles: `owner` · `manager` · `support` · `readonly`
(`hasAtLeast()` compares them).

## Commands

```bash
npm run dev:admin                 # from the repo root, :3002
npm run typecheck --workspace admin-web
TEST_PLATFORM_DATABASE_URL="postgresql://USER:PASS@127.0.0.1:5432/femi9_platform_test?schema=public" npx vitest run
```

The platform test database is separate from the brand one. Push the schema with
`npm run push --workspace @femi9/db-platform` pointed at it first.

## Running the tests

They need a platform database AND both brand schemas, because the isolation
suite checks that one brand's console cannot reach the other's data:

```bash
psql -c 'CREATE DATABASE femi9_twobrand'
psql -d femi9_twobrand -c 'CREATE SCHEMA femi9; CREATE SCHEMA lumi9;'
# migrate packages/db once per schema, then seed each app's own catalogue
TEST_PLATFORM_DATABASE_URL=... TEST_FEMI9_DATABASE_URL=... TEST_LUMI9_DATABASE_URL=... npx vitest run
```

CI does exactly this — see the `admin` job.

## Deploying

`Dockerfile` here, built from the WORKSPACE ROOT. It is the only image that runs
`prisma generate` TWICE — the brand client to the default node_modules path, the
platform client to `packages/db-platform/generated/`, because two generators
aimed at the default path overwrite each other.

The runner stage copies `packages/` as well as `node_modules`. That is required,
not merely tidy: npm links each workspace into node_modules as a SYMLINK, and
the platform Prisma client is only reachable through
`node_modules/@femi9/db-platform` -> `packages/db-platform/generated/`. Without
it the console starts and then 500s on the first login attempt.

`docker-entrypoint.sh` migrates ONLY the `platform` schema. It reads both
brands' data but must not migrate their schemas — two services applying the same
history to the same schema race, and the winner depends on task start order.

It also does NOT seed a bootstrap admin, deliberately: seeding one from
environment variables would put a working credential in the task definition and
in CloudWatch's environment dump. The first account is made with a one-off task
running `create-admin` — see above.

## The audit log

`AdminAuditLog` recorded exactly two things for a long time: `admin.login` and
`admin.login.failed`. So it could tell you somebody signed in and nothing at all
about what they did next, in a console that refunds money. When a refund is
disputed weeks later, "who issued it" had no answer anywhere in the system.

`auditConsole()` in `src/lib/audit.ts` is called AFTER a successful write —
never before, because a log line for an action that then failed is read as fact.
Covered today: `order.refund`, `order.status`, `customer.adjust-points`,
`customer.change-role`, `settings.update`, `product.create|update|archive`,
`coupon.update|toggle|delete`, `pricing-zone.update|delete`.

Keep customer data out of `target` and `meta`. This table lives in the `platform`
schema, which a wider set of people can read than one brand's customers.

## Things that will bite

**Changing an order's status MESSAGES THE CUSTOMER.** `updateOrderStatus` emails
on `shipped` and sends an approved WhatsApp template on `delivered` and
`cancelled` — so this console, not a storefront, is where those go out. It needs
`WHATSAPP_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` in its own task for that reason,
and Terraform gives it both.

Only a REAL transition sends: the status flip is an `updateMany` scoped to a
differing status, and the cancel path reports whether it actually claimed the
order, so an ops double-click cannot tell somebody twice that her order was
cancelled. `NotificationLog.dedupeKey` is the second line of defence, not the
first. There is no WhatsApp template for `shipped` — dispatch stays email-only,
and the delivered one must not be repurposed for it.

**Opening the ADDRESS CHANGE window messages her too**, and that is the only
thing that makes the grant do anything. The control renders on the customer's
own order page, behind a sign-in, on a page she has no reason to reopen after
paying — so before this, support opened a window nobody ever learned about and
the parcel sat unshippable. `setOrderAddressEditGrant` now sends on the way OPEN
only (a revoke has nothing to announce) and returns `notified`, which the order
screen renders. Three things about it are worth knowing before you touch it:
the WhatsApp half is inert until `WHATSAPP_ADDRESS_CHANGE_TEMPLATE` names an
approved template, so today most grants go out by email alone — and a phone-only
account has no email, which is the `unreachable` case that needs a phone call;
the link is built from the BRAND (`storefrontOrigin`) and never from
`NEXT_PUBLIC_SITE_URL`, because this console serves both brands from one
container; and a **guest order can never use the flow at all** — the edit is
scoped by `userId` and a guest checkout has no user row — so no message is sent
and `order_address_change_guest_order` is logged.

**Cancelling a PAID order does not return the money, and never did.** The
cancel path restores stock and gives the coupon back; it touches neither the
gateway nor the `Payment` row. `refundOrder`'s guard was `status === 'paid'`
and the Refund button was drawn on `current === 'paid'`, so once an operator
picked "cancelled" on a paid order the money was stranded — unreturnable
through this console, on an order whose books already said the sale was
reversed, with the customer still holding her loyalty points and the creator
still holding the commission. Recovering it meant a refund by hand in the
Razorpay dashboard plus a database correction, and nothing said so anywhere.

`refundableFrom()` in `services/admin/orders.ts` is now the ONE definition of
what may be refunded — `paid`, or `cancelled` while a payment reached capture —
and `OrderDetail.refundable` is what draws the button, so the control and the
service cannot disagree again. Two things about it: a refund from `cancelled`
must NOT restore stock (the cancel already did), which is why
`reverseBooksForRefund` takes the origin status rather than inferring it; and a
cancelled order counts a `refunded` payment as still-refundable, because that is
the resume marker for a refund that died after the money went back.

**A refund taken in the Razorpay DASHBOARD now reaches the database.**
`refund.processed` → `recordGatewayRefund`, from both storefront webhooks. It
was unhandled, so such a refund left the order `paid`, the payment `captured`,
the points unreversed and every sales figure counting a reversed sale — with
nothing wrong on any screen. It books a reversal only from the two states the
console itself can refund from; for a `processing`/`shipped`/`delivered` order it
marks the payment refunded, logs loudly and leaves the rest for a human, because
whether the goods can come back is not something a webhook payload knows.
**Subscribe the endpoint to `refund.processed`** or none of this fires.

**The platform Prisma client has a custom output path** (`generated/`, gitignored).
Two generators writing to `node_modules/@prisma/client` would overwrite each
other, so the brand client keeps the default and this one does not. Any fresh
clone or Docker build must run `prisma generate` for **both** packages.

**Turbopack warns "Dynamic filesystem access causes tracing of the whole
project"** on build. That is Prisma's engine loader, not a defect.

**The LAUNCH POPUP is Lumi9's, and the console says so.** Settings → Launch
popup writes ONE Json `Setting` row (`launchPopup`: enabled · image · seconds ·
alt) that `apps/lumi9-web`'s root layout reads. Femi9's storefront has no such
surface, so `BrandConfig.launchPopup` is false there — the card is hidden AND
the route refuses the field, the same pair `featuredSlots: 0` uses. Turning it
on for Femi9 means building the component in that app first; the flag follows
the storefront, it does not create it.

**The upload route accepts GIF, and gives it 8MB.** Every other type stays at
5MB. A promo animation is routinely 2-3MB where the same frame as a still is
200KB, and that is the format working, not a careless original. The size check
is two-stage on purpose: the largest allowance guards what is buffered into
memory, and the per-type limit is applied only AFTER the magic-number sniff, so
a caller cannot claim `.gif` to buy the bigger ceiling.

**`/uploads` is out of `proxy.ts`'s matcher.** It has to be for the same reason
`/api/health` is — the guard reads the first path segment as a brand and `uploads`
is not one — and in DEV it is load-bearing: the upload route's disk branch writes
under THIS app's `public/`, so the console is the only server that can hand a
locally uploaded image back to a storefront. `apps/lumi9-web`'s `/uploads/*`
rewrite points here in development for the same reason (it used to point at
itself, where the file has never been). In production the bytes are in S3 and
CloudFront already serves that prefix to anonymous visitors.

**Product images are UPLOADED, never typed.** The product form's free-text
"Image URL" rows are gone; both it and the blog cover field are upload buttons
over `/<brand>/api/upload`, which sniffs the magic number (so a spoofed
`.svg`/`.html` cannot be stored and served as active content from our own origin)
and writes to the private S3 bucket CloudFront reads through OAC. `isManagedImageUrl`
in `@femi9/core/image-url` is the enforcement — the schemas reject anything that
is not `/uploads/…`, `/assets/…` or a Cloudinary URL, because a form is not an
authorisation boundary. `/assets/` is allowed because both brands' seeds write
those paths, and rejecting them would make every seeded product unsaveable.

**A brand sells only some product types.** `brandConfig(brand).productTypes`
drives the form's options AND the product routes reject anything outside it. The
`ProductType` enum is shared across brands, so without that check a request could
file a diaper under Femi9. Femi9's vocabulary was baked into four layers before
Lumi9 existed — the Prisma enum, the Zod schema, the form, and `InventoryRow` —
so expect to find more of it.

**This app must build with no database credentials.** The Docker build stage has
none — they arrive at deploy time from Secrets Manager. `platformDb()` is called
inside request handlers, never at module scope, and it must stay that way.

**`/api/health` is excluded from the matcher in `proxy.ts`.** It has to be: the
guard reads the first path segment as a brand, `api` is not one, and the probe
would 404 — pulling every task out of the target group. It returns whether a
connection opened and nothing else: no admin names, no brand totals, no secret
values.

**This app imports `@aws-sdk/client-s3` and must declare it.** It did not, and
the image build stopped there. Shared source in `@femi9/core` becomes this app's
imports too — the root `npm install` hides that, and `npm ci --workspace
admin-web` in the image does not.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
