# ─────────────────────────────────────────────────────────────────────────────
# variables.tf — every tunable input to the platform stack.
#
# Defaults are production-sane for two small/medium storefronts in ap-south-1.
# Anything account-specific (certs, domains, hosted zones) defaults to empty and
# is marked TODO(operator); supply it in terraform.tfvars — see the example file.
# ─────────────────────────────────────────────────────────────────────────────

# ── Identity / region ────────────────────────────────────────────────────────

variable "aws_region" {
  description = "AWS region for every resource. Fargate and Aurora MUST be co-located."
  type        = string
  default     = "ap-south-1" # Mumbai
}

variable "project" {
  description = "Short slug used to name and tag every resource. Keep it distinct from the single-app stack's `femi9` so the two never collide on a name."
  type        = string
  default     = "femi9plat"
}

variable "environment" {
  description = "Deployment environment (prod/staging/dev). Part of the name prefix and of every tag."
  type        = string
  default     = "staging"
}

# ── Networking ───────────────────────────────────────────────────────────────
# NOTE the CIDR: 10.30/16, not the single-app stack's 10.20/16. They are
# deliberately non-overlapping so the two VPCs can be peered during a cutover.

variable "vpc_cidr" {
  description = "CIDR for the VPC. Must not overlap the single-app stack's 10.20.0.0/16 if you ever want to peer them during a cutover."
  type        = string
  default     = "10.30.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs for the two public subnets (ALB + NAT). Order maps to the two AZs."
  type        = list(string)
  default     = ["10.30.0.0/24", "10.30.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDRs for the two private subnets (Fargate tasks + Aurora + RDS Proxy)."
  type        = list(string)
  default     = ["10.30.10.0/24", "10.30.11.0/24"]
}

variable "single_nat_gateway" {
  description = "true = one shared NAT GW (cheaper, single-AZ egress); false = one per AZ (HA egress, ~2x cost)."
  type        = bool
  default     = true
}

variable "enable_nat" {
  description = "true = tasks run in private subnets and egress via NAT (needs an Elastic IP). false = NO NAT: tasks run in PUBLIC subnets with a public IP for egress; the security group still admits only the ALB. Use false when the account has no spare EIP."
  type        = bool
  default     = true
}

# ── Container images ─────────────────────────────────────────────────────────

variable "container_image_tag" {
  description = "Default image tag for every service. Each ECR repo is created by this stack; push an image before the service can start."
  type        = string
  default     = "latest"
}

variable "femi9_image_tag" {
  description = "Override the image tag for femi9-web only. Null = use container_image_tag. This is how one brand is rolled back without touching the other."
  type        = string
  default     = null
}

variable "lumi9_image_tag" {
  description = "Override the image tag for lumi9-web only. Null = use container_image_tag."
  type        = string
  default     = null
}

variable "admin_image_tag" {
  description = "Override the image tag for the console only. Null = use container_image_tag."
  type        = string
  default     = null
}

variable "container_port" {
  description = "Port every Next.js server listens on inside its container. All three images agree on 3000."
  type        = number
  default     = 3000
}

# ── Storefront task sizing + autoscaling ─────────────────────────────────────

variable "task_cpu" {
  description = "Fargate CPU units for a storefront task (256/512/1024/2048/4096). 512 = 0.5 vCPU."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate memory (MiB) for a storefront task. Must be a valid pairing with task_cpu."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Baseline running tasks per storefront. Autoscaling may raise it to max_capacity."
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum storefront tasks the autoscaler will scale down to."
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum storefront tasks the autoscaler will scale up to."
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

# ── Console task sizing ──────────────────────────────────────────────────────
# Separate knobs because the console's load profile has nothing in common with a
# storefront's: a dozen staff, no public traffic, no image rendering.

variable "admin_task_cpu" {
  description = "Fargate CPU units for a console task."
  type        = number
  default     = 512
}

variable "admin_task_memory" {
  description = "Fargate memory (MiB) for a console task."
  type        = number
  default     = 1024
}

variable "admin_desired_count" {
  description = "Baseline console tasks. 2 keeps the console up during a deploy; 1 is cheaper and briefly interrupts it."
  type        = number
  default     = 2
}

variable "admin_max_capacity" {
  description = "Maximum console tasks. It scales on CPU only — see ecs.tf."
  type        = number
  default     = 4
}

# ── Database (Aurora Serverless v2) ──────────────────────────────────────────

variable "db_name" {
  description = "Initial database created in the cluster. ONE database holds all three schemas (femi9 / lumi9 / platform) — the isolation boundary is the schema, not the database."
  type        = string
  default     = "femi9platform"
}

variable "db_master_username" {
  description = "Aurora master username. Cannot be a reserved word ('admin', 'root')."
  type        = string
  default     = "platform_admin"
}

variable "db_engine_version" {
  description = "aurora-postgresql engine version. TODO(operator): confirm availability with `aws rds describe-db-engine-versions --engine aurora-postgresql --region ap-south-1`."
  type        = string
  default     = "16.4"
}

variable "db_min_acu" {
  description = "Serverless v2 minimum capacity in ACUs (0.5 is the floor). One ACU is roughly 2 GiB RAM."
  type        = number
  default     = 0.5
}

variable "db_max_acu" {
  description = "Serverless v2 maximum capacity in ACUs. Caps burst cost. Two brands share this cluster, so it is set higher than the single-app stack's."
  type        = number
  default     = 8
}

variable "db_instance_count" {
  description = "Serverless v2 instances. 2 = writer + reader in different AZs (Multi-AZ HA). 1 = writer only, cheaper, no automatic failover."
  type        = number
  default     = 2
}

variable "db_backup_retention_days" {
  description = "Automated backup retention in days. Any value > 0 also enables point-in-time recovery."
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Block an accidental `terraform destroy` of the cluster. Keep true wherever real orders exist."
  type        = bool
  default     = true
}

variable "db_skip_final_snapshot" {
  description = "Skip the final snapshot on cluster deletion. Keep false in prod so a snapshot is always taken."
  type        = bool
  default     = false
}

# ── The three Postgres schemas ───────────────────────────────────────────────
# These names appear in the connection strings AND in each image's entrypoint
# (BRAND_DB_SCHEMA / PLATFORM_DB_SCHEMA). Changing one here without changing it
# there migrates one schema and reads another.

variable "femi9_schema" {
  description = "Postgres schema holding Femi9's data."
  type        = string
  default     = "femi9"
}

variable "lumi9_schema" {
  description = "Postgres schema holding Lumi9's data."
  type        = string
  default     = "lumi9"
}

variable "platform_schema" {
  description = "Postgres schema holding admin identity — which neither brand's client can reach."
  type        = string
  default     = "platform"
}

# ── TLS / DNS ────────────────────────────────────────────────────────────────

variable "acm_certificate_arn" {
  description = "ACM certificate ARN in THIS region for the ALB's own HTTPS listener. USUALLY UNNECESSARY: every site is fronted by CloudFront, which terminates TLS for the viewer, so the ALB is an origin rather than something a browser talks to. Set it only if you intend to point DNS straight at the load balancer — and if you do, the certificate has to cover every host at once, which the per-site CloudFront certificates do not. Leaving it empty gives the ALB an HTTP:80 listener; set alb_origin_protocol_policy to https-only once it has one."
  type        = string
  default     = ""
}

variable "additional_certificate_arns" {
  description = "Extra certificates attached to the HTTPS listener via SNI — for when the three hosts are on different domains and no single cert covers them all."
  type        = list(string)
  default     = []
}

# ── Public hostnames ─────────────────────────────────────────────────────────
#
# A SITE is one public hostname pointed at one app. It is deliberately not the
# same thing as an app, because the mapping is not one-to-one: the console
# answers on admin.femi9.in AND admin.lumi9.in, so that each brand's staff reach
# their back office on their own domain and neither has to learn the other's.
# One app, two sites, one ECS service.
#
# Each site gets its own CloudFront distribution. It has to: the two console
# hostnames sit on different registrable domains and therefore need different
# certificates, and a distribution carries one certificate.
#
#   sites = {
#     femi9       = { app = "femi9", host = "shop.femi9.in",  canonical = true, certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..." }
#     lumi9       = { app = "lumi9", host = "shop.lumi9.in",  canonical = true, certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..." }
#     admin_femi9 = { app = "admin", host = "admin.femi9.in",                   certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..." }
#     admin_lumi9 = { app = "admin", host = "admin.lumi9.in",                   certificate_arn = "arn:aws:acm:us-east-1:...:certificate/..." }
#   }
#
# Leave it EMPTY for a first apply. One distribution per app is synthesised, each
# on its free *.cloudfront.net name, and each still routes to the right app —
# see the X-Platform-App header in cloudfront.tf. Nothing needs DNS to be tested.

variable "sites" {
  description = "Public hostnames, keyed by an arbitrary name. `app` must be femi9, lumi9 or admin; several sites may share one app (the console does). `certificate_arn` MUST be in us-east-1 whatever aws_region says — CloudFront reads certificates from there only; empty means serve on the free *.cloudfront.net name. `canonical` marks the host an app advertises in its own URLs; storefronts need exactly one, the console needs none."
  type = map(object({
    app             = string
    host            = string
    certificate_arn = optional(string, "")
    canonical       = optional(bool, false)
  }))
  default = {}

  validation {
    # The app keys are fixed in main.tf's local.apps; a variable's validation
    # cannot read a local, so the list is repeated here. Adding a fourth brand
    # means editing both.
    condition     = alltrue([for s in var.sites : contains(["femi9", "lumi9", "admin"], s.app)])
    error_message = "Every site's `app` must be one of: femi9, lumi9, admin."
  }

  validation {
    condition     = alltrue([for s in var.sites : s.host != ""])
    error_message = "A site with an empty `host` routes nothing. Remove the entry instead."
  }

  validation {
    # Two sites on the same hostname would produce two ALB rules matching the
    # same Host header, and the lower-priority one would never fire.
    condition     = length(distinct([for s in var.sites : s.host])) == length(var.sites)
    error_message = "Two sites share a hostname. Each host must appear once."
  }

  validation {
    # More than one canonical host for an app means its own URLs are ambiguous —
    # and those URLs are payment callbacks and OAuth redirects.
    condition = alltrue([
      for app in ["femi9", "lumi9", "admin"] :
      length([for s in var.sites : s if s.app == app && s.canonical]) <= 1
    ])
    error_message = "An app has more than one canonical site. At most one host per app may be canonical."
  }

  validation {
    # Once ANY site is configured, the synthesised per-app fallback is gone --
    # so a storefront left out of the map would deploy with an empty
    # NEXT_PUBLIC_SITE_URL and a Google redirect URI of
    # "/api/auth/google/callback". Both fail at the worst possible moment, in a
    # payment callback or a sign-in, and neither shows up in a plan. Fail here.
    #
    # The console is exempt: not exposing it publicly at first is a legitimate
    # choice, and it advertises no URLs of its own.
    condition = length(var.sites) == 0 || alltrue([
      for app in ["femi9", "lumi9"] :
      length([for s in var.sites : s if s.app == app]) > 0
    ])
    error_message = "Both storefronts need a site once `sites` is non-empty: each advertises its own hostname in payment callbacks and sign-in links. Add one for femi9 and one for lumi9, or leave `sites` empty to use the per-app CloudFront defaults."
  }
}

variable "alb_default_app" {
  description = "Which service receives requests that match no host rule — that is, anyone hitting the ALB's own DNS name. Must be a key of local.apps. Never set this to \"admin\": it would put the console on a guessable hostname."
  type        = string
  default     = "femi9"

  validation {
    condition     = contains(["femi9", "lumi9"], var.alb_default_app)
    error_message = "alb_default_app must be femi9 or lumi9. Making the console the ALB default would expose it at the load balancer's own DNS name, where it is found by scanning rather than by knowing."
  }
}

variable "admin_allowed_cidrs" {
  description = "Source CIDRs permitted to reach the console — on EVERY hostname it answers on, and on its CloudFront URLs too. The default is open, because locking a team out of their own back office on first apply is worse than the exposure; but this console can refund money, and narrowing this is the single highest-value change to make after bring-up. TODO(operator)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "route53_zone_id" {
  description = "Route53 hosted zone id for alias records pointing each configured host at the ALB. Empty = manage DNS yourself. TODO(operator)."
  type        = string
  default     = ""
}

# ── Observability / misc ─────────────────────────────────────────────────────

variable "log_retention_days" {
  description = "CloudWatch Logs retention for every service's log group."
  type        = number
  default     = 30
}

variable "enable_alb_deletion_protection" {
  description = "Protect the ALB from deletion. Keep true in prod."
  type        = bool
  default     = true
}

variable "thara_enabled" {
  description = "Turn the Thara Model on (THARA_ENABLED). Femi9 only — Lumi9's brand config does not include the module, so the console 404s it there regardless of this."
  type        = bool
  default     = false
}

variable "msg91_template_id" {
  description = "DLT-approved MSG91 OTP template id. Femi9 only — Lumi9 signs in by emailed link and sends no SMS."
  type        = string
  default     = ""
}

variable "femi9_email_from" {
  description = "Femi9's verified transactional sender, e.g. Femi9 <login@femi9.in>."
  type        = string
  default     = ""
}

variable "lumi9_email_from" {
  description = "Lumi9's verified transactional sender, e.g. Lumi9 <hello@lumi9.in>. Empty = fall back to femi9_email_from, which WILL send Lumi9's sign-in links under Femi9's name. That reads as phishing to a parent who has never heard of Femi9; set it before Lumi9 takes real customers."
  type        = string
  default     = ""
}

# ── Public (NEXT_PUBLIC_*) values ────────────────────────────────────────────
# These are inlined into the CLIENT bundle at `next build` time, NOT read from
# the container. They are declared here because server code reads them too, and
# because one list of what each brand publishes is worth having. CI must pass
# the same values as --build-arg.

variable "femi9_public_razorpay_key_id" {
  description = "Femi9's Razorpay publishable key id. Publishable, not secret."
  type        = string
  default     = ""
}

variable "lumi9_public_razorpay_key_id" {
  description = "Lumi9's Razorpay publishable key id. Empty = fall back to Femi9's, which is what runs while both brands transact on one merchant account."
  type        = string
  default     = ""
}

variable "next_public_sentry_dsn" {
  description = "Public Sentry DSN embedded in the browser bundle. A DSN is an identifier, not a credential."
  type        = string
  default     = ""
}

# ── CloudFront ───────────────────────────────────────────────────────────────

variable "alb_origin_protocol_policy" {
  description = "How CloudFront talks to the ALB. \"http-only\" is correct while the ALB has no certificate (acm_certificate_arn empty) — the edge still terminates TLS for the viewer. Set \"https-only\" once the ALB has one, so the edge-to-origin hop is encrypted as well."
  type        = string
  default     = "http-only"

  validation {
    condition     = contains(["http-only", "https-only", "match-viewer"], var.alb_origin_protocol_policy)
    error_message = "alb_origin_protocol_policy must be http-only, https-only or match-viewer."
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Reusing what already exists
#
# The platform stack can stand up its own VPC and its own Aurora cluster, which
# is what you want for a fresh environment. It can also be pointed at ones that
# already exist, which is what you want when "one backend" means literally one
# database — the two storefronts and the console sharing the cluster Femi9's
# staging environment already runs on.
#
# THESE TWO GO TOGETHER. An Aurora cluster is only reachable from inside its own
# VPC, so reusing the database without reusing the network gives you three ECS
# services that cannot open a connection. Set both, or neither.
# ─────────────────────────────────────────────────────────────────────────────

variable "existing_network" {
  description = "Reuse an existing VPC instead of creating one. MUST be the VPC the existing database lives in — Aurora is not reachable across a VPC boundary without peering. Null creates a fresh VPC from vpc_cidr."
  type = object({
    vpc_id             = string
    public_subnet_ids  = list(string)
    private_subnet_ids = list(string)
  })
  default = null

  validation {
    condition     = var.existing_network == null || length(try(var.existing_network.public_subnet_ids, [])) >= 2
    error_message = "An ALB needs subnets in at least two availability zones."
  }
}

variable "existing_database" {
  description = "Reuse an existing Aurora cluster instead of creating one. `credentials_secret` is the Secrets Manager name holding {username, password} — Terraform reads it to compose the per-schema connection strings, so that value lands in THIS stack's state and the state must stay in the encrypted backend. `security_group_id` is the cluster's own group; an ingress rule is added to it for this stack's tasks, which is the one existing resource this stack modifies."
  type = object({
    cluster_identifier = string
    database_name      = string
    credentials_secret = string
    security_group_id  = string
  })
  default = null

  validation {
    # Encoding the instruction rather than trusting it. Every brand's data, the
    # admin identity table and the migrations all point at whatever this names;
    # a production cluster is not something to discover you have pointed three
    # new services and a `prisma migrate deploy` at.
    condition     = var.existing_database == null || !can(regex("(?i)prod", var.existing_database.cluster_identifier))
    error_message = "Refusing a cluster whose identifier contains \"prod\". This stack runs migrations and seeds against whatever it is given. If you genuinely mean to target a production cluster, that is a deliberate change to make here, in daylight."
  }
}

variable "femi9_schema_is_public" {
  description = "Femi9's staging data lives in `public`, not `femi9` — the rename in docs/RENAME-RUNBOOK.md has never been run. Set true to point Femi9 at `public` where it already is, and leave the rename as a separate, human-run exercise. Lumi9 and the platform get their own schemas either way, so the brands are still isolated by connection string."
  type        = bool
  default     = false
}
