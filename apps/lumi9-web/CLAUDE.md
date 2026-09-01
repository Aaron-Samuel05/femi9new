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
| Product photos | ✅ **from `ProductImage`** — the console uploads to S3; `packImage()` is only the fallback |
| Cart | ✅ server-side, in `lumi9.Cart`, priced by the server, **opens in a drawer** |
| Sign-in | ✅ **phone OTP (primary) · Google · emailed link** — no passwords; each method appears only where its provider is configured |
| Onboarding | ✅ `/welcome` captures name + email + verified mobile |
| Checkout + payment | ✅ real orders (`LM-00001`), Razorpay, brand-routed webhook · **sign-in required** |
| Checkout prefill | ✅ signed-in shoppers get their saved name, contact and address |
| Account orders | ✅ real, with an order page at `/order/[orderNo]` |
| Account profile + addresses | ✅ editable — name, email, mobile, full address CRUD |
| Coupons | ✅ the cart's promo box validates against the real `Coupon` rows |
| Subscriptions | ✅ real plans, skip/pause/resume/cancel, renewed by a scheduled job |
| Newsletter + contact | ✅ persisted / delivered — both used to discard the input |
| Journal | ✅ **in the `lumi9` schema** — editable at `/lumi9/content/blog` |
| Reviews (home rail + PDP) | ✅ **`Review` rows** — the console's moderation queue is the gate |
| PDP copy | ✅ `description` · `longDescription` · Key Benefits, all from the console |
| Parenting tools | ✅ **baby profile, vaccination schedule and care-plan leads all in the `lumi9` schema** — console page at `/lumi9/parenting` |
| Moments (home Instagram rail) | ⛔ `src/lib/moments.ts` — media is in S3, but the LIST is hand-written |
| Marketing chrome | ⛔ `src/lib/content.ts` — no table models it, no console page owns it |

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

**The photos come from the database too, and that is newer than the prices.**
Every surface used to call `packImage(size, count)` — `/assets/products/M-24.jpeg`,
a file baked into the container — so the console's image uploader wrote
`ProductImage` rows and pushed bytes into the S3 uploads bucket that this
storefront never read. Changing a product photo in the console changed nothing a
shopper saw, and nothing anywhere reported it: the page rendered a perfectly good
image, just not the one somebody had just uploaded.

`loadCatalog()` resolves it once, so no call site knows there is a fallback:

```
ProductImage (console upload → S3)  ──▶ pack.image / pack.imageAlt
  images[i] for tier i · images[0] when there are fewer · packImage() when none
```

Image `i` belongs to pack tier `i` — the order the seed writes and the order the
console's move-up/move-down buttons preserve. Anything beyond `packs.length` is
photography no tier owns, and the PDP gallery shows it as a view-only thumb;
dropping it would silently discard most of a six-image product.

**Do not call `packImage()` from a component.** It pins that surface back to a
file inside the image and makes a console upload invisible again. It survives for
`prisma/seed.ts` and for the one fallback in `catalog.server.ts`.

The thumb list is keyed by `variantId`, not by `src`: a product with fewer images
than tiers gives several tiers the same photo, and a src-keyed list collides and
marks all of them current at once.

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
shipped.

**Every sentence that quotes one of those numbers now reads it too.** That did
NOT used to be true, and the gap outlived the fix above by long enough to be
worth naming: the components were corrected and the COPY was not. `₹999` stayed
a literal in six places (the /shop hero and its meta description, the /cart line,
the PDP policy accordion and two site FAQ answers) and "save 20%" in two more —
so `/subscription` promised 20% in its hero and rendered the console's 15% in the
box builder eight hundred pixels below, on one screen, and the higher number was
the false one.

`src/lib/settings.server.ts` is where server-rendered copy gets them now
(`storefrontNumbers()`, React-`cache`d so it costs one query per request), the
client gets them from `useQuote()` and `useCatalogData()`, and `faqs()` /
`pdpPolicyAccordion()` in `content.ts` are FUNCTIONS of those numbers rather than
strings. `FREE_SHIPPING_THRESHOLD` survives only as the client-side fallback for
the first paint before a quote resolves.

