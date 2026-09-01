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
  description = "Image tag every service runs. THIS STACK OWNS THE TASK DEFINITION, so an apply moves the services onto whatever this names — set it to a tag that exists. The deploy workflow pushes each build twice, as the git SHA and as `latest`, so this default resolves to the most recent build rather than to nothing; pin it to a SHA for a reproducible environment, and bump it after a deploy you want an apply to preserve."
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

variable "alarm_email" {
  description = "Address every CloudWatch alarm is emailed to: 5xx storms, an app with no healthy targets, tasks that will not start, a scheduled job that stopped running, anything in the cron dead-letter queue. Empty means the alarms exist and go red and TELL NOBODY. AWS sends a confirmation link that must be clicked before a single one is delivered — see the alarm_subscription_state output."
  type        = string
  default     = ""
}

variable "alarm_5xx_threshold" {
  description = "Target 5xx responses in a five-minute window before the per-app alarm fires. Low on purpose: a storefront serving five 500s has a broken page, not a busy afternoon. Raise it once real traffic sets a baseline; never mute the topic instead."
  type        = number
  default     = 5
}

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
  description = "Turn the Thara Model on (THARA_ENABLED). Femi9 only. The flag itself is global, so what keeps it out of Lumi9 is hasModule(brand, 'thara') in the console routes — not this variable. It is set on the femi9 SERVICE only; the console reads it too, and before those route gates existed, switching this on opened every /lumi9/api/thara/* endpoint."
  type        = bool
  default     = false
}

variable "msg91_template_id" {
  description = "DLT-approved MSG91 OTP template id. No longer on the sign-in path (that is WhatsApp now) — this and MSG91_FLOW_TEMPLATE_ID are what deliver a redeemed reward code to a phone-only customer. Femi9 only."
  type        = string
  default     = ""
}

variable "whatsapp_phone_number_id" {
  description = "WhatsApp Cloud API sender id — the numeric phone_number_id, NOT the phone number. Set on all three services: the storefronts send sign-in OTPs and order confirmations, and the console is where an order is marked delivered or cancelled. Both brands share one WABA and one approved template set today. Empty disables every WhatsApp message, which on the storefronts means phone sign-in is gone."
  type        = string
  default     = ""
}

variable "lumi9_whatsapp_phone_number_id" {
  description = "Lumi9's own WhatsApp sender, when it gets one. Empty = fall back to whatsapp_phone_number_id, which is the shared Femi9 number the approved templates live on. Same shape as lumi9_email_from: the per-brand name resolves first, the shared one is the fallback."
  type        = string
  default     = ""
}

