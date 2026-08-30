# CLAUDE.md — Lumi9 web (`apps/lumi9-web`)

Lumi9 ("Cloud Soft") — baby diapers. Next 16 · React 19 · **Tailwind v4** ·
react-three-fiber for the mascot. Runs on `:3001`.

## Where this app is in the migration

**This storefront runs on the shared backend.** Catalogue, cart, sign-in,
checkout and account are all real; `src/lib/content.ts` still supplies marketing
copy and the loyalty stats.

**The CATALOGUE comes from the database.** `src/lib/catalog.ts` is the seed's
input, not the storefront's source: a server loader reads the `lumi9` schema and
a provider hands it to client components. Cart, checkout and auth are still
local — those are the rest of Phase 4.

So right now:

| | |
| --- | --- |
| Catalogue in the database | ✅ 5 sizes · 12 pack variants · price zones |
| Manageable in the console | ✅ `/lumi9/products` |
| **Read by THIS app** | ✅ **live — a console price change shows without a rebuild** |
| Cart | ✅ server-side, in `lumi9.Cart`, priced by the server, **opens in a drawer** |
| Sign-in | ✅ **phone OTP (primary) · Google · emailed link** — no passwords on this platform |
| Onboarding | ✅ `/welcome` captures name + email + verified mobile |
| Checkout + payment | ✅ real orders (`LM-00001`), Razorpay, brand-routed webhook |
| Checkout prefill | ✅ signed-in shoppers get their saved name, contact and address |
| Account orders | ✅ real, with an order page at `/order/[orderNo]` |
| Account profile + addresses | ✅ editable — name, email, mobile, full address CRUD |
| Coupons | ✅ the cart's promo box validates against the real `Coupon` rows |
| Subscriptions | ✅ real plans, skip/pause/resume/cancel, renewed by a scheduled job |
| Newsletter + contact | ✅ persisted / delivered — both used to discard the input |
| Journal | ⛔ still `src/lib/journal.ts`, not the database — see below |
| Testimonials + ABOUT_STATS | ⛔ invented copy in `src/lib/content.ts`, kept by decision |

## How the catalogue reaches the page

```
lumi9 schema ──▶ getCatalog('lumi9')      @femi9/core, brand-agnostic rows
             ──▶ loadCatalog()            catalog.server.ts — maps to Lumi9's shape
             ──▶ <CatalogProvider>        root layout, ONE query per request
             ──▶ useCatalogData()         every client component
```

`useCatalogData()` returns the sizes AND `getSize` / `getSizeOrDefault` as plain
closures, deliberately — those are called inside event handlers and `useMemo`
bodies, where a hook cannot go.

**The whole tree is `force-dynamic`.** Two reasons, and the second is the one
that bites: a console price change must not wait for a rebuild, and the Docker
build stage has NO database credentials. Prerendering the catalogue would make
the build require a database, which it cannot have. If SSR-per-request becomes
a cost, cache the read behind a tag the console invalidates — do not go back to
build-time data.

## Totals come from the server, never from this bundle

`/api/checkout/quote` prices the basket with the SAME `shippingFor()` and the
same coupon predicate that `placeOrder` charges with, and `useQuote()` in
`src/lib/quote.tsx` is the only thing on the client that knows what a basket
costs. Do not reintroduce a shipping calculation here.

It replaced two constants and a fiction. `lib/catalog.ts` carried its own ₹999
threshold and ₹49 fee, duplicating a rule `Settings.freeShipThreshold` owns —
so a console change moved what a shopper was CHARGED without moving what she was
SHOWN. And checkout offered "Express delivery ₹79", which existed in that file
and nowhere else: it added ₹79 to the on-screen total, was never sent to
`/api/checkout`, never reached an `Order` row, and never changed how the parcel
shipped. `FREE_SHIPPING_THRESHOLD` survives for the "free over ₹999" sentence in
marketing copy and for nothing else.

Same shape, same fix, for `subscribeSavePct`: the page promised a hardcoded 20%
while `generateDueOrders()` discounts renewals by the console's value (default
15). It rides along on the catalogue payload now — `useCatalogData()` returns it.

## The signed-in surface, and how a shopper reaches it

Femi9's storefront flow, on this app's tokens. Nothing about Femi9's palette or
its hand-written CSS came across — only the shape of the journey.

```
add to cart ──▶ CartUIProvider.openCart()   drawer opens BEFORE the request
            ──▶ POST /api/cart              server prices and stores the line
            ──▶ CartDrawer + Toast          what landed, or why it did not
            ──▶ /cart (promo box) ──▶ /checkout ──▶ /confirmation ──▶ /order/[no]
```

