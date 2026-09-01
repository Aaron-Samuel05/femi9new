# Deploying the platform to AWS ECS

Both storefronts and the console, on one Aurora cluster, in one Fargate cluster.

```
                     ┌──────────── CloudFront (one per app) ────────────┐
                     │  femi9 CDN     lumi9 CDN      admin CDN          │
                     │      │             │              │              │
                     │      └─── X-Platform-App header ──┘              │
                     └──────────────────┬──────────────────────────────┘
                                        ▼
                          ALB :443  (host + header rules)
                          ├── femi9 TG ─► femi9-web  tasks ─┐
                          ├── lumi9 TG ─► lumi9-web  tasks ─┤► RDS Proxy ─► Aurora
                          └── admin TG ─► admin      tasks ─┘      ├─ schema femi9
                                                                    ├─ schema lumi9
                                                                    └─ schema platform
```

**This stack does not touch the one that is running today.** `apps/femi9-web/infra/terraform`
deploys Femi9 alone and keeps doing so; this is a parallel stack you bring up,
exercise, and cut over to. Different VPC (10.30/16 against 10.20/16, chosen so
they can be peered), different name prefix, different ECR repositories,
different IAM statements.

## What you need first

| | |
| --- | --- |
| Terraform | ≥ 1.10 |
| AWS credentials | with permission to create VPC / ECS / RDS / ACM / CloudFront |
| An S3 bucket for state | `state-bootstrap/` in the single-app stack creates one |
| Docker | to build and push the three images, unless CI does it |

State holds generated database credentials, so it **must** live in the encrypted,
locked S3 backend. Never `terraform apply` this with local state.

## First apply, in order

The order matters in exactly two places, and both are called out below.

### 1. Configure

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # fill it in — it is gitignored
cp backend.hcl.example      backend.hcl        # bucket / key / region
terraform init -backend-config=backend.hcl
```

Leave `sites` empty on a first apply. Every app is still reachable, on its own
CloudFront URL — see *How each app is reachable* below.

### 1b. Reusing the existing staging network and database

"One backend" can mean literally one database. This stack can build its own
Aurora cluster and VPC, or run on ones that already exist — and for the Femi9
staging environment the second is the point: Femi9's data is already there, and
a second cluster would mean migrating it and paying twice.

**The two go together.** An Aurora cluster is only reachable from inside its own
VPC, so reusing the database means running in that VPC. Reusing one without the
other gives you three services that cannot open a connection.

The values for `femi9-staging`, discovered with `aws ec2 describe-subnets` and
`aws rds describe-db-clusters`:

```hcl
existing_network = {
  vpc_id             = "vpc-0f4837446df9ce512"          # femi9-staging-vpc, 10.20.0.0/16
  public_subnet_ids  = ["subnet-03842c9fecb63c708", "subnet-0ee4b6c0bea511056"]
  private_subnet_ids = ["subnet-06dc8b8c25ca50c51", "subnet-0affaca2589e9354a"]
}

# That VPC has NO NAT gateway - the existing service runs its tasks in the
# public subnets, and so must ours. Inbound is still ALB-only, by security
# group; a public subnet is not a public service.
enable_nat = false

existing_database = {
  cluster_identifier = "femi9-staging-aurora"
  database_name      = "femi9"
  credentials_secret = "femi9-staging/db-credentials"
  security_group_id  = "sg-0859aa3ef90161256"
}

