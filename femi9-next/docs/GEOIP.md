# Geo detection — why mobile data was mispriced, and what now happens instead

## The bug

Regional pricing resolved a visitor's state from one source: CloudFront's edge
IP→geo lookup, forwarded to the origin as `CloudFront-Viewer-*` headers and read
by `src/lib/geo/detect.ts`.

That works over WiFi and fails on mobile data.

Indian mobile carriers — Jio, Airtel, Vi, BSNL — run **carrier-grade NAT** on
IPv4. Hundreds of thousands of subscribers egress through a handful of regional
gateways, so the address CloudFront resolves belongs to the **gateway**, not to
the shopper. A phone in Coimbatore routinely resolves to Mumbai or Delhi.
Broadband ISPs allocate addresses per city with accurate registrations, which is
why the same code gets WiFi right.

**CloudFront is not wrong.** It correctly located the IP it was handed. The IP is
simply not where the shopper is, and no vendor or configuration change recovers
information that is not in the address. So the fix is not a better lookup — it is
to stop treating one lookup as the truth.

## What changed

`detectGeoReading()` runs a ladder and stops at the first tier that clears a
confidence bar. Two mechanisms can also *remove* a signal.

| # | Tier | Confidence | Survives CGNAT? |
|---|---|---|---|
| 1 | Dev override headers (non-production only) | high | n/a |
| 2 | IPv6 → telecom circle (`circles.ts`) | high | **yes** |
| 3 | IPv6 → GeoLite2 city (`mmdb.ts`) | medium | **yes** |
| 4 | CloudFront edge headers — the previous behaviour | medium | no |
| 5 | IPv4 → GeoLite2 city | medium | no |

Only `high` and `medium` may set a price. Anything else yields an empty signal,
which resolves to the default zone — the **standard price**.

### The carrier gate (`carriers.ts`)

If the viewer's ASN belongs to an Indian mobile carrier, tiers 4 and 5 are
discarded outright: they are reading a CGNAT gateway. The ASN comes from
GeoLite2-ASN when present and from the `CloudFront-Viewer-ASN` header otherwise.
With neither, the gate stays open and behaviour is unchanged — failing closed
would gate everyone and switch regional pricing off.

> **Current deployment: GeoLite2 is not configured**, so
> `CloudFront-Viewer-ASN` is the *only* source of an ASN. Two consequences:
>
> 1. The Terraform change is **load-bearing, not optional**. Without that header
>    there is no ASN at all, the gate never fires, and mobile viewers are priced
>    off the CGNAT gateway exactly as before.
> 2. The header carries a number and no organisation name, so the organisation
>    regex never runs and the ASN table in `carriers.ts` is the *only* matcher.
>    Verifying those numbers therefore matters more, not less — a missing ASN
>    fails open with no safety net behind it.
>
> Tiers 3 and 5, the `accuracy_radius` gate and the offline country veto are all
> inactive for the same reason. Supplying a licence key at build time switches
> every one of them on with no code change.

