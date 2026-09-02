# ─────────────────────────────────────────────────────────────────────────────
# variables.tf
# All tunable inputs. Defaults are production-sane for a small/medium storefront
# in ap-south-1. Anything account-specific (certs, domains, KMS) is empty by
# default and clearly marked; supply it via terraform.tfvars (see the example).
# ─────────────────────────────────────────────────────────────────────────────

# ── Identity / region ────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for every resource. Fargate and Aurora MUST be co-located; keep this the same region the DB lives in."
  type        = string
  default     = "ap-south-1" # Mumbai
}

variable "project" {
  description = "Short project slug used to name and tag every resource."
  type        = string
  default     = "femi9"
}

variable "environment" {
  description = "Deployment environment (prod/staging/dev). Part of the name prefix and tags."
  type        = string
  default     = "prod"
}

# ── Networking ───────────────────────────────────────────────────────────────

variable "vpc_cidr" {
  description = "CIDR block for the VPC. Must be large enough for the four /24 subnets below."
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for the two public subnets (ALB + NAT). Order maps to the two AZs."
  type        = list(string)
  default     = ["10.20.0.0/24", "10.20.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDRs for the two private subnets (Fargate tasks + Aurora + RDS Proxy)."
  type        = list(string)
  default     = ["10.20.10.0/24", "10.20.11.0/24"]
}

variable "single_nat_gateway" {
  description = "true = one shared NAT GW (cheaper, single-AZ egress); false = one NAT GW per AZ (HA egress, ~2x cost)."
  type        = bool
  default     = true
}

variable "enable_nat" {
  description = "true = private subnets egress via NAT GW (needs an Elastic IP). false = NO NAT: ECS tasks run in PUBLIC subnets with a public IP for egress (SG still restricts inbound to the ALB). Use false when the account has no spare EIP; flip back to true once an EIP is available."
  type        = bool
  default     = true
}

# ── Container / ECS task sizing ──────────────────────────────────────────────

variable "container_image_tag" {
  description = "Image tag to deploy from the app's ECR repo (e.g. a git SHA or 'latest'). The repo is created by this stack; push the image before the ECS service can start."
  type        = string
  default     = "latest"
}

variable "container_port" {
  description = "Port the Next.js server listens on inside the container."
  type        = number
  default     = 3000
}

variable "task_cpu" {
  description = "Fargate task CPU units (256/512/1024/2048/4096). 512 = 0.5 vCPU."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory (MiB). Must be a valid pairing with task_cpu per Fargate rules."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Baseline number of running tasks (autoscaling may raise this up to max_capacity)."
  type        = number
  default     = 2
}

# ── ECS autoscaling ──────────────────────────────────────────────────────────

variable "min_capacity" {
  description = "Minimum task count the autoscaler will scale down to."
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum task count the autoscaler will scale up to."
  type        = number
  default     = 6
}

variable "cpu_target_value" {
  description = "Target average CPU utilization (%) for the CPU target-tracking policy."
  type        = number
  default     = 60
}

variable "request_count_target" {
  description = "Target ALB requests-per-task for the request-count target-tracking policy."
  type        = number
  default     = 1000
}

# ── Database (Aurora Serverless v2) ──────────────────────────────────────────

variable "db_name" {
  description = "Initial database name created in the Aurora cluster."
  type        = string
  default     = "femi9"
}

variable "db_master_username" {
  description = "Aurora master username. Cannot be a reserved word (e.g. 'admin', 'root')."
  type        = string
  default     = "femi9_admin"
}

variable "db_engine_version" {
  description = "aurora-postgresql engine version. TODO(operator): verify availability in the region with `aws rds describe-db-engine-versions --engine aurora-postgresql --region ap-south-1`."
  type        = string
  default     = "16.4"
}

variable "db_min_acu" {
  description = "Aurora Serverless v2 minimum capacity in ACUs (0.5 is the floor). Each ACU ~= 2 GiB RAM."
  type        = number
  default     = 0.5
}

variable "db_max_acu" {
  description = "Aurora Serverless v2 maximum capacity in ACUs. Caps burst cost; raise for heavier load."
  type        = number
  default     = 4
}

variable "db_instance_count" {
  description = "Number of serverless v2 instances. 2 = one writer + one reader in different AZs (Multi-AZ HA). 1 = writer only (cheaper, no automatic failover)."
  type        = number
  default     = 2
}

variable "db_backup_retention_days" {
  description = "Automated backup retention in days. > 0 also enables continuous backups / point-in-time recovery (PITR)."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Block accidental `terraform destroy` of the cluster. Keep true in prod."
  type        = bool
  default     = true
}

variable "db_skip_final_snapshot" {
  description = "Skip the final snapshot on cluster deletion. Keep false in prod so a snapshot is taken."
  type        = bool
  default     = false
}

# ── TLS / DNS (account-specific — leave empty to bring the stack up on HTTP) ──

variable "acm_certificate_arn" {
  description = "ARN of an ACM certificate in THIS region for the ALB HTTPS listener. If empty, only an HTTP:80 listener is created (fine for first bring-up; add the cert before going live). TODO(operator): request/validate a cert for your domain and paste its ARN."
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Public domain served by the ALB (e.g. shop.femi9.com). Optional; used for the Route53 record and as NEXT_PUBLIC_SITE_URL if set."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID to create an alias record for domain_name -> ALB. Leave empty to manage DNS yourself. TODO(operator): paste your hosted zone ID."
  type        = string
  default     = ""
}

# ── Observability / misc ─────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the app log group."
  type        = number
  default     = 30
}