# Femi9's rows are in `public`; the rename has never been run.
femi9_schema_is_public = true
```

Three things worth understanding before running this:

**One security group rule is added to a resource this stack does not own** — an
ingress rule on the cluster's group, admitting this stack's tasks on 5432.
Without it the tasks resolve the endpoint and then hang until the connection
times out. It is additive, and destroying this stack removes it again.

**There is no RDS Proxy in reuse mode.** The created path puts one in front of
Aurora because Fargate scales out and Prisma opens a pool per task. Attaching a
proxy to somebody else's cluster changes how the EXISTING tenant's connections
are handled, which is not this stack's call. Tasks connect directly, so the
connection ceiling is something to watch — `femi9-staging-aurora` runs at
0.5-1.0 ACU, and three more services on it will want that maximum raised.

**Femi9 shares `public` with the service already running there.** That is the
"single backend" you asked for, and it means the new Femi9 task will run
`prisma migrate deploy` against the same schema the existing staging service
uses. The migrations are additive, and both apps come from the same repository —
but it is a live schema, and worth knowing before the first boot rather than
after.

A production cluster is refused outright: `existing_database.cluster_identifier`
is validated against `prod`, because this stack runs migrations and seeds
against whatever it is handed.

### 2. Create the image repositories, and only those

**This is the first ordering constraint.** An ECS service cannot start until its
repository holds an image, and the repository is created by this stack. So:

```bash
terraform apply -target=aws_ecr_repository.app
```

### 3. Build and push all three images

The build context is the **workspace root**, never an app directory — npm
workspaces keep the lockfile and the hoisted `node_modules` there, so an
app-scoped context cannot run `npm ci`.

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGISTRY="$ACCOUNT.dkr.ecr.ap-south-1.amazonaws.com"
PREFIX=femi9plat-staging          # project-environment
TAG=$(git rev-parse --short HEAD) # never "latest" for a real deploy

aws ecr get-login-password --region ap-south-1 \
  | docker login --username AWS --password-stdin "$REGISTRY"

for app in femi9:apps/femi9-web lumi9:apps/lumi9-web admin:apps/admin; do
  key=${app%%:*}; dir=${app##*:}
  docker build -f "$dir/Dockerfile" -t "$REGISTRY/$PREFIX-$key:$TAG" .
  docker push "$REGISTRY/$PREFIX-$key:$TAG"
done
```

Each Dockerfile brings **its own** `Dockerfile.dockerignore`, which BuildKit
prefers over the context root's. That is what lets three images share one build
context and still each exclude the other two apps' source. Femi9's build has no
such file and keeps using the root `.dockerignore` — deliberately, so its
context is byte-for-byte what it always was.

`NEXT_PUBLIC_*` values are inlined into the **client bundle at build time**, so
anything a browser reads has to be a `--build-arg` here as well as an
environment entry in the task definition. The workflow passes both from the same
repository variables; by hand, add `--build-arg NEXT_PUBLIC_SITE_URL=…`.

### 4. Apply the rest

```bash
terraform apply -var container_image_tag=$TAG
```

Aurora takes ten to fifteen minutes. CloudFront distributions take another
fifteen to deploy globally — they exist immediately and serve a little later.

### 5. Fill the placeholder secrets

Every third-party credential was created holding a `TODO-…` value.

```bash
terraform output placeholder_secrets_to_fill

aws secretsmanager put-secret-value \
  --secret-id femi9plat-staging/RAZORPAY_KEY_SECRET \
  --secret-string 'the_real_secret' --region ap-south-1
```

**A `TODO` value is read as absent, not as a value.** `usable()` in
`packages/core/src/payment-identity.ts` rejects anything starting `TODO`, so a
secret you have not filled in leaves its feature switched off rather than
letting the app try to authenticate with the literal string `TODO-change-me`.
That is why an unfinished setup degrades instead of erroring in strange places.

Terraform ignores these values from here on. It will not clobber them — and it
cannot see them either, which leaves one hole worth knowing about:

```bash
infra/scripts/preflight.sh femi9plat-staging ap-south-1
```

**Razorpay credentials are the exception that does not degrade.** `/api/health`
fails CLOSED without them, so a brand still holding placeholders never enters
the load balancer: `terraform apply` succeeds, the deploy sits at *waiting for
service stability* for its whole timeout, and rolls back reporting nothing about
the cause. That script reads the values back and says which ones would block,
using the same rules the health probe uses. `deploy-platform.yml` runs it before
it builds an image, so a deploy that could not become healthy fails in seconds
with a reason instead of in twenty minutes without one.

### 5b. Verify the sending domain — Lumi9 sends through SES

Lumi9's transactional mail goes through Amazon SES as
`Lumi9 <no-reply@lumi9.in>`, with `support@lumi9.in` as the reply-to. Femi9 is
live on Resend and stays there; `mail-identity.ts` picks the provider per brand,
so the two coexist and Femi9 moves later by setting two variables.

