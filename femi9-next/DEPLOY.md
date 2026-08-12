# Femi9 production deployment

This is the production runbook for the Next.js 15 / React 19 storefront and
admin application. Production runs in AWS `ap-south-1`.

## Live endpoints

- Storefront: `https://d3b1qrzibm3d0g.cloudfront.net`
- Health: `https://d3b1qrzibm3d0g.cloudfront.net/api/health`
- Admin: `https://d3b1qrzibm3d0g.cloudfront.net/admin`
- Razorpay webhook:
  `https://d3b1qrzibm3d0g.cloudfront.net/api/webhooks/razorpay`

Replace the CloudFront hostname with the final custom domain everywhere once
DNS and a CloudFront ACM certificate are configured.

## Production architecture

```text
Browser
  -> CloudFront (HTTPS, Next static cache, private upload origin)
     -> ALB
        -> ECS Fargate / Next.js
           -> RDS Proxy -> Aurora PostgreSQL
           -> DynamoDB rate-limit counters
           -> private S3 product uploads
           -> Secrets Manager
```

Terraform provisions the infrastructure in `infra/terraform`. Product images
are private in S3 and readable only by CloudFront Origin Access Control. Cycle
period/symptom payloads are encrypted with AES-256-GCM before they reach
PostgreSQL. Terraform state is encrypted, versioned, and locked in S3.

## Launch gates

Production intentionally fails closed. Missing or Terraform-placeholder
credentials do not enable mock payment, OTP, email, or Google authentication.
Mocks require both a non-production `NODE_ENV` and
`ALLOW_MOCK_PROVIDERS=true`.

Before deploying a new image, all of these must be real:

- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `RAZORPAY_WEBHOOK_SECRET`, and the matching
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`
- `MSG91_AUTH_KEY` and a DLT-approved `MSG91_TEMPLATE_ID`
- `RESEND_API_KEY` and verified `EMAIL_FROM`
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if Google sign-in is offered
- `ADMIN_EMAIL` and a unique, long `ADMIN_PASSWORD`

The infrastructure generates/injects `DATABASE_URL`, `DIRECT_URL`,
`AUTH_SECRET`, `CYCLE_DATA_ENCRYPTION_KEY`, `RATE_LIMIT_TABLE`, and
`UPLOADS_BUCKET`. Sentry is optional but recommended; configure both
`SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` to receive server and browser events.

`/api/health` returns HTTP 503 in production when the database is unavailable or
a required launch setting is absent/placeholder. It never returns secret values.

## Thara Model feature flag

`THARA_ENABLED` (default `false`) gates every Thara route. Flip to `"true"`
only after sub-project B (personal discount) is also in production, so
enrolled members have a visible benefit on their next order. All new
routes return 404 when the flag is off. Schema migrations for the
program ship regardless of the flag and are additive-only; rolling back
the flag does not require a schema revert.

## First-time Terraform state bootstrap

The state bucket is already bootstrapped for the current AWS account. For a new
account:

```bash
terraform -chdir=infra/terraform/state-bootstrap init
terraform -chdir=infra/terraform/state-bootstrap apply \
  -var='bucket_name=<unique-production-state-bucket>'

cp infra/terraform/backend.hcl.example infra/terraform/backend.hcl
# Edit the ignored backend.hcl with the new bucket.
terraform -chdir=infra/terraform init \
  -migrate-state \
  -backend-config=backend.hcl
```

Do not commit `backend.hcl`, `terraform.tfvars`, a plan file, or any
`terraform.tfstate` file.

## Configure infrastructure

Copy and edit the ignored operator values:

```bash
cp infra/terraform/terraform.tfvars.example infra/terraform/terraform.tfvars
```

Set an immutable `container_image_tag`, the public URL, public Razorpay key,
MSG91 template id, verified email sender, task sizing, and optional domain/TLS
values. API credentials belong in Secrets Manager, not tfvars.

Always review a saved plan:

```bash
terraform -chdir=infra/terraform init -backend-config=backend.hcl
terraform -chdir=infra/terraform fmt -recursive -check
terraform -chdir=infra/terraform validate
terraform -chdir=infra/terraform plan -out=femi9.plan
terraform -chdir=infra/terraform show femi9.plan
```

Confirm there are no database, bucket, or network destroys before applying.

## Populate operator-managed secrets

Terraform creates provider secrets with a `TODO-...` first version and then
ignores future value changes. Set each real value out of band:

```bash
aws secretsmanager put-secret-value \
  --region ap-south-1 \
  --secret-id femi9-prod/RAZORPAY_WEBHOOK_SECRET \
  --secret-string '<real-value>'