variable "enable_alb_deletion_protection" {
  description = "Protect the ALB from accidental deletion. Keep true in prod."
  type        = bool
  default     = true
}

variable "enable_rate_limit_redis" {
  description = "Optionally create + inject Upstash Redis secrets. ECS uses the provisioned DynamoDB table by default."
  type        = bool
  default     = false
}

variable "msg91_template_id" {
  description = "DLT-approved MSG91 OTP template id. No longer on the sign-in path — that is WhatsApp now. This and MSG91_FLOW_TEMPLATE_ID are what deliver a redeemed reward code to a phone-only customer."
  type        = string
  default     = ""
}

variable "whatsapp_phone_number_id" {
  description = "WhatsApp Cloud API sender id — the numeric phone_number_id, NOT the phone number. Phone sign-in delivers its OTP over WhatsApp and nothing else, so leaving this empty removes the storefront's primary way in as well as every order confirmation."
  type        = string
  default     = ""
}

variable "whatsapp_template_language" {
  description = "Language code the WhatsApp templates were approved under, e.g. en or en_US. Empty = the app default (en). A wrong code fails with the same error as a template that does not exist."
  type        = string
  default     = ""
}

variable "email_from" {
  description = "Verified transactional sender, e.g. Femi9 <login@femi9.in>."
  type        = string
  default     = ""
}

variable "thara_enabled" {
  description = "Turn the Thara Model on for this environment (THARA_ENABLED). Every /api/thara route 404s and the storefront links stay hidden while false. Set true in staging."
  type        = bool
  default     = false
}

# ── Public (NEXT_PUBLIC_*) runtime values ────────────────────────────────────
# NOTE: NEXT_PUBLIC_* variables are inlined into the CLIENT bundle at BUILD time
# (`next build`), not read from the container at runtime. Set them as Docker
# build args in CI as well. They are exposed here so server-side code can also
# read them and so they are documented in one place.

variable "next_public_site_url" {
  description = "Public site URL (NEXT_PUBLIC_SITE_URL). If empty and domain_name is set, defaults to https://<domain_name>."
  type        = string
  default     = ""
}

variable "next_public_razorpay_key_id" {
  description = "Razorpay publishable key id (NEXT_PUBLIC_RAZORPAY_KEY_ID). Publishable, not secret. TODO(operator): set to your live/test key id (also pass at build time)."
  type        = string
  default     = ""
}

variable "next_public_sentry_dsn" {
  description = "Public Sentry DSN embedded in the browser bundle. DSNs are identifiers, not credentials."
  type        = string
  default     = ""
}