`ses.tf` creates the identity, the DKIM keys, a configuration set, an SNS topic
carrying bounces and complaints to `/api/webhooks/ses`, and an IAM grant pinned
to exactly one From address. **Two things it cannot do:**

```bash
terraform output ses_dns_records      # three DKIM CNAMEs, plus MAIL FROM MX/TXT
terraform output ses_identity_status  # PENDING until those records resolve
```

**Until the DKIM records exist in the `lumi9.in` zone, every send is rejected.**
Not degraded — rejected. Add them, then watch `ses_identity_status` flip to
`verified`; propagation is usually minutes and occasionally an hour.

**A new SES account is in the SANDBOX**, where it may only send to addresses it
has individually verified. Every real customer is refused with
`MessageRejected`, which the app records as one failed `NotificationLog` row and
nothing else. Production access is a support request from the SES console
(Account dashboard → Request production access); allow a day for the answer, and
ask for it *before* launch week.

Two things are deliberately pinned, and both fail loudly rather than quietly:

- **The From address.** The IAM policy carries a `ses:FromAddress` condition, so
  changing `lumi9_email_from` without changing Terraform fails with
  `AccessDenied` at send time instead of sending as an address nobody chose. A
  `check` block also refuses a plan whose From address is outside the verified
  domain.
- **The configuration set.** Mail sent outside it is delivered with no event
  feed at all — no bounces, no complaints, no reputation metrics. That is the
  failure you discover when SES pauses the account.

### 6. Seed each brand's catalogue

**This is the second ordering constraint**: seed after the service is running,
because the seed needs the schema, and the schema is created by the service's
entrypoint on first boot.

Run the *same image* as a one-off task with the command overridden:

```bash
aws ecs run-task \
  --cluster femi9plat-staging-cluster \
  --task-definition femi9plat-staging-lumi9 \
  --launch-type FARGATE \
  --network-configuration 'awsvpcConfiguration={subnets=[subnet-…],securityGroups=[sg-…],assignPublicIp=DISABLED}' \
  --overrides '{"containerOverrides":[{"name":"app","command":["npx","tsx","./prisma/seed.ts"]}]}'
```

Then `./prisma/seed-zones.ts` the same way. Both are idempotent — slugs and SKUs
are stable, so a rerun updates in place rather than duplicating.

### 7. Create the first admin

There is no self-service sign-up, and there should not be.

```bash
aws ecs run-task … --task-definition femi9plat-staging-admin \
  --overrides '{"containerOverrides":[{"name":"app","command":[
     "npx","tsx","../../packages/db-platform/scripts/create-admin.ts",
     "--email","you@company.com","--name","You","--brand","femi9","--role","owner"],
     "environment":[{"name":"ADMIN_SEED_PASSWORD","value":"at least twelve chars"}]}]}'
```

Re-running for the same email grants an additional brand and does **not** reset
the password.

### 8. Narrow the console's allowlist — DEFERRED for staging

**Current state, deliberately:** `admin_allowed_cidrs` is unset on the
femi9plat-staging environment, so the console is reachable from anywhere. That
was a considered call for a staging environment, not an oversight — do not
"fix" it without asking.

It becomes a real decision again before this pattern carries production
traffic, because the same console issues refunds there. The machinery below is
built and tested; it is switched off, not missing.


`admin_allowed_cidrs` defaults to the whole internet, because a first apply that
locks a team out of their own back office is worse than the exposure. That
default has no business surviving on a console that can issue refunds:

```hcl
admin_allowed_cidrs = ["203.0.113.0/24"]   # office + VPN
```

Both the console's hostname **and** its CloudFront URL are guarded by this.
Neither is a way around the other — see the rule pairs in `alb.tf`.

## Sites, apps, and how a request finds its service

An **app** is an ECS service. A **site** is one public hostname. They are not
one-to-one, and the console is why:

| site | app | who it is for |
| --- | --- | --- |
| `shop.femi9.in` | femi9 | Femi9 shoppers |
| `shop.lumi9.in` | lumi9 | Lumi9 shoppers |
| `admin.femi9.in` | admin | Femi9 staff |
| `admin.lumi9.in` | admin | Lumi9 staff |

