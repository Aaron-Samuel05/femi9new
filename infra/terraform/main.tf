# ─────────────────────────────────────────────────────────────────────────────
# main.tf — the PLATFORM stack: both storefronts and the console, one backend.
#
# ── How this differs from apps/femi9-web/infra/terraform ────────────────────
# That stack deploys ONE app: one ECR repo, one target group, one service. It is
# still there, still applies, and is not touched by anything here — this is a
# parallel stack you cut over to, not an edit to the one currently running.
#
# This one deploys THREE services against ONE Aurora cluster:
#
#            ┌─ femi9.example      ──► femi9-web  tasks ──┐
#   ALB :443 ├─ lumi9.example      ──► lumi9-web  tasks ──┤──► RDS Proxy ──► Aurora
#            └─ console.example    ──► admin      tasks ──┘         │
#                                                                    ├─ schema femi9
#                                                                    ├─ schema lumi9
#                                                                    └─ schema platform
#
# One database, three schemas, and isolation that lives in the CONNECTION
# STRING rather than in a `where` clause somebody can forget. Each service is
# handed only the URLs it is entitled to: the Lumi9 tasks are never given
# Femi9's, so a bug in Lumi9 cannot read Femi9's customers even in principle.
#
# ── Everything is driven by local.apps ──────────────────────────────────────
# ecr.tf, ecs.tf and alb.tf all `for_each` over that one map. Adding a fourth
# brand is an entry in it plus a Dockerfile — not a copy of this directory.
# ─────────────────────────────────────────────────────────────────────────────

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

# Pick the first two usable AZs rather than hardcoding them, so the config is
# portable and avoids AZs AWS has capacity-constrained for this account.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Everything is named "<project>-<environment>-…" for console filtering.
  name_prefix = "${var.project}-${var.environment}"

  # Exactly two AZs for the 2-public + 2-private subnet layout.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # ── The three services ────────────────────────────────────────────────────
  #
  #   key          the ECS service / ECR repo / target group suffix
  #   brand        which brand's data it serves; null for the console, which
  #                serves both and picks per request from the admin's session
  #   host         the Host header that routes to it. Empty = no routing rule,
  #                which is fine before DNS exists: reach it through
  #                alb_default_app, or with `curl -H "Host: …"`.
  #   image_tag    per-app so one brand can be rolled back without the other
  #
  # Names are truncated where AWS caps them: a target group name is limited to
  # 32 characters and "femi9-prod-" already spends 11.
  apps = {
    femi9 = {
      brand     = "femi9"
      host      = var.femi9_host
      image_tag = coalesce(var.femi9_image_tag, var.container_image_tag)
      cpu       = var.task_cpu
      memory    = var.task_memory
      desired   = var.desired_count
      min       = var.min_capacity
      max       = var.max_capacity
    }
    lumi9 = {
      brand     = "lumi9"
      host      = var.lumi9_host
      image_tag = coalesce(var.lumi9_image_tag, var.container_image_tag)
      cpu       = var.task_cpu
      memory    = var.task_memory
      desired   = var.desired_count
      min       = var.min_capacity
      max       = var.max_capacity
    }
    admin = {
      brand = null
      host  = var.admin_host

      image_tag = coalesce(var.admin_image_tag, var.container_image_tag)
      # The console is internal: a handful of staff, no public traffic, no
      # rendering of product imagery. It does not need a storefront's sizing,
      # and it must not autoscale on the request-count metric that a storefront
      # uses — a hundred requests a day would keep it pinned at minimum anyway.
      cpu     = var.admin_task_cpu
      memory  = var.admin_task_memory
      desired = var.admin_desired_count
      min     = var.admin_desired_count
      max     = var.admin_max_capacity
    }
  }

  # ── The public URL each app advertises ────────────────────────────────────
  # This is what goes into NEXT_PUBLIC_SITE_URL, the OAuth redirect URI and
  # every payment callback, so it must be the address a BROWSER can reach over
  # HTTPS — never the origin behind the CDN.
  #
  # Order matters: the configured hostname wins; failing that, the app's own
  # CloudFront domain, which is HTTPS on the free default certificate. The ALB's
  # DNS name is deliberately not a candidate — it is plain HTTP, and Google
  # OAuth refuses a plain-HTTP redirect URI outright.
  app_urls = {
    for key, app in local.apps :
    key => app.host != "" ? "https://${app.host}" : "https://${aws_cloudfront_distribution.app[key].domain_name}"
  }
}
