# CLAUDE.md — femi9-platform

Workspace root. Two consumer brands, one shared backend.

## The map

```
apps/
  femi9-web/    Femi9 storefront + account + (for now) the ops console.
                Next 15.5 · hand-written CSS · Prisma/Postgres · LIVE.
                Has its own CLAUDE.md — read it before touching this app.
  lumi9-web/    Lumi9 storefront. Next 16.3 · Tailwind v4. Has its own CLAUDE.md.
                Catalogue, cart, checkout, account, JOURNAL, REVIEWS and the
                PARENTING TOOLS all run on the shared backend — src/lib/journal.ts,
                src/lib/immunisation-schedule.data.ts and the review arrays in
                src/lib/content.ts are SEED INPUT now, not what a page reads.
                Marketing chrome (hero stats, USPs, the layer diagram, the site
                FAQ, legal copy) is still modules: no table models it and no
                console page owns it.
                It owns the site's SEO layer: src/lib/seo.ts, sitemap, robots
                and the JSON-LD. Femi9 has none of that yet.
  admin/        ONE console, both brands. :3002. Has its own CLAUDE.md.
                Brand comes from the SESSION, never the URL segment.
                Holds ALL the ops pages and APIs — femi9-web has none.
                ⚠️ Lumi9's module list is NOT a subset of Femi9's any more:
                `parenting` is Lumi9-only, because Femi9 has no such storefront
                page. Modules diverge in BOTH directions now.
packages/
  db/           @femi9/db — the shared Prisma schema and `dbFor(brand)`.
                One schema, one client per brand. Seeds are NOT here: seed data
                is brand-specific and lives with each app.
  db-platform/  @femi9/db-platform — admin identity in its OWN schema, which
                neither brand's client can reach. Generates to `generated/`
                (gitignored) because the brand client owns the default output.
  core/         @femi9/core — the shared backend. 64 modules: the whole
                service layer, auth, Razorpay, pricing, geo, OTP, Thara.
                Import by SUBPATH, never from a barrel:
                  import { requireAdmin } from '@femi9/core/admin-auth'
                  import { getOrders } from '@femi9/core/services/admin/orders'
```

Everything else at this root is **dead**: `femi9-app/`, `femi9-react/`,
`femi9-scrool/`, `femi9-lavender/`, `index.html`, `app.js`, `styles.css`,
`assets/`, `Images/`. Superseded by `apps/femi9-web`. Never read them for
patterns, never edit them. The PDFs are product docs and are worth consulting.

## Where the plan lives

`apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md` is the agreed design and the
phase list. Read it before any structural work. The short version:

- Separate domains, **fully separate customer bases** (no shared `User`).
- "One backend" means **one shared `packages/core`**, not an extracted API
  service — App Router server components read Postgres directly and must keep
  doing so.
- **One Postgres, three schemas**: `femi9` · `lumi9` · `platform`. Isolation
  lives in the connection string, so a brand cannot read another's rows.
- The admin console picks its brand with a **segmented toggle on the login
  form**. That toggle is untrusted client input — `AdminBrandRole` decides.

## Database access

```ts
import { dbFor, isBrand, type Brand } from '@femi9/db'
const db = dbFor('femi9')
```

Isolation lives in the **connection string**, not in a `where` clause somebody
can forget — each brand's client is bound to its own Postgres schema. `isBrand()`
has no default: narrow untrusted input through it, and take brand from the
session or the host, never from a request body.

`DATABASE_URL` still works for Femi9 as a transitional fallback — the live data
is in `public` and Phase 2 does the rename. Lumi9 has no fallback on purpose.

## Commands

```bash
npm install          # ALWAYS here. One hoisted lockfile; apps have none.
npm run dev:femi9    # :3000
npm run dev:lumi9    # :3001
npm run dev:admin    # :3002
npm run build        # turbo — both apps
npm run typecheck
```

`npm ci` only works at this root. There is no app-level `package-lock.json`.

## Things that will bite

**Docker builds from THIS directory**, not from the app:
```bash
docker build -f apps/femi9-web/Dockerfile -t femi9-web .
docker build -f apps/lumi9-web/Dockerfile -t lumi9-web .
docker build -f apps/admin/Dockerfile     -t admin-web .
```
The context must be the workspace root because `npm ci` needs the hoisted
lockfile. `.dockerignore` here is load-bearing — it is what keeps `.env`, the
legacy prototypes and the other brand's source out of the image.

**Each app brings its OWN ignore file.** BuildKit prefers
`<dockerfile>.dockerignore` over the context root's, so
`apps/lumi9-web/Dockerfile.dockerignore` and `apps/admin/Dockerfile.dockerignore`
govern those builds. They have to: the root file excludes `apps/lumi9-web/**`,
and a Lumi9 build under it produces an image with no application in it. femi9-web
has no such file and still reads the root one — deliberately, so its context is
unchanged. Add a new app, add its ignore file.