Four hostnames, **three** ECS services. The console answers on both brands'
domains so neither brand's staff has to learn the other's, and it is still one
service, one image, one deployment — the brand a session belongs to is decided
by `AdminBrandRole`, never by which hostname was typed.

Each site gets its own CloudFront distribution. It has to: a distribution
carries one certificate, and the two console hostnames sit on different
registrable domains.

Two independent signals then route to the target group:

- **The Host header**, once DNS points a hostname at CloudFront.
- **`X-Platform-App`**, injected by the distribution onto the ALB origin. It
  names the APP, so both console distributions send `admin`.

The second exists because the first is unavailable before DNS. A viewer on
`d1234.cloudfront.net` sends a Host matching no rule, so without the header
every distribution would fall through to `alb_default_app` and all of them
would serve Femi9. With it, each site is testable on its own CloudFront URL
from the moment it is created:

```bash
terraform output -json sites | jq -r 'to_entries[] | "\(.key)\t\(.value.app)\t\(.value.cloudfront_url)"'
```

Straight against the ALB, with no CloudFront and no DNS:

```bash
curl -H "X-Platform-App: lumi9" "http://$(terraform output -raw alb_dns_name)/api/health"
```

**This only works from an address the security group admits.** Since
`alb_ingress_source` defaults to `cloudfront`, that is the edge and nothing
else, and the command above times out from a laptop. Add your address to
`alb_debug_cidrs` for as long as you need it.

The header is a routing signal and not a gate: anyone the security group lets in
may send it, and all they reach is an app that is already public. The gate is
the prefix list — see *Things that will bite*, which explains why an open ALB
also made every per-IP rate limit on the platform forgeable.

**Point DNS at the site's CloudFront domain, never at `alb_dns_name`.** A record
aimed at the load balancer bypasses the CDN, and with it the certificate, the
cached static assets, and the `/uploads/*` behaviour that makes product images
resolve at all. `terraform output sites` gives the target for each CNAME.

### The console's allowlist covers every front door

`admin_allowed_cidrs` is enforced on **all** of the console's hostnames and on
its CloudFront URLs, as one rule pair each — an ALB `host_header` condition ORs
its values, so adding a third console hostname cannot quietly escape the
allowlist. Guarding one door and not the others would look enforced and not be.

```bash
terraform output admin_hosts
```

## Deploying a change

`.github/workflows/deploy-platform.yml`, on a push to `lumi9`. It works out
which services a commit can possibly have affected: a change under
`apps/lumi9-web/` rebuilds only Lumi9, while anything in `packages/` or the
lockfile rebuilds all three, because shared code can change any of them.

It reads the task definition the service is **currently running** and replaces
only the image. Terraform owns everything else in that definition — environment,
secrets, sizing — so rendering a fresh one in CI would silently revert whatever
had been applied since the last deploy.

`wait-for-service-stability` is on, so a rollout that never goes healthy fails
the workflow instead of reporting success while ECS quietly rolls back.

### What CI needs configured

Repository **variables** (Settings → Secrets and variables → Actions → Variables).
None of these is a secret; every credential lives in Secrets Manager and is read
by the task, never by the workflow.

| Variable | Used for |
| --- | --- |
| `AWS_ROLE_ARN` | The role the workflow assumes over OIDC. Trust policy in `.github/iam/github-staging-trust.json`; permissions in `.github/iam/github-platform-policy.json`. |
| `AWS_REGION` | Defaults to `ap-south-1`. |
| `PLATFORM_PROJECT` / `PLATFORM_ENVIRONMENT` | The name prefix — must match `project` and `environment` in `terraform.tfvars`, because every repo, cluster and service name is derived from them. |
| `FEMI9_SITE_URL` / `LUMI9_SITE_URL` | Baked into each client bundle as `NEXT_PUBLIC_SITE_URL`. Must equal what Terraform puts in the task definition; they are the same values from the same source, and a mismatch shows up as a payment callback to the wrong origin. |
| `FEMI9_RAZORPAY_KEY_ID` / `LUMI9_RAZORPAY_KEY_ID` | Publishable key ids. Leave Lumi9's empty while both brands share a merchant account. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional. A DSN is an identifier, not a credential. |

