# ─────────────────────────────────────────────────────────────────────────────
# main.tf
# Provider configuration, common data sources, and shared locals (name prefix,
# AZ selection, tags). No infrastructure "nouns" live here — see the per-domain
# files (network / database / ecs / alb / ecr / secrets).
# ─────────────────────────────────────────────────────────────────────────────

provider "aws" {
  region = var.aws_region

  # Applied to every taggable resource automatically. Per-resource `Name` tags
  # are added inline where they help in the console.
  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Current account id / partition — handy for building ARNs and scoping IAM.
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

# Pick the first two Availability Zones that are actually usable in the region.
# Using data (not hardcoded "ap-south-1a/b") keeps the config portable and
# avoids AZs that AWS has capacity-constrained for your account.
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  # Everything is named "<project>-<environment>-..." for easy console filtering.
  name_prefix = "${var.project}-${var.environment}"

  # Exactly two AZs for the 2-public + 2-private subnet layout.
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  # Reusable tag map for the few resources that want explicit tags on top of the
  # provider default_tags (mostly to add a readable Name).
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  # Resolve the public site URL once: explicit override wins, else derive from
  # the domain, else use the HTTPS CloudFront endpoint. Production must never
  # advertise the origin's plain-HTTP ALB URL in auth/payment callbacks.
  site_url = coalesce(
    var.next_public_site_url != "" ? var.next_public_site_url : null,
    var.domain_name != "" ? "https://${var.domain_name}" : null,
    "https://${aws_cloudfront_distribution.this.domain_name}",
  )
}