**Never flatten the standalone bundle.** All three images run from
`/app/apps/<app>`, keeping the layout `next build` emitted. Turbopack writes its
externalised server packages into `<app>/.next/node_modules` as RELATIVE
symlinks counted from that exact depth — `@prisma/client-<hash> ->
../../../../../node_modules/@prisma/client`. Move the bundle and every one of
them dangles: the image builds, starts, and then 500s on every route, or dies on
its instrumentation hook. Nothing in the build says so. Femi9's image flattened
for years, correctly, until Next 16 and Turbopack made it wrong.

**Nothing in an image is relocated to a tidier path either.** `create-admin.ts`
imports the package it lives in as `../src/index`, and `seed.ts` reads
`../src/lib/catalog`. Both broke when copied somewhere neater, and both failures
land on a one-off task — after the image has deployed and passed every health
check. `packages/` is in each image at its workspace path; reach scripts there.

**`packages/core` declares what it IMPORTS.** It used to declare only `jose` and
let everything else resolve out of femi9-web's hoisted tree, which is invisible
at this root — one `npm install` here satisfies everyone. `npm ci --workspace
lumi9-web` installs only that workspace's closure, and the Lumi9 image build died
on `@aws-sdk/client-dynamodb` and `maxmind`. If you import something new in
`core`, add it to `packages/core/package.json`.

**`@sentry/nextjs` is an OPTIONAL peer of core, imported dynamically.** Only
femi9-web ships it. Making it a hard dependency put Sentry's
`require-in-the-middle` instrumentation into every image, Turbopack externalised
it under a generated name the standalone bundle could not resolve, and **every
route in the Lumi9 image answered 500** — a failure that appears only when you
RUN the container, never when you build it. Same shape as `maxmind` in
`geo/mmdb.ts`: dynamic import, degrade quietly when absent.

**`three` must stay single-versioned across the workspace.** Two copies gives
`@react-three/fiber` one `PerspectiveCamera` type and an app another, and casts
between them fail to compile. femi9-web declares the 3D stack but imports none
of it; its versions exist only to match lumi9-web.

**Both apps are pinned to Next 16.3.1 exactly**, so `next` hoists to a single
copy. Keep them in lockstep — a version split un-hoists Next and reintroduces
the dual-`three` class of type clash.

**Turbo needs `packageManager` in the root package.json.** Without it every
`turbo run` fails with "Could not resolve workspace". Turborepo also collects
anonymous telemetry by default; set `TURBO_TELEMETRY_DISABLED=1` to opt out.

**femi9-web still uses the `middleware` file convention**, which Next 16
deprecates in favour of `proxy`. It is kept deliberately: `proxy` runs on the
Node runtime only, and this middleware is hand-written to be edge-compatible.
Every build prints a deprecation warning until that decision is revisited.

**`apps/femi9-web/.github/workflows/deploy.yml` is inert.** GitHub only runs
workflows from `<repo>/.github/workflows`. It has never executed. The two that
DO run are `ci.yml` and `deploy-staging.yml` at this root.

**Phone sign-in is delivered over WhatsApp, and NOTHING falls back to SMS.**
`requestOtp` posts an approved Cloud API template (`signup_otp` for a number
with no account, `login_otp` for one that has) and throws when Meta will not
take it, so the route answers 503 rather than leaving a shopper on a code screen
with no code coming. `sendSms` still exists in `packages/core/src/otp.ts` — it
is the reward-code path (`sendTextSms`) and nothing else. Anything asking
`smsConfigured()` in order to decide whether phone sign-in is available is
asking the wrong question; ask `whatsappConfigured(brand)`.

**There are FIVE approved WhatsApp templates and no sixth.** Meta accepts
nothing but a pre-approved template outside a 24-hour service window, and a name
that does not exist on the WABA fails with a 132001 that reads exactly like an
outage. `packages/core/src/whatsapp.ts` lists them with their ids; the copy is
fixed and only the variables change. That is why **dispatch is still email-only**
— there is no `shipped` template, and the delivered one says the order "has
been" completed. A new message means getting a new template approved first.

Two things about sending one are easy to get wrong. A body parameter containing
a **newline** (or a tab, or four spaces) fails the whole message — `templateParam`
collapses whitespace for that reason, and it is why the order line-item list goes
out semicolon-separated rather than laid out like the email. And the **language
code must match what the template was approved under**: a wrong `en` / `en_US`
fails identically to a missing template.

**A phone-only account gets no email and never has.** `order.user.email` is null
for every OTP signup, so `sendOrderStatusEmail` returns without sending and the
customer heard nothing after paying. `order-whatsapp.ts` is what reaches her —
which is why it falls back to the SHIPPING ADDRESS phone where `order-mail.ts`
deliberately refuses to fall back to the shipping address. Both are keyed on
`NotificationLog.dedupeKey`, because the webhook, the verify call and the
reconcile cron all race to mark one order paid.

**One mail transport, two providers, chosen PER BRAND.**
`packages/core/src/mailer.ts` is the only place a transactional email leaves the
platform — `otp.ts`, `services/notifications.ts` and `thara/invite.ts` all go
through it. Lumi9 sends through **Amazon SES** (`no-reply@lumi9.in`, identity and
IAM in `infra/terraform/ses.tf`); Femi9 is live on **Resend** and stays there.