There are **no repository secrets**. The OIDC role replaced the stored
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` pair; if those are still in the
repository, delete them.

To deploy by hand, or to roll one brand back without touching the other:

```bash
terraform apply -var lumi9_image_tag=<previous-sha>
```

## Migrations

Each app migrates **exactly the schema it is the front for**, on boot:

| app | schema | history |
| --- | --- | --- |
| femi9-web | `femi9` | `packages/db/prisma/migrations` (15) |
| lumi9-web | `lumi9` | the same 15 — one history, two schemas |
| admin | `platform` | `packages/db-platform/prisma/migrations` |

One writer per schema, always. It is tempting to let the console migrate the
brand schemas too, since it reads both — but then two services would race to
apply the same history to the same schema and the winner would depend on task
start order.

Each entrypoint runs `CREATE SCHEMA IF NOT EXISTS` before migrating, because
Prisma writes `_prisma_migrations` into the schema on the search path and that
schema has to exist first. Creating it there rather than in a migration is what
keeps the migration files schema-agnostic — the same fifteen files are what
Femi9 applies to *its* schema.

`prisma migrate deploy` is idempotent and serialises behind a Postgres advisory
lock, so N tasks booting at once is safe. The tidier pattern at scale is a
dedicated one-off migrate task before the service update; this keeps the
self-contained path.

## What is deliberately NOT here

- **Femi9's live data.** This stack creates an empty Aurora cluster. Moving the
  existing database into it is a separate, human-run exercise — see
  `docs/RENAME-RUNBOOK.md`, which is rehearsed and has never been fired.
- **A `public` → `femi9` schema rename.** Same reason.
- **WAF.** Worth adding in front of the console and the checkout routes.
- **Sentry in the Lumi9 and console images.** Only femi9-web ships it. The
  alarms in `alarms.tf` cover the shapes that matter operationally — a 5xx
  storm, an app with no healthy targets, a schedule that stopped running — but
  there is no per-exception reporting for the other two apps. Adding it is not
  a one-line change: `@sentry/nextjs` is an OPTIONAL peer of `packages/core`
  imported dynamically, and making it a hard dependency once put its
  instrumentation into every image, where Turbopack externalised it under a
  name the standalone bundle could not resolve and **every route in the Lumi9
  image answered 500** — a failure that appears only when you RUN the
  container. See the root CLAUDE.md.

## Things that will bite

**Certificates are per site, and always us-east-1.** Each entry in `sites` has
its own `certificate_arn`, and it must be in **us-east-1** whatever
`aws_region` says — CloudFront reads certificates from there and nowhere else.
A regional ARN here produces a confusing `InvalidViewerCertificate` on apply.

`acm_certificate_arn` is a different thing: the ALB's own listener certificate,
**regional**, and it is what encrypts the SECOND hop. CloudFront terminates TLS
for the viewer; edge-to-origin is a separate connection, and on the default
`http-only` it carries session cookies, names, addresses and phone numbers in
cleartext across the public internet.

Encrypting it takes a hostname as well as a certificate. CloudFront validates
the origin certificate against the **origin domain name**, and no public CA
issues for the ALB's own `*.elb.amazonaws.com` — so `https-only` against that
name fails at the handshake, on every request, as a 502 with nothing in the app
logs. Set `alb_origin_host` to a name that resolves to the ALB and is covered by
`acm_certificate_arn`, leave `alb_origin_protocol_policy` empty, and the
protocol derives itself. Both traps are refused at plan time by preconditions in
`cloudfront.tf` rather than discovered in production.

**The ALB only accepts the CloudFront edge.** `alb_ingress_source` defaults to
AWS's `com.amazonaws.global.cloudfront.origin-facing` prefix list. That is not
only defence in depth: the per-IP rate limits on OTP sends, magic links, admin
sign-in and checkout all key on `CloudFront-Viewer-Address`, which only the edge
can set — while the ALB was open to the internet, anyone who found it could send
that header themselves, vary it per request, and defeat every limit at once. Use
`alb_debug_cidrs` for a temporary direct route; `alb_ingress_source =
"internet"` puts the bypass back.

**All three images run from `/app/apps/<app>`, not `/app`.** They keep the
nested layout `next build` produced instead of flattening it, and that is not a
style choice: Turbopack writes its externalised server packages into
`.next/node_modules` as relative symlinks counted from that exact depth, so
flattening dangles every one of them. The image then builds, starts, and fails —
500 on every route, or a dead instrumentation hook. Any `--overrides` command
for a one-off task is therefore relative to `/app/apps/<app>` — which is why the
seed above is `./prisma/seed.ts` and create-admin reaches up to
`../../packages/db-platform/scripts/`.

Femi9's image flattened until this change, which was correct before it moved to
Next 16 and Turbopack and silently stopped being so.

**Nothing in those images is relocated.** Every script sits at its workspace
path, because moving one silently rewrites its relative imports: `create-admin`
imports the package it lives in as `../src/index`, and a tidier home for it
produced `Cannot find module` on the one-off task, well after the image had
deployed and gone healthy.

**Terraform owns the task definition; CI owns the image inside it.** That is a
real seam, and it bit once already. `terraform apply` re-registers the task
definition and moves each service onto `container_image_tag` — so an apply run
after a CI deploy will roll the image back to whatever that variable says. Two
things keep it survivable: the deploy workflow pushes every build as `latest`
as well as by SHA, so the default always resolves to a real image rather than
to nothing; and pinning `container_image_tag` to a SHA in tfvars makes an
environment reproducible. Bump the pin after a deploy you want an apply to
preserve.

The first time this went wrong, nothing had ever been pushed as `latest`, and a
routine apply pointed all three services at a tag that did not exist. The
symptom is `CannotPullContainerError ... manifest not found`, and it appears
minutes later on a service that was healthy before the apply.

**Sharing the database means sharing the uploads bucket.** Not a preference —
a requirement. Product rows store a SITE-RELATIVE image path
(`/uploads/1786949614838-1.webp`), and each site's CloudFront serves `/uploads/*`
from whatever bucket this stack points it at. Reuse the database with a fresh
bucket of your own and every product image 403s: the rows are right, the files
are simply somewhere else. Set `existing_uploads_bucket` alongside
`existing_database`, always.

It also has to stay shared afterwards. An image uploaded through one console
lands in one bucket, and the row referencing it is visible to both — so a split
bucket means an image that renders in one storefront and is broken in the other.

`keep_distribution_arns` is the sharp edge. An S3 bucket has exactly ONE policy,
so pointing this stack at an existing bucket REWRITES the policy already
governing it. Any distribution not named there loses read access the moment you
apply — which, for a bucket shared with a running environment, means that
environment's images go dark.

**A schema name lives in two places.** `femi9_schema` / `lumi9_schema` /
`platform_schema` go into the connection strings *and* into each container's
`BRAND_DB_SCHEMA` / `PLATFORM_DB_SCHEMA`. Change one without the other and a
service migrates one schema while reading another — with no error, because both
exist.

**Lumi9 is never given a bare `DATABASE_URL`.** `dbFor('femi9')` accepts one as
Femi9's transitional fallback, so a bare variable in the Lumi9 task would let a
stray Femi9 read quietly succeed against Lumi9's data. `secrets.tf` is where
that is enforced, and it is the reason the Lumi9 entrypoint sets
`DATABASE_URL` for the migrate command alone.

**The account guardrail denies `ecs:DeregisterTaskDefinition`**, so task
definitions carry `skip_destroy = true`. Old revisions accumulate; that is
intended, not a leak.

**Aurora `deletion_protection` defaults to true.** `terraform destroy` will fail
on the cluster until you set it false and apply that first. In a scratch
environment, set `db_deletion_protection = false` and
`db_skip_final_snapshot = true` up front.

**`enable_nat = false` is the escape hatch** when the account has no spare
Elastic IP. Tasks then run in public subnets with a public IP for egress —
inbound is still ALB-only through the security group, so this is a cost and
egress-path decision rather than a security one.
