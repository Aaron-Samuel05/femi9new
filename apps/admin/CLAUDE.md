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
  [brand]/(panel)/            15 console sections, moved from the storefront
    layout.tsx                server half: guard + nav built from the brand's
                              module list
    _shell.tsx                the `.adm` markup; client only for the mobile
                              drawer's open bit
    _nav.tsx                  active-route link + one icon per module
  [brand]/api/                31 route handlers, moved from /api/admin
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

**The platform Prisma client has a custom output path** (`generated/`, gitignored).
Two generators writing to `node_modules/@prisma/client` would overwrite each
other, so the brand client keeps the default and this one does not. Any fresh
clone or Docker build must run `prisma generate` for **both** packages.

**Turbopack warns "Dynamic filesystem access causes tracing of the whole
project"** on build. That is Prisma's engine loader, not a defect.

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