**Provider order in `app/layout.tsx` is load-bearing.** `SessionProvider` is
outermost and independent; `CartUIProvider` sits ABOVE `CartProvider` because
the cart calls the chrome ("open me", "say this") and never the reverse; the
drawer and toast are siblings of `children` INSIDE `CartQuoteProvider`, because
the drawer shows the server's total and the server's free-shipping threshold.

**The chrome state is deliberately NOT in `lib/cart.tsx`.** Femi9 keeps both in
one reducer, which is fine there because almost nothing subscribes to its cart.
Here `useCart()` is read by the quote provider, the checkout form and the nav
badge, and all four would re-render on a drawer toggle or a toast timer.

**`useSession()` is the ONE client-side answer to "who is this".** The session
cookie is httpOnly, so a client component can only ask the server; three
components each running their own `/api/auth/me` is three answers that can
disagree mid-render. `null` is the safe default — an unresolved or failed read
leaves the account control pointing at `/login`, which is the harmless wrong
answer. It is never an authorisation: every guarded surface re-reads the session
server-side.

**Cart writes report their failures.** `send()` used to catch every error and
return, so a 500 on "Add to cart", a dropped quantity change and a successful
write were the same thing from the shopper's side — nothing moved. It now
returns the cart or null, and the caller toasts.

**"Buy again" is SEQUENTIAL (`addMany`).** One POST per line fired concurrently
means each response carries a different snapshot of the same cart and the one
that lands LAST wins — not necessarily the one that saw every line. A three-line
reorder could leave the basket showing one item while the server held three.

**Every sign-in path mints a session before it knows who the shopper is.** OTP
writes a number, the magic link writes an address, Google writes a name and an
address but never a number. `/welcome` is what closes that, and
`missingProfileFields` in `@femi9/core` is the ONE definition of "complete" —
`/account`'s gate, `/welcome`'s field list, `/api/auth/me` and the OTP verify
response all read it, so the gate and the screen it gates cannot disagree and
strand somebody in a loop between them.

**A phone is never written unverified.** `/api/account/complete-profile` and
`PATCH /api/account/profile` both refuse: the first only STARTS the challenge,
the second answers 400 with `code: "phone_requires_verification"` and the panel
switches to the OTP step. That column is where a parcel and every delivery SMS
go.

**`IdentityConflictError`'s message names Femi9.** The shared class builds its
sentence eagerly in the constructor and Femi9's tests assert on that copy, so
the fix lives at this app's boundary: `src/lib/identity-copy.ts`. Never forward
`err.message` from it — forward `err.field` and render the sentence from there.

**`/order/[orderNo]` is authorised by token OR session, never by the URL alone.**
It shows a name, a full address and a phone number, and `LM-00042` is a guess
away from `LM-00041`. Either the unguessable `?t=` capability token (how a GUEST
reaches her own confirmation from the email) or a session that owns the order;
anything else gets the same `notFound()` a non-existent order gets, so the page
never confirms whether an order number is real. It is deliberately absent from
`proxy.ts`'s matcher for that reason — guarding it would lock guests out of
their own receipts.

**Apple sign-in was REMOVED, not left inert.** It was a `<button>` with no
handler beside a Google one that also had none. Sign in with Apple needs a
developer team, a Services ID, a key and a server-side client secret that
expires every six months — a project, not a button, and a dead control that
looks live costs more trust than an absent one.

## Subscriptions

Real, on the shared service Femi9 already used. `/subscription` builds a plan and
POSTs it to `/api/subscriptions`; `/account?tab=subscription` skips, pauses,
resumes and cancels through `/api/subscriptions/[id]`; renewals are generated by
`/api/cron/renew-subscriptions`, scheduled from `infra/terraform/cron.tf`.

**`Cadence` rows must be seeded into the `lumi9` schema or every subscribe is a
400.** `CADENCES` in `src/lib/catalog.ts` is the single source: `prisma/seed.ts`
writes a row per entry and the box builder posts the `code` back. Lumi9's codes
(`2w`/`4w`/`6w`) are its own — Femi9's are period-cycle shaped, and the two
brands' rows live in separate schemas.

**The renewal job is what makes a subscription a subscription.** Without
`CRON_SECRET` set AND the EventBridge rule applied, a plan ships one box and then
nothing, forever, while the account page keeps showing a next-delivery date. The
health probe reports a missing `CRON_SECRET` as a warning for exactly that
reason — nothing else about the site looks wrong.

## The Journal, and where SEO lives

`/journal` and `/journal/[slug]` are Lumi9's blog. They follow Femi9's blog
layout — hero, featured mosaic, category chips over a filtered grid, then an
article page of cover + body + FAQ + related reads — rebuilt on this app's
Tailwind tokens rather than Femi9's hand-written CSS.