The same sweep deleted a THIRD number that was never real: the site FAQ sold
"Express (1-2 days) is ₹79", a delivery tier checkout had already removed as a
fiction — so the help centre was advertising a service nobody could buy, as
FAQPage structured data.

**`LAUNCH_OFFER` in `content.ts` is `null`, and must stay null until a server
charges it.** It was `{ percent: 10 }` and nothing server-side had ever heard of
it, so every pack card on the HOME page — the main buying surface — led with a
price about 10% below what Razorpay took, struck the real price through beside
it and stamped "10% off" on the difference. A discount has to exist where money
is computed: drop the price in `/lumi9/products`, or make a coupon. See the note
on the constant, and `test/advertised-price.test.ts`, which fails if it comes
back.

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

**The login card offers only what the deployment can honour.**
`src/lib/auth-methods.ts` probes each provider — `GOOGLE_CLIENT_ID`,
`WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, and `mailConfigured('lumi9')` —
treating Terraform's `TODO-` values as unset, and `/login` renders only the
methods that pass. Configure a provider and its method appears; no code change,
no flag.

The email probe asks `mailConfigured`, not `RESEND_API_KEY`, and that
distinction is this brand's whole mail story. **Lumi9 sends through Amazon SES**
as `Lumi9 <no-reply@lumi9.in>`, reply-to `support@lumi9.in`; Femi9 is live on
Resend. `packages/core/src/mailer.ts` is the single transport and
`mail-identity.ts` picks the provider from `MAIL_PROVIDER_LUMI9` — stated, never
inferred, because this task also carries the SHARED `RESEND_API_KEY` (Femi9's
account) and a probe that found it would have offered an emailed sign-in link
sent from a domain that account has never verified.

SES has no key: the task role is the credential and the IAM policy pins the From
address. What can be wrong lives outside the app — DKIM records missing from the
`lumi9.in` zone (every send rejected), or the account still in the SES sandbox
(every recipient it has not individually verified refused). `terraform output
ses_identity_status` is where that is visible, not the health probe.

Bounces and complaints arrive at `/api/webhooks/ses` through SNS rather than as
a signed webhook, and land on the `NotificationLog` row so `sent` stops meaning
"we hope so".

The phone probe asks about **WhatsApp, not MSG91**. The OTP is delivered on an
approved WhatsApp template and there is no SMS fallback, so a deployment with a
live MSG91 key and no WhatsApp token would have offered a sign-in method that
mints a code and delivers it nowhere.

`AUTH_GOOGLE_ENABLED` / `AUTH_PHONE_ENABLED` / `AUTH_EMAIL_ENABLED` override the
probe, and ONLY the exact string `false` disables — a typo must not quietly
remove a sign-in method from a live storefront. They exist for what detection
cannot see: credentials that are present while the setup is still wrong, which
is exactly Google's situation locally. In Terraform they are
`var.lumi9_disabled_auth_methods`, which emits an entry per listed method and
nothing at all when empty.

**Turning off the last method is refused.** Checkout is gated behind sign-in
here, so no working method means nobody can buy — a full outage produced by a
config change, on a site that still looks healthy. When everything resolves to
off, the emailed link is forced back on and `/api/health` warns
`NO_AUTH_PROVIDER`. The probe belongs to a route handler as well as the page:
hiding a button is presentation, and `/api/auth/google` is a plain GET.

**⚠️ Checkout requires an account HERE and does not on Femi9.** This is the one
place the two brands deliberately diverge, so do not "align" it without asking.

The gate is enforced in **two** places and needs both. `proxy.ts` covers the
PAGE; `/api/checkout` re-checks and answers 401. For a long time only the first
existed, which made the whole decision one `fetch` away from irrelevant — a POST
straight to the route placed a real order, with a real order number and a real
payment intent, from no account at all. Worse than an anonymous order:
`placeOrder`'s guest path identifies the buyer by the PHONE in the body and
adopts an existing customer row that matches it, writing the submitted name onto
her account. A matcher is a routing rule, not an authorisation — the same
sentence this file already applies to `/account`.

Femi9's matcher is `/account`, `/dashboard`, `/welcome`; its checkout page
prefills from a session and shrugs without one; and `placeOrder` takes
`userId: string | null` precisely so a guest can buy. Lumi9 adds `/checkout` to
`proxy.ts` instead, so every order has a real identity from the first request
rather than one reverse-engineered from the phone typed into the form. The
shared service is unchanged — `placeOrder`'s guest path stays valid for Femi9.

The cart CTAs (`components/cart/CheckoutCta.tsx`) resolve the session themselves
and point at `/login?next=%2Fcheckout` when it is absent, so the guard is the
floor rather than the route a shopper normally takes: pressing "Checkout" and
landing on a sign-in form reads as a site that forgot you, where pressing "Sign
in to check out" is a step you chose. While the session is still resolving they
point at `/checkout` and let the guard decide — safe in both directions.

**Phone and pincode are digit-filtered AT THE INPUT, not validated on submit.**
`/api/checkout` takes `/^\d{10}$/` and `/^\d{6}$/`, and this form used to send
whatever was typed — so `+91 98842 30571` and `641 001`, which is how most
people write both, came back as a single opaque **"Invalid request"** banner
over a form with no field marked. Femi9's checkout has always stripped as you
type (`onDigits`); this one now does too, and the phone keeps the LAST ten
digits so a pasted country code drops rather than truncating the number. The
route's `details.fieldErrors` is also bound beside the offending input now —
never render `body.error` alone for a schema failure, because for a bad field
that string is literally "Invalid request".

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

**The posts are in the `lumi9` schema**, read through `src/lib/journal.server.ts`
— thin brand-bound wrappers over `@femi9/core/services/blog`, so the brand
literal is written once. `src/lib/journal.ts` is the SEED's input now, the same
relationship `catalog.ts` has to `catalog.server.ts`: editing it changes what
`npm run db:seed-journal` writes and nothing that is live.

Migration `20260831090000_blog_seo_and_faqs` added what the DTO had no column
for: `metaTitle`, `imageAlt`, `keywords[]`, `cta`, and a `BlogPostFaq` table.
Without them the import would have been a downgrade — an article losing its
`<title>`, its keywords and its FAQ block on the way into Postgres. `updated` did
NOT survive: the row's own `updatedAt` is what `dateModified` reads.

**⚠️ `generateStaticParams` is gone from `/journal/[slug]` and must not come
back.** The slug set is a database question now and Next calls it during
`next build`, where the Docker build stage has no credentials — declaring it
turns publishing an article into a build failure.

**Body blocks are separated by a BLANK LINE, in the console too.** `splitBody`
in `blog-admin.ts` used to split on every newline, which turned a five-bullet
list into five one-item lists the first time an editor opened such a post and
pressed Save. `joinBody` is the matching half and the edit page must use it.

**Body blocks are a tiny markdown subset**, rendered by
`components/journal/ArticleBody.tsx`: `## `, `### `, `> `, `• ` and `1. ` lists,
plus inline `**bold**` and `[label](href)`. A list is ONE block with embedded
newlines — the renderer splits it, because a `<p>` would let HTML whitespace
collapsing eat every separator. No HTML is ever interpreted.

