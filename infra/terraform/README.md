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

Leave the three `*_host` variables empty on a first apply. Every app is still
reachable, on its own CloudFront URL — see *How each app is reachable* below.

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

Terraform ignores these values from here on. It will not clobber them.

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

### 8. Narrow the console's allowlist

`admin_allowed_cidrs` defaults to the whole internet, because a first apply that
locks a team out of their own back office is worse than the exposure. That
default has no business surviving on a console that can issue refunds:

```hcl
admin_allowed_cidrs = ["203.0.113.0/24"]   # office + VPN
```

Both the console's hostname **and** its CloudFront URL are guarded by this.
Neither is a way around the other — see the rule pairs in `alb.tf`.

## How each app is reachable

Two independent signals route to the same target group:

- **The Host header**, once DNS points a hostname at the ALB.
- **`X-Platform-App`**, injected by that app's CloudFront distribution.

The second exists because the first is unavailable before DNS. A viewer on
`d1234.cloudfront.net` sends a Host matching no rule, so without the header all
three CDNs would fall through to `alb_default_app` and every brand's CDN would
serve Femi9. With it, each app is testable on its own CloudFront URL from the
moment it is created:

```bash
terraform output -json services | jq -r '.[] | .cloudfront_url'
```

Straight against the ALB, with no CloudFront and no DNS:

```bash
curl -H "X-Platform-App: lumi9" "http://$(terraform output -raw alb_dns_name)/api/health"
```

The header is a routing signal, not a secret. Anyone may send it; all they reach
is an app that is already public. Locking the ALB down to CloudFront alone —
a shared secret header plus a listener rule, or the CloudFront managed prefix
list on the security group — is a separate hardening step worth doing before
launch.

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
- **An ALB locked to CloudFront.** See above.

## Things that will bite

**Two certificates, two regions.** `acm_certificate_arn` is regional and goes on
the ALB. `cloudfront_certificate_arn` must be in **us-east-1**, always,
whatever `aws_region` says — CloudFront reads certificates from there and
nowhere else. Getting these the wrong way round produces a confusing
`InvalidViewerCertificate` on apply.

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