`MAIL_PROVIDER_<BRAND>` is STATED, never inferred, and that is load-bearing: the
Lumi9 task carries the shared `RESEND_API_KEY` (Femi9's account), so "use
whichever credential is present" sends Lumi9's sign-in links through Femi9's
Resend account from a domain it has not verified. `mail-identity.ts` is the only
module that decides this.

SES has **no API key** — the task role is the credential, and the policy pins
`ses:FromAddress`, so an `EMAIL_FROM` that Terraform does not know about fails
with `AccessDenied` rather than sending as something unauthorised. Two failures
live outside the code: an identity whose DKIM records are not in DNS rejects
every send, and an account still in the **SES sandbox** refuses every recipient
it has not individually verified. Neither is visible from the app.

**A send is not a delivery.** SES reports bounces and complaints through SNS, not
a signed webhook: `/api/webhooks/ses` verifies the SNS signature, the signing
certificate's host AND the topic ARN (a valid AWS signature only proves AWS sent
it, not that it is ours), then writes the outcome onto the `NotificationLog` row.
Suppression is left to SES's own account-level list — a second list here that
disagreed with it would be worse than none.

**`npm test` in femi9-web truncates every table.** Never run it against a `.env`
pointing at staging or production. Both suites are safe against local scratch
databases — see each app's CLAUDE.md.

**Two Prisma generators, two output paths.** A fresh clone or Docker build must
run `prisma generate` for `@femi9/db` AND `@femi9/db-platform`; the second uses
a package-local `generated/` directory so the two do not overwrite each other.

**One schema per brand, migrated from the same history.** `prisma migrate deploy`
runs once per brand database. `packages/db` is the only schema; a brand simply
never uses the other's enum values.

**The `public` → `femi9` schema rename has NOT been run** against the live
database. Femi9 still reads `DATABASE_URL`. See
`apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md` and `docs/rename-public-to-femi9.sql`.

## Deploying

Two Terraform stacks, and they do not overlap:

| | |
| --- | --- |
| `apps/femi9-web/infra/terraform` | The single-app stack **running today**. One service. Deployed by `.github/workflows/deploy-staging.yml`. Untouched by the platform work. |
| `infra/terraform` | The **platform** stack: all three services, one Aurora cluster, three schemas. Deployed by `.github/workflows/deploy-platform.yml` on a push to `lumi9`. |

**`lumi9` is the deploy branch, not `master`.** `deploy-staging.yml` used to fire
on master and is now manual-only — master is many commits behind, and leaving it
armed meant any incidental commit there would redeploy a stale Femi9 over the
top of whatever the platform had just shipped, from a different image against a
different database, with both runs reporting success. CI gates `lumi9` too.

**A SITE is a hostname; an APP is an ECS service, and they are not
one-to-one.** The console answers on `admin.femi9.in` AND `admin.lumi9.in`, so
each brand's staff sign in on their own domain — four hostnames, three services.
`var.sites` in the platform stack maps one to the other, and each site gets its
own CloudFront distribution because a distribution carries one certificate and
those two hostnames are on different registrable domains.

Read `infra/terraform/README.md` before applying anything. It has the ordering
constraints (repos before images before services before seeds), the two-region
certificate trap, and what is deliberately absent.

**Each app migrates exactly the schema it fronts**, from its own entrypoint:
femi9-web owns `femi9`, lumi9-web owns `lumi9`, admin owns `platform`. One
writer per schema. Letting the console migrate the brand schemas too would race
two services applying the same history, and which won would depend on task start
order.

**Every app now serves `/api/health`, and all three fail closed** (503 when the
database is unreachable). That is what makes a bad rollout stall with the old
tasks still serving. The console's is excluded from the guard in `proxy.ts`,
because a load balancer has no session and never will.

**The scheduled jobs live in `infra/terraform/cron.tf`.** EventBridge rule →
API Destination → the app's own `/api/cron/*` route, authenticated by
`CRON_SECRET` in an `x-cron-secret` header (`@femi9/core/cron-auth` compares it
in constant time and treats Terraform's `TODO-` placeholder as unset). Four jobs
for Femi9, two for Lumi9.

Two things about it are worth knowing before you touch it. **Setting the real
secret out of band does not reach the EventBridge connection** — the connection
holds the value, not a reference, so `put-secret-value` must be followed by
`terraform apply` or every scheduled call presents the placeholder and is
refused. And **an unscheduled cron fails silently and expensively**: without
`renew-subscriptions` a subscription ships one box and then nothing forever,
while the customer's account page keeps showing a next-delivery date; without
`reconcile` an order whose webhook was missed sits `pending` indefinitely,
holding its stock, with the money already taken. Nothing on any dashboard looks
wrong in either case. The health probes report a missing `CRON_SECRET` as a
warning for that reason, and failed runs land in the `cron_dead_letter_queue`
output — an empty queue is the healthy state.