ASNs are split into `mobile` (certainly mobile) and `mixed` (a carrier running
fixed *and* mobile on one ASN, e.g. Airtel's AS24560 fronting Xstream broadband).
Both are distrusted, because the failure modes are not symmetric — see below —
but they are tagged separately so the choice can be measured and revisited.

### The IPv6 tiers — the part that actually fixes mobile

Carriers do **not** NAT IPv6. Every subscriber gets a real delegated prefix, and
the blocks above it are allocated per **telecom circle** — the 22 licensed
service areas the DoT carved India into, drawn on state lines. That is roughly
the granularity a pricing zone needs, still present in the address exactly where
IPv4 CGNAT destroyed it.

Note that **half the circle map is deliberately unusable**: several circles
predate state reorganisations and span two states (Andhra Pradesh still covers
Telangana; Maharashtra includes Goa but not Mumbai; UP-West includes Uttarakhand;
North-East covers six states). `circleState()` returns a state only from a circle
covering exactly one. Guessing at the larger half would be a wrong price.

### The accuracy gate and the language veto

GeoLite2 publishes `location.accuracy_radius` — its own honesty about each
record. Indian mobile IPv4 routinely comes back at 500–1000 km, which means
"somewhere in India"; its centroid sits near Nagpur, so reading a state off it
would price the entire unplaceable population as Maharashtra. Records wider than
`GEOIP_MAX_ACCURACY_RADIUS_KM` (default 250) lose their region.

`Accept-Language` is used **only to veto**, never to assert a location. A browser
preferring Tamil is weak evidence of being in Tamil Nadu and strong evidence of
*not* being in Gujarat. It applies to `medium` tiers only, so it cannot overturn
a learned circle prefix. `hi` is deliberately absent from the table — Hindi spans
a dozen states and would veto correct answers across the whole north.

## Why refusing to answer is the right default

Under the original discount-only design, a missing signal could only ever cost a
shopper a discount. **That is no longer true.** A zone can now set an *exact*
price that is not guaranteed to be below standard (`services/pricing.ts`), so a
*wrong* signal can overcharge her, not merely under-discount.

Between a confident wrong state and no state, no state is now strictly safer.
Every tier is built to fail toward the default zone.

## Operating it

### Getting the databases

GeoLite2 is MaxMind's free tier. It needs a signed-up account and licence key,
and it carries **CC BY-SA 4.0 attribution terms** — read MaxMind's licence before
shipping the files anywhere public.

```bash
MAXMIND_LICENSE_KEY=... npm run geoip:fetch     # writes data/geoip/*.mmdb
```

The files are gitignored: they are large licensed binaries and they go stale.

### Building the image

Databases are baked in at **build time**, not fetched at runtime. Every task then
gets an identical immutable copy with no writable volume and no runtime network
egress — the same property the Prisma engines are shipped for. The licence key is
a BuildKit secret, so it never lands in a layer or in `docker history`:

```bash
docker build --secret id=maxmind_license_key,env=MAXMIND_LICENSE_KEY .
```

Refreshing means rebuilding. MaxMind publishes weekly; a weekly CI rebuild is
ample, since the ASN data this app leans on is stable.

**Building without the secret is fully supported** — the script writes an empty
directory and exits 0, every lookup returns null, and the resolver falls back to
the CloudFront headers. You lose the carrier gate; nothing breaks.

### Terraform

`infra/terraform/cloudfront.tf` adds `CloudFront-Viewer-ASN` and
`CloudFront-Viewer-Address` to the origin request policy. Both are
CloudFront-*generated* headers, so they only arrive under the
`allViewerAndWhitelistCloudFront` behaviour already set there.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `GEOIP_ASN_DB` | `data/geoip/GeoLite2-ASN.mmdb` | ASN database path |
| `GEOIP_CITY_DB` | `data/geoip/GeoLite2-City.mmdb` | City database path |
| `GEOIP_MAX_ACCURACY_RADIUS_KM` | `250` | Widest record allowed to name a state |
| `GEOIP_MOBILE_ASNS` | — | Extra ASNs to gate, comma-separated |
| `GEOIP_CIRCLE_MIN_OBSERVATIONS` | `12` | Confirmed deliveries before a prefix may price |

`GEOIP_MOBILE_ASNS` is the escape hatch that matters: it lets ops gate a
newly-observed carrier prefix the same day it starts mispricing, without a
deploy.

## Seeding the circle table

`IpCircleRange` ships **empty**, and until it has rows tier 2 never fires.

This is deliberate. No registry publishes IPv6-prefix→circle, carriers do not
document it, and it changes. Hand-writing plausible-looking prefixes would
silently misprice real shoppers — worse than the bug being fixed.

The rows are meant to be **learned**. Every order pairs a viewer IP with a
delivery pincode the shopper typed, which is ground truth:

1. Record `(prefix, asn)` on each order alongside the confirmed delivery pincode.
   `prefixKeyFor()` in `src/lib/geo/ip.ts` produces the key; `clientIp()` in
   `src/lib/rate-limit.ts` produces the address. **Nothing does this yet** — it is
   the next piece of work, and it only accrues data going forward, so it is worth
   turning on well before the table is read.
2. Aggregate pincode → state → circle, and upsert `IpCircleRange` with
   `observations` and `conflicts`.
3. `lookupCircle()` refuses a row until `observations` clears
   `GEOIP_CIRCLE_MIN_OBSERVATIONS`. One order proves nothing; a prefix that has
   shipped to the same circle a dozen times is a real signal.

This is the same technique commercial vendors sell (Digital Element's NetAcuity
Pulse, IPinfo's carrier data), built from our own conversion data — which is
better tuned to our traffic than anything bought off the shelf.

Rows may also be written by hand with `source: 'manual'` when a prefix is known
from another source.

## What to measure

`GeoReading.detail` carries `asn`, `carrier`, `accuracyRadiusKm`, `circle` and a
`rejected` reason. Nothing samples it yet. It is what makes the gate auditable:
without it you cannot distinguish a shopper who got the default zone because she
is genuinely unplaceable from one who got it because a good signal was thrown
away. The numbers worth watching once sampling exists:

- share of traffic rejected as `mobile-carrier-cgnat` (how big the problem is)
- how much of that is `mixed` rather than `mobile` (what distrusting Airtel's
  shared ASN actually costs)
- `language-contradiction` rate (whether the veto is too eager)
- per-carrier accuracy once the observation data lands — the number that decides
  whether a paid vendor would beat the learned table