```

Repeat for every operator-managed key. Never paste credentials into a ticket,
terminal transcript, tfvars, Docker build layer, or Git.

## Verify before building

```bash
npm ci
npx prisma generate
npx tsc --noEmit
npm test
npm audit
npm run build
```

The integration tests use only the isolated `femi9_test` database. The HTTP E2E
script refuses non-local mutations unless an explicit override is supplied.

## Latest local release gate (2026-08-06)

The current `master` revision passed the following local checks against an
isolated PostgreSQL instance:

- `npx tsc --noEmit`
- `npm test` — 58 unit/integration tests passed
- `npm run build`
- `E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e` — 68 HTTP checks passed
- `npm audit --omit=dev --json` — zero production dependency vulnerabilities

The local E2E environment uses `ALLOW_MOCK_PROVIDERS=true` with blank provider
credentials. It verifies the flows without sending email/SMS or creating/capturing
real payments. Complete the production launch gates above before enabling real
providers or deploying.

## Build and push

`NEXT_PUBLIC_*` variables are embedded during `next build`; changing them
requires a new image.

```bash
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REPO="$ACCOUNT_ID.dkr.ecr.ap-south-1.amazonaws.com/femi9-prod-app"
TAG="$(git rev-parse --short HEAD)"

aws ecr get-login-password --region ap-south-1 |
  docker login --username AWS --password-stdin "$ECR_REPO"

docker build \
  --build-arg NEXT_PUBLIC_SITE_URL='https://d3b1qrzibm3d0g.cloudfront.net' \
  --build-arg NEXT_PUBLIC_RAZORPAY_KEY_ID='<matching-public-key-id>' \
  --build-arg NEXT_PUBLIC_SENTRY_DSN='<public-dsn-or-empty>' \
  -t "$ECR_REPO:$TAG" .

docker push "$ECR_REPO:$TAG"
```

Set `container_image_tag = "<git-sha>"` in the ignored tfvars, create a fresh
plan, review it, and apply that exact plan:

```bash
terraform -chdir=infra/terraform plan -out=femi9.plan
terraform -chdir=infra/terraform apply femi9.plan
```

ECS performs a rolling update and the ALB sends traffic only to tasks whose
health check passes.

## Database startup and encrypted cycle data

The container entrypoint:

1. requires `DATABASE_URL` and `CYCLE_DATA_ENCRYPTION_KEY`;
2. runs `prisma migrate deploy` when migration history exists;
3. otherwise uses non-destructive `prisma db push` for this legacy schema;
4. runs the idempotent cycle-data encryption migration under a PostgreSQL
   advisory lock;
5. starts the standalone Next server.

Do not use `--accept-data-loss` in production. Add checked-in Prisma migrations
for future schema changes so deployments can use `prisma migrate deploy`
exclusively.

## Smoke test

After ECS is stable:

```bash
curl --fail --show-error \
  https://d3b1qrzibm3d0g.cloudfront.net/api/health
```

Then verify:

1. The homepage and `/api/products` contain an active, in-stock product.
2. Product detail -> cart -> checkout opens real Razorpay.
3. A failed/pending payment can be retried from the order confirmation page.
4. Razorpay sync verification and the signed webhook mark the same order paid
   only once.
5. The order appears in admin and inventory is decremented once.
6. Phone OTP, email magic link, and Google login work without dev codes/links.
7. An admin PNG/JPEG/WebP upload returns `/uploads/...` and loads through
   CloudFront.
8. Account cycle entries round-trip while plaintext database fields remain null.
9. Errors appear in CloudWatch and, when configured, Sentry.

## Test-product script

For local E2E setup:

```bash
E2E_BASE_URL=http://127.0.0.1:3100 npm run e2e:seed-product
E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e
```

The seed is idempotent and uses the real admin API. It refuses a non-local URL
unless `ALLOW_PRODUCTION_SEED=true` is explicitly set. Do not run the full E2E
suite against production because it creates orders, users, reviews,
subscriptions, and applications.

## Rollback

Roll back by setting `container_image_tag` to the previous immutable tag and
applying a reviewed Terraform plan. Schema changes must remain backward
compatible: expand first, deploy code, and contract only in a later release.
Never edit an already-applied migration or delete the production database/state
to perform a rollback.