variable "whatsapp_template_language" {
  description = "Language code the WhatsApp templates were approved under, e.g. en or en_US. Empty = the app default (en). A wrong code fails with the same error as a template that does not exist, so it is worth stating."
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

# ── Mail: SES per brand ──────────────────────────────────────────────────────
#
# Setting a domain here turns SES ON for that brand: ses.tf creates the identity,
# the DKIM keys, a configuration set and the bounce feed, and grants that brand's
# task role permission to send as exactly one address on it.
#
# TWO THINGS TERRAFORM CANNOT DO. The DKIM CNAMEs have to exist in DNS before
# SES will send (`terraform output ses_dns_records`), and a new SES account is in
# the SANDBOX, where it may only send to addresses it has individually verified —
# every real customer is refused. Production access is a support request; ask for
# it before launch day.
#
# Femi9 is empty on purpose. It is live on Resend and its mail works; moving it
# is a separate decision with its own warm-up, and it is two variables when
# somebody makes it.
variable "lumi9_ses_domain" {
  description = "Domain Lumi9 sends transactional mail from, e.g. lumi9.in. Empty = Lumi9 uses whatever MAIL_PROVIDER says instead (Resend, on Femi9's account and Femi9's domain, which reads as phishing to a parent who has never heard of Femi9). lumi9_email_from MUST be an address on this domain: the IAM policy pins ses:FromAddress to it."
  type        = string
  default     = ""
}

variable "femi9_ses_domain" {
  description = "Same for Femi9, and deliberately empty: Femi9 is live on Resend. Setting this creates the SES identity but does NOT move it — that is femi9_mail_provider — so a domain can be verified and warmed before anything is switched."
  type        = string
  default     = ""
}

variable "lumi9_mail_provider" {
  description = "Which transport Lumi9 sends through: \"ses\" or \"resend\". Stated rather than inferred, because Lumi9's task inherits the SHARED RESEND_API_KEY and \"whichever credential is present\" would silently send every Lumi9 sign-in link through Femi9's Resend account from a domain it has not verified. Empty = infer (Resend if a key is present)."
  type        = string
  default     = ""

  validation {
    condition     = contains(["", "ses", "resend"], var.lumi9_mail_provider)
    error_message = "lumi9_mail_provider must be empty, ses or resend."
  }
}

variable "femi9_mail_provider" {
  description = "Same for Femi9. Empty means it keeps inferring Resend from its API key, which is what it has always done and what is live today. Set \"ses\" only after femi9_ses_domain is verified AND out of the sandbox."
  type        = string
  default     = ""

  validation {
    condition     = contains(["", "ses", "resend"], var.femi9_mail_provider)
    error_message = "femi9_mail_provider must be empty, ses or resend."
  }
}

variable "ses_mail_from_subdomain" {
  description = "Label for the custom envelope MAIL FROM domain, e.g. \"mail\" gives mail.lumi9.in. It aligns SPF with the visible From so DMARC can pass on SPF as well as DKIM, and keeps bounce traffic off the parent domain's reputation. Needs an MX and a TXT record; without them SES falls back to its own MAIL FROM rather than failing to send."
  type        = string
  default     = "mail"
}

variable "lumi9_reply_to_email" {
  description = "Where a REPLY to Lumi9's transactional mail goes, when the From is a no-reply address. Empty means a reply vanishes — a parent hitting reply on her order confirmation is not doing anything unusual, and hearing nothing back is the same defect as the contact form that showed a green tick and discarded the message. Usually the same address as lumi9_care_inbox_email."
  type        = string
  default     = ""
}

variable "lumi9_require_profile_phone" {
  description = "Whether /welcome stops a signed-in Lumi9 shopper until she supplies a mobile number. Google and magic-link sign-in never carry one, so leaving this ON puts a second screen, an OTP round trip and an SMS bill between signing in and reaching /account - worth it only where the brand actually sends delivery SMS. OFF by default here: Lumi9 has no MSG91_TEMPLATE_ID of its own (ecs.tf sets it for femi9 only), so the OTP that screen asks for cannot be delivered in the first place. Turning it off loses no numbers - checkout still asks for and validates one, /account still offers the field, and a phone sign-in still writes it. Femi9 is unaffected: its task sets no such variable and an unset one means required."
  type        = bool
  default     = false
}

variable "lumi9_care_inbox_email" {
  description = "Where /contact messages are delivered for Lumi9, e.g. care@lumi9.in. The contact form FAILS CLOSED without it — it tells the visitor to email us directly rather than showing a confirmation for a message nobody will read, which is the defect it replaced. Not a secret: it is printed at the bottom of every page."
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
  description = "OVERRIDE for how CloudFront talks to the ALB. Empty (the default) DERIVES it: https-only once alb_origin_host and acm_certificate_arn are both set, http-only otherwise. Two settings that had to agree and could not check each other is how the edge-to-origin hop stayed in cleartext — leave this empty unless you are deliberately forcing a mismatch."
  type        = string
  default     = ""

  validation {
    condition     = contains(["", "http-only", "https-only", "match-viewer"], var.alb_origin_protocol_policy)
    error_message = "alb_origin_protocol_policy must be empty (derive it), http-only, https-only or match-viewer."
  }
}

# ── The edge-to-origin hop ───────────────────────────────────────────────────
#
# CloudFront terminates TLS for the VIEWER on every distribution here. That is
# not the whole path: the second hop, edge to ALB, is a separate connection with
# its own protocol, and it carries the same session cookies, names, addresses
# and phone numbers the viewer sent. On `http-only` it carries them in cleartext
# across the public internet between an edge location and ap-south-1.
#
# Encrypting it needs a hostname, not just a certificate. CloudFront validates
# the origin's certificate against THE ORIGIN DOMAIN NAME, and the origin domain
# name is the ALB's own `…elb.amazonaws.com` — which nobody can obtain a
# publicly-trusted certificate for. Setting https-only against the raw ELB name
# does not warn: every request fails at the TLS handshake and the site 502s.
#
# So the hop is encrypted by giving the ALB a name of your own:
#
#   1. Point a hostname at the ALB          origin.lumi9.in -> the ALB (alias)
#   2. Get an ACM certificate for it IN THIS REGION, and set acm_certificate_arn
#   3. Set alb_origin_host to that hostname
#
# The origin then becomes that hostname, the protocol policy derives to
# https-only, and both hops are encrypted. Leave alb_origin_host empty and
# nothing changes from the http-only posture that is correct for staging.
variable "alb_origin_host" {
  description = "Hostname that resolves to the ALB and is covered by acm_certificate_arn (in THIS region), e.g. origin.lumi9.in. Set it and CloudFront addresses the origin by that name over HTTPS, encrypting the edge-to-origin hop. Empty = CloudFront addresses the ALB's own elb.amazonaws.com name over HTTP, which is only acceptable while the data crossing it is not real customers'. It is NOT a public entrance: with alb_ingress_source = cloudfront the security group admits the edge and nothing else."
  type        = string
  default     = ""
}

# ── Who may reach the ALB ────────────────────────────────────────────────────
#
# The rate limiter keys on `CloudFront-Viewer-Address` because it is generated
# at the edge and a viewer cannot set it (packages/core/src/rate-limit.ts). That
# is true of traffic that ARRIVES THROUGH THE EDGE. While the ALB accepts
# connections from the whole internet, anyone who finds it sends that header
# themselves, varies it per request, and every per-IP limit on the platform —
# OTP sends, magic links, admin sign-in, checkout — stops existing, while the
# code reads as though it is throttling.
#
# It is fixed in the network, where it is one rule, rather than in the app,
# where it would be a check in every handler. AWS publishes the edge's own
# address ranges as a managed prefix list, so "CloudFront only" is expressible
# directly and stays correct as those ranges change.
variable "alb_ingress_source" {
  description = "Who may open a connection to the ALB. \"cloudfront\" (default) admits only AWS's com.amazonaws.global.cloudfront.origin-facing prefix list, which is the only path any site here is served over — and is what makes the edge-generated headers the app trusts actually trustworthy. \"internet\" restores 0.0.0.0/0 and with it a bypass of every per-IP rate limit; use it only to debug an origin directly, and pair it with alb_debug_cidrs instead if you can."
  type        = string
  default     = "cloudfront"

  validation {
    condition     = contains(["cloudfront", "internet"], var.alb_ingress_source)
    error_message = "alb_ingress_source must be cloudfront or internet."
  }
}

variable "alb_debug_cidrs" {
  description = "Extra source CIDRs allowed to reach the ALB directly, on top of alb_ingress_source — an office range while you are diagnosing an origin. Every entry here is a path that skips CloudFront, and therefore skips the edge headers the rate limiter keys on: a request from one of these is throttled by its X-Forwarded-For fallback, which the ALB writes and the caller cannot forge, so limits still hold. Keep it empty in production."
  type        = list(string)
  default     = []
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

variable "existing_uploads_bucket" {
  description = "Reuse an existing product-image bucket instead of creating one. REQUIRED WHENEVER existing_database IS SET: product rows store a site-relative path like /uploads/1786949614838-1.webp, so a shared database and a private bucket of your own means every product image 403s. `keep_distribution_arns` lists distributions that must KEEP read access - an S3 bucket has exactly one policy, so this stack rewrites it and anything omitted loses access."
  type = object({
    bucket                 = string
    keep_distribution_arns = optional(list(string), [])
  })
  default = null

  validation {
    condition     = var.existing_uploads_bucket == null || !can(regex("(?i)prod", var.existing_uploads_bucket.bucket))
    error_message = "Refusing a bucket whose name contains \"prod\". This stack rewrites the bucket policy of whatever it is given."
  }
}

variable "lumi9_disabled_auth_methods" {
  description = <<-EOT
    Sign-in methods to switch OFF on the Lumi9 storefront, e.g. ["google", "phone"].

    Each entry emits AUTH_<METHOD>_ENABLED=false, which src/lib/auth-methods.ts
    reads. Leave EMPTY in almost every case: the app already probes whether each
    provider is configured (GOOGLE_CLIENT_ID, MSG91_AUTH_KEY + MSG91_TEMPLATE_ID,
    RESEND_API_KEY) and hides what is not, treating a Terraform `TODO-` value as
    unset. Configure a provider and its method turns itself on; this list is not
    needed for that.

    It exists for what detection CANNOT see — a provider whose credentials are
    present and whose setup is still wrong. Google is the standing example: a
    client id and secret make googleConfigured() true, while the flow only works
    once this app's callback URL is registered on the OAuth client, which
    nothing here can check.

    Note that Lumi9 gets no MSG91_TEMPLATE_ID (see service_environment in
    ecs.tf), so "phone" is already off in this stack by construction.

    Turning off the LAST remaining method is refused by the app: the emailed link
    is forced back on and /api/health warns NO_AUTH_PROVIDER, because checkout is
    gated behind sign-in and a storefront nobody can sign into is one nobody can
    buy from — while still looking perfectly healthy.
  EOT
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for m in var.lumi9_disabled_auth_methods : contains(["google", "phone", "email"], m)
    ])
    error_message = "Valid methods are: google, phone, email."
  }

  validation {
    condition     = length(var.lumi9_disabled_auth_methods) < 3
    error_message = "Refusing to disable every sign-in method: checkout is gated, so nobody could complete an order."
  }
}