**`src/lib/seo.ts` owns the origin.** Canonicals, Open Graph URLs, `sitemap.xml`,
`robots.txt` and every JSON-LD `@id` resolve through `SITE_URL`, so one variable
moves the whole site between staging and production.

```
SITE_URL=https://lumi9.in     # server-only, read at RUNTIME
```

It is deliberately NOT a `NEXT_PUBLIC_` name. Next inlines every
`NEXT_PUBLIC_*` reference at build time and the Docker build stage has no deploy
configuration, so a public variable would bake whatever the build happened to
see into the image — and `robots.ts`'s staging guard could never fire. Nothing
in `seo.ts` is imported by a client component. `NEXT_PUBLIC_SITE_URL` is still
honoured as a fallback because the email-link verifier already reads it.

`CANONICAL_ORIGIN` in that file is **`https://lumi9.in`** — decided, and the
same host `brandConfig('lumi9').host` records. `test/canonical-origin.test.ts`
now asserts those two agree, so changing one without the other fails the suite.
The repo used to carry three names for this site (`thelumi9.com` here,
`shop.lumi9.in` in the Terraform examples, `lumi9.in` in the brand config) and
only this constant was ever consulted.

The third place is outside that test's reach: Terraform's `sites` block and the
`SITE_URL` on the lumi9 task must name the same host. `NEXT_PUBLIC_SITE_URL`
does NOT count — Next inlines it at build time, so the value in a task
definition is inert; `SITE_URL` is the one the running server reads, and it was
missing from the task entirely until it was added in `ecs.tf`.