**The posts are in `src/lib/journal.ts`, not the database.** Femi9's journal
reads `@femi9/core/services/blog`, which is brand-agnostic and would work here
with `listPosts('lumi9')`. It is not wired up yet because the storefront would
then show nothing until somebody seeded the `lumi9` schema. The module's shape
mirrors `BlogPostDTO` deliberately, and its loaders carry the same names
(`listPosts` / `getPost` / `listCategories` / `relatedPosts`), so moving to the
database is a change of import in two pages and a delete of one array.

The fields the DTO has no column for — `metaTitle`, `keywords`, `faqs`,
`imageAlt` — drive `<head>` and JSON-LD, not the card. A DB migration that adds
the journal will need them too.

**Body blocks are a tiny markdown subset**, rendered by
`components/journal/ArticleBody.tsx`: `## `, `### `, `> `, `• ` and `1. ` lists,
plus inline `**bold**` and `[label](href)`. A list is ONE block with embedded
newlines — the renderer splits it, because a `<p>` would let HTML whitespace
collapsing eat every separator. No HTML is ever interpreted.

**`src/lib/seo.ts` owns the origin.** Canonicals, Open Graph URLs, `sitemap.xml`,
`robots.txt` and every JSON-LD `@id` resolve through `SITE_URL`, so one variable
moves the whole site between staging and production.

```
SITE_URL=https://thelumi9.com     # server-only, read at RUNTIME
```

It is deliberately NOT a `NEXT_PUBLIC_` name. Next inlines every
`NEXT_PUBLIC_*` reference at build time and the Docker build stage has no deploy
configuration, so a public variable would bake whatever the build happened to
see into the image — and `robots.ts`'s staging guard could never fire. Nothing
in `seo.ts` is imported by a client component. `NEXT_PUBLIC_SITE_URL` is still
honoured as a fallback because the email-link verifier already reads it.

`CANONICAL_ORIGIN` in that file is the production domain from the SEO brief
(`thelumi9.com`). The Terraform examples still say `shop.lumi9.in`, and
`brandConfig('lumi9').host` says `lumi9.in` — three names for one site, and
**the domain is still undecided**. If it ships on anything but `thelumi9.com`,
change that one constant, or every canonical tag points at a domain that does
not serve the page.

Until then the mismatch is at least LOUD rather than silent: `noindexReason()`
in `seo.ts` explains it, `/api/health` reports it as a `NOT_INDEXABLE:` warning,
and the task logs it once at boot. It is a warning and never blocking — a
mis-set origin must not pull tasks out of the load balancer — but a site that
serves `noindex` to every crawler while working perfectly for every human is
otherwise indistinguishable from a healthy launch until Search Console is empty
weeks later.

**Any origin that is not `CANONICAL_ORIGIN` serves `Disallow: /` and `noindex`.**
Both, not either: robots.txt keeps a crawler out, and the meta tag is the only
thing that removes a URL already indexed — which a crawler can only read on a
page robots.txt let it fetch.

**FAQ answers must stay in the DOM.** `ui/Accordion` hides collapsed panels with
the `hidden` attribute instead of unmounting them, and the article FAQ is a
plain `<dl>`. FAQPage structured data whose answers a crawler cannot find in the
document is a manual-action risk, not a shortcut to a rich result. Whatever
replaces either component has to keep that property.

## The seeds

`prisma/` here holds **seed data only** — the schema and migrations are shared,
in `packages/db`. Seed data is brand-specific, which is why it lives with the app
(Femi9 does the same).

```bash
DATABASE_URL_LUMI9="postgresql://…/db?schema=lumi9" npm run db:seed
DATABASE_URL_LUMI9="…" npm run db:seed-zones
```

`prisma/seed.ts` reads `src/lib/catalog.ts` and writes one `Product` per size
with a `pack` variant per tier. Slugs (`cloud-soft-m`) and SKUs (`LUMI9-M-24`)
are stable, so reruns update in place rather than duplicating.

That module is the seed's **input** only — the storefront reads the database.
Editing it changes what a fresh seed writes and nothing that is already live.

## Deploying

`Dockerfile` here, built from the WORKSPACE ROOT:

```bash
docker build -f apps/lumi9-web/Dockerfile -t lumi9-web .
```

`Dockerfile.dockerignore` beside it governs that build — BuildKit prefers it
over the context root's, which is necessary because the root file excludes
`apps/lumi9-web/**` and would otherwise produce an image with no app in it.

`docker-entrypoint.sh` creates the `lumi9` schema if it is missing, applies the
shared migration history to it, then starts the server. It sets `DATABASE_URL`
for the migrate command ALONE and never exports it: `dbFor('femi9')` accepts a
bare `DATABASE_URL` as Femi9's transitional fallback, so exporting it inside
this image would let a stray Femi9 read quietly succeed against Lumi9's data.

