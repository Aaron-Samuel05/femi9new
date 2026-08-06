# Femi9 AWS infrastructure

Terraform manages the production stack in `ap-south-1`:

- VPC, public/private subnets, NAT, and scoped security groups
- CloudFront -> ALB -> autoscaled ECS Fargate service
- Aurora Serverless v2 PostgreSQL and RDS Proxy
- ECR and CloudWatch logs
- private/versioned S3 product uploads with CloudFront OAC
- encrypted, pay-per-request DynamoDB rate-limit counters with TTL
- Secrets Manager and least-privilege task/execution IAM policies

The application URL defaults to the HTTPS CloudFront distribution when no
custom domain is configured. It never falls back to the plain-HTTP ALB origin.

## State backend

Terraform requires version 1.10 or newer and uses a partial S3 backend. The
state bucket must be created once:

```bash
terraform -chdir=state-bootstrap init
terraform -chdir=state-bootstrap apply \
  -var='bucket_name=<globally-unique-state-bucket>'
```

Copy `backend.hcl.example` to the ignored `backend.hcl`, set its bucket, then:

```bash
terraform init -migrate-state -backend-config=backend.hcl
```

The S3 backend uses encryption, versioning, and native lockfiles. DynamoDB state
locking is deprecated and is not used. State contains generated credentials;
never commit or share it.

## Operator inputs

```bash
cp terraform.tfvars.example terraform.tfvars
```

Important non-secret inputs:

- `container_image_tag`: immutable Git SHA/image tag
- `next_public_site_url`: customer HTTPS URL; empty uses CloudFront
- `next_public_razorpay_key_id`: browser key matching the server key
- `next_public_sentry_dsn`: optional browser monitoring DSN
- `msg91_template_id`: approved MSG91/DLT template
- `email_from`: verified Resend sender
- domain/Route53/ACM values when moving off the default CloudFront hostname

Keep provider credentials out of tfvars.

## Secrets

Terraform generates:

- Aurora credentials and Prisma `DATABASE_URL` / `DIRECT_URL`
- `AUTH_SECRET`
- 32-byte base64 `CYCLE_DATA_ENCRYPTION_KEY`

It creates `TODO-...` placeholders for operator-owned provider/admin secrets.
Terraform ignores later secret-value changes, so replace each placeholder
through Secrets Manager after the first apply. The application readiness probe
rejects missing and `TODO` values.

Upstash secrets are optional (`enable_rate_limit_redis = true`); the default ECS
rate-limit backend is the provisioned DynamoDB table.

## Validate and apply

```bash
terraform fmt -recursive -check
terraform validate
terraform plan -out=femi9.plan
terraform show femi9.plan
terraform apply femi9.plan
```

Review replacement/destroy actions carefully. A task-definition replacement is
normal because ECS revisions are immutable; destruction of Aurora, S3 buckets,
networking, or the state bucket is not.

The initial ECR bootstrap can be targeted before an image exists:

```bash
terraform apply -target=aws_ecr_repository.app
```

After pushing the image, set `container_image_tag` and apply the complete stack.
See the repository-root `DEPLOY.md` for the build, smoke-test, and rollback
procedure.

## File map

| File | Responsibility |
|---|---|
| `versions.tf` | Terraform/provider constraints and S3 backend |
| `main.tf` | provider, account/AZ data, shared names and HTTPS site URL |
| `network.tf` | VPC, subnets, routing, NAT, security groups |
| `database.tf` | Aurora, backups, RDS Proxy |
| `secrets.tf` | generated and operator-managed Secrets Manager values |
| `ecr.tf` | container registry and lifecycle |
| `ecs.tf` | cluster, task, service, IAM, autoscaling |
| `alb.tf` | origin load balancer and health checks |
| `cloudfront.tf` | public HTTPS distribution and cache behaviors |
| `uploads.tf` | private image bucket, OAC, policies |
| `rate-limit.tf` | shared DynamoDB counters, TTL, task policy |
| `outputs.tf` | deployment endpoints and resource identifiers |
| `state-bootstrap/` | one-time encrypted/versioned state bucket |