A mismatch is at least LOUD rather than silent: `noindexReason()`
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

## The parenting tools

`/parenting-tools` and its four tool pages. The whole surface used to be a
browser feature: one localStorage blob and two hardcoded modules.

```
lumi9 schema ──▶ getParentingPayload('lumi9', userId)   @femi9/core
             ──▶ loadParenting()          parenting.server.ts — maps to this app's shapes
             ──▶ <ParentingProvider>      app/parenting-tools/layout.tsx, ONE query
             ──▶ useParenting()           schedule · tracks · ready · signedIn
```

**The provider is a SEGMENT layout, not the root one.** The catalogue is on every
page; a vaccination schedule is on five. Putting this query in `app/layout.tsx`
would run it for every homepage, product page and article that will never read it.

**The stores are local-first, and the copy on the card says which.** Signed out,
the baby profile and the vaccination ticks are localStorage and nothing else —
the original privacy promise, still literally true for a guest. Signed in, they
are `BabyProfile` / `BabyVaccination` rows, mirrored into localStorage so the
tools still answer instantly and still work offline. `useProfileOrigin()` is what
the card binds its sentence to: a page that says "stays on this device" while
POSTing a child's date of birth is lying.

Adoption happens ONCE per page load, in `ParentingProvider`, guarded by a ref —
`payload` is a new object on every navigation between tools, and re-adopting on
each one would re-push a guest's profile on every tab change. Signing in with an
existing device profile MIGRATES it up; a server profile always wins over a
device copy, because two machines silently fighting over a child's weight is
worse than losing one stale edit.

**The email is not stored anywhere on the device.** It used to live in the
profile blob, so an address typed once was re-sent on every later save. It
belongs to the care-plan REQUEST: the server keeps a `ParentingLead` (a record of
consent, with an owner and a `source`) and the browser keeps nothing.

**"Done" is what the parent ticked, never what the calendar passed.** The
dashboard used to count doses whose due date had gone by, so a six-week-old with
no vaccinations at all read as fully up to date the day after their six-week
appointment, and no control anywhere could say otherwise. Un-ticking DELETES the
record rather than storing a "not given" — a list where a mis-tap cannot be taken
back is one nobody trusts.

**`immunisation-schedule.data.ts` is the SEED's input now**, the same
relationship `catalog.ts` has to the catalogue:

```bash
DATABASE_URL_LUMI9="postgresql://…/db?schema=lumi9" npm run db:seed-vaccines
```

Its own command, not part of `db:seed`, for the reason the journal seed is
separate: re-seeding a price must not rewrite a medical table somebody has since
corrected in the console. A dose the module no longer lists is DEACTIVATED, never
deleted — deleting cascades to `BabyVaccination` and would erase a parent's
record that their child had a dose that was later withdrawn.

**An EMPTY schedule is a real state and the UI says so.** `useParenting().ready`
is false when nothing is seeded, and both the tool page and the dashboard say the
list is not available rather than rendering an empty one — or, worse,
congratulating a parent on being "all caught up". This mattered when the doses
were a module and matters more now: an unseeded schema is far easier to reach
than a half-written file ever was.

**`Product.minWeightKg` / `maxWeightKg` are where the size bands live.**
`SIZE_BOUNDS` in `size-projection.ts` was a second copy of the catalogue's weight
ranges, carrying a comment conceding the two "must be kept in step" by hand. They
were not: renaming "7-12 kg" in the console moved what a parent READ and never
what the projector CALCULATED, with no error anywhere. `useCatalogData()` now
returns `sizeBounds` and every call site passes it; `SIZE_BOUNDS` survives as the
fallback for a catalogue seeded before the migration, and as the tests' fixture.
Do not parse `fits` at runtime — that lets a copy edit change the maths.