The image carries the seed scripts under `./seed/` but does NOT run them. They
are launched as a one-off ECS task with the command overridden — see
`infra/terraform/README.md`.

`/api/health` fails closed: 503 when the `lumi9` schema is unreachable or
`AUTH_SECRET` is missing, 200 with a `warnings` array when only a feature is
switched off. That distinction is in `@femi9/core/brand-readiness`, and it
matters — a missing webhook secret must not pull the task out of the load
balancer and turn a degraded feature into an outage.

## Things that will bite

**⚠️ Google sign-in needs its OWN `GOOGLE_REDIRECT_URI` here, and the URI must
be registered on the OAuth client.** `@femi9/core/google-oauth` reads the three
`GOOGLE_*` variables straight out of the environment, and `GOOGLE_REDIRECT_URI`
is a single value that wins over everything else — Google compares it
byte-for-byte with what is registered. Both apps sharing one OAuth client is
fine; both inheriting one redirect URI is not. The local `.env` in this app
currently carries Femi9's, pointing at a CloudFront distribution, so the mock
path never fires (credentials ARE configured) and the live one dies at Google
with `redirect_uri_mismatch`. Set it to `https://<this app's host>/api/auth/google/callback`
and add that exact string to the client's authorised redirect URIs, or the
button reaches Google and bounces.

The handshake cookies are this app's own — `lumi9_oauth_state` /
`lumi9_oauth_next` in `src/lib/oauth-cookies.ts`, not core's `femi9_oauth_*`.
Same reasoning as `sessionCookieName`: separate hosts already isolate cookies,
and distinct names mean a Femi9 handshake cannot be completed as a Lumi9 one if
the two are ever served from one domain.

**`Product.flow` is Femi9's word.** It means "Heavy · Night + Day" over there;
there is no period flow on a diaper. Lumi9 uses the same column for what the
product is rated for (`7–12 kg · up to 12h dryness`). Renaming the column to
something brand-neutral is worth doing one day — it was not worth doing in the
same change that first filled it.

**Lumi9 sells `diaper`, and only that.** The `ProductType` enum is shared, but
`brandConfig('lumi9').productTypes` is `['diaper']`, the console's form renders
its options from that list, and the product routes reject anything outside it.
A shared enum without that check would happily file a sanitary pad under Lumi9.

**`three` must stay version-matched with femi9-web.** Two copies in the workspace
gives `@react-three/fiber` one `PerspectiveCamera` type and this app another, and
the casts in `src/components/three/` stop compiling.

**`SEED_DEMO_CART` in `src/lib/cart.tsx` is already `false`.** The README still
warns you to turn it off; that warning is stale. Leave it off — the cart screens
are reviewable by adding an item, and a basket pre-filled with phantom lines is
worse than an empty one now that the prices beside them are real.

**"Account" is not a nav LINK any more.** It was a static label pointing at
`/account` whether or not anybody was signed in, so a signed-out shopper who
tapped it was bounced to `/login` by the guard with no explanation — and it was
missing from `SUPPORT_LINKS` and the login page's own list entirely, which is
how `/account` and `/login` ended up reachable only by typing the URL. The
control in the bar resolves the session and points at the right one of the two;
a label that adapts cannot be a constant in an array. It renders on every
variant except `cta="none"`, deliberately: `cta` decides whether the bar SELLS,
and reaching your own orders is not a merchandising decision.

**The nav is ONE row below `md`, and `--nav-h` is load-bearing.** The links live
behind a burger in a slide-down sheet; the bar used to wrap them onto a second
scrolling line and stood 118px tall on a phone, fixed, over an 844px viewport.
`--nav-h` is published by the nav's ResizeObserver and is what `scroll-padding-top`
in `globals.css` offsets every in-page anchor by — so never add `scroll-mt-*` to
an anchor target as well, or it lands a whole screen too low.

**A `backdrop-filter` element is a backdrop root; nesting one inside it does
nothing.** The nav carries `backdrop-blur`, so the menu sheet's own blur sampled
the nav's (transparent) content rather than the page and the hero read straight
through the menu. The sheet is opaque for that reason. The same trap ate the
sheet's scrim: as a child of the nav its negative z-index put it behind that
backdrop root and it never painted at all — it is a SIBLING of the bar, at z-90.

**Nothing here may import a package this app does not declare.** `@femi9/core`
is shared source, not a built artifact, so its imports become this app's
imports. The image build is where that surfaces: `npm ci --workspace lumi9-web`
installs only this workspace's closure, unlike the root `npm install` that
makes everything look fine locally.