**The care-plan email dates from the DATABASE'S schedule.** `buildCarePlan` takes
the doses as an argument and the route passes the rows. Leaving it on
`scheduleFor`'s default would have been the same class of bug one layer deeper:
the page showing the console's schedule while the email a parent keeps in their
inbox quoted the bundled module.

## The Moments rail, and where its media lives

`components/home/Moments.tsx` is Femi9's centre-focused video rail
(`components/VideoTestimonials.tsx` over there) rebuilt on this app's Tailwind
tokens — the same relationship the Journal has to its Femi9 original. It sits
between the journal and the written reviews on the home page.

It carries the eight creatives the OLD lumi9.in serves from
`GET /api/instagram/feed` — the Laravel storefront this app replaces. **The
media was copied off that stack's CloudFront distribution into THIS platform's
uploads bucket**, under `uploads/lumi9/testimonials/`, because pointing the new
site at the old one's CDN would mean retiring that stack blanks the section.

```
s3://femi9-staging-uploads-851725383246/uploads/lumi9/testimonials/
  <slug>.mp4   four clips, 720x1280 H.264, faststart
  <slug>.jpg   a poster for each clip, plus the four stills
```

Brand-scoped (`lumi9/`) because that bucket holds BOTH brands — Femi9's rail is
at `uploads/testimonials/`, and an unscoped prefix would put two brands' stories
in one folder. `src/lib/moments.ts` is the hand-written list, and its header has
the upload command and the `L1`–`L10` → slug mapping.

**Do not confuse it with `components/home/Testimonials.tsx`**, which is the
WRITTEN reviews marquee and reads `Review` rows through the console's moderation
queue. This one is brand-authored creative that no table models.

**A clip and a still advance differently, deliberately.** A clip plays to its
end and hands over from `onEnded`; a still has no such event, so a dwell timer
is its "ended". Both call the same `go(1)`, so the endless roll never has to
know which kind it is turning past.

⚠️ **`/uploads/*` only resolves locally if `SITE_URL` points at a host that
serves that prefix from the bucket.** `next.config.ts` rewrites it there. The
committed `.env` points `SITE_URL` at `127.0.0.1:3001`, which proxies the app to
itself — the trap that file's own comment warns about. Point it at the Lumi9
CloudFront distribution to see the rail with its media in `next dev`.

## The seeds

`prisma/` here holds **seed data only** — the schema and migrations are shared,
in `packages/db`. Seed data is brand-specific, which is why it lives with the app
(Femi9 does the same).

```bash
DATABASE_URL_LUMI9="postgresql://…/db?schema=lumi9" npm run db:seed
DATABASE_URL_LUMI9="…" npm run db:seed-zones
DATABASE_URL_LUMI9="…" npm run db:seed-vaccines   # the immunisation schedule
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

**⚠️ Google's redirect URI is wrong LOCALLY and right in PRODUCTION — do not
"fix" the one by copying the other.** `callbackUrl()` in
`@femi9/core/google-oauth` prefers `GOOGLE_REDIRECT_URI`, then
`NEXT_PUBLIC_SITE_URL`, and Google compares the result byte-for-byte with a URI
registered on the OAuth client.

`infra/terraform/ecs.tf` sets `GOOGLE_REDIRECT_URI` for **femi9 only**, so this
app's task falls through to its own `NEXT_PUBLIC_SITE_URL` and builds the
correct callback by itself. Nothing needs adding there. What DOES need doing
before the button works in production is registering
`https://<this app's host>/api/auth/google/callback` on the OAuth client, and
replacing the `TODO-` placeholders on `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
(both shared with Femi9 — one client, two redirect URIs, which is fine).

The **local** `.env` is the broken one: it carries Femi9's literal
`GOOGLE_REDIRECT_URI`, pointing at a CloudFront distribution. Because real
credentials are present, `googleConfigured()` is true, the mock path never
fires, and the live one dies at Google with `redirect_uri_mismatch`. Either
point it at `http://localhost:3001/api/auth/google/callback` (and register that
too) or set `AUTH_GOOGLE_ENABLED=false` and use the other methods.

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
