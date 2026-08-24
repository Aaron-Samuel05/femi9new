# ─────────────────────────────────────────────────────────────────────────────
# outputs.tf — the handful of values you need after an apply.
#
# Grouped per app where there are three of a thing, so `terraform output -json
# services` gives CI everything it needs to push and deploy in one read.
# ─────────────────────────────────────────────────────────────────────────────

output "services" {
  description = "Per-app deploy coordinates: ECR repo, ECS service, log group, and the canonical public URL. This is the map the deploy workflow reads."
  value = {
    for key, app in local.apps : key => {
      ecr_repository_url = aws_ecr_repository.app[key].repository_url
      ecs_service        = aws_ecs_service.app[key].name
      log_group          = aws_cloudwatch_log_group.app[key].name
      public_url         = local.app_urls[key]
      sites              = local.app_site_keys[key]
    }
  }
}

output "sites" {
  description = "Every public hostname, with the app behind it and the CloudFront distribution in front. The cloudfront_url works immediately, with no DNS and no certificate — use it to smoke-test each service before pointing a domain at anything."
  value = {
    for key, site in local.effective_sites : key => {
      app            = site.app
      host           = site.host
      cloudfront_url = "https://${aws_cloudfront_distribution.site[key].domain_name}"
      # What a CNAME/ALIAS for `host` should point at.
      cloudfront_domain = aws_cloudfront_distribution.site[key].domain_name
      distribution_id   = aws_cloudfront_distribution.site[key].id
      # Empty until a us-east-1 certificate is supplied; without one the
      # distribution cannot carry the hostname as an alias.
      aliases = aws_cloudfront_distribution.site[key].aliases
    }
  }
}

output "admin_hosts" {
  description = "Every hostname the console answers on. admin_allowed_cidrs guards all of them — and its CloudFront URLs too — or none."
  value       = local.admin_hosts
}

output "ecs_cluster_name" {
  description = "The one Fargate cluster all three services run in."
  value       = aws_ecs_cluster.this.name
}

output "alb_dns_name" {
  description = "Load balancer hostname. This is an ORIGIN, not somewhere to point DNS — a record aimed here bypasses CloudFront, and with it the free HTTPS certificate and the /uploads/* behaviour that makes product images resolve. Useful for `curl -H \"X-Platform-App: lumi9\"` when debugging which service a request lands on."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone id of the ALB, for hand-written Route53 alias records."
  value       = aws_lb.this.zone_id
}

output "database" {
  description = "Which cluster the three services actually run on, and whether this stack owns it. `owned = false` means an existing cluster is being reused — destroying this stack will NOT destroy it, and must not."
  value = {
    owned           = local.create_database
    writer_endpoint = local.db_direct_endpoint
    pooled_endpoint = local.db_pooled_endpoint
    database_name   = local.db_name
    reader_endpoint = local.create_database ? aws_rds_cluster.this[0].reader_endpoint : null
    proxied         = local.create_database
  }
}

output "db_schemas" {
  description = "Which Postgres schema holds what. These names appear in the connection strings AND in each image's entrypoint; they must agree."
  value       = local.db_schemas
}

output "uploads_bucket_name" {
  description = "Private S3 bucket the console writes product images to."
  value       = local.uploads_bucket_name
}

output "rate_limit_table_name" {
  description = "DynamoDB table every task shares for rate limiting."
  value       = aws_dynamodb_table.rate_limit.name
}

# ── Secrets ──────────────────────────────────────────────────────────────────
# NAMES only, never values. Terraform could print the connection strings — it
# holds them in state — and an output is the one place they would end up in CI
# logs, in a terminal's scrollback, and in whatever tool wraps this. Read a real
# value with `aws secretsmanager get-secret-value` when you actually need it.

output "secret_names_by_service" {
  description = "Which secrets each service is granted. The execution role for that service is scoped to exactly these — this is the isolation boundary, readable."
  value = {
    for key, secrets in local.service_secrets : key => sort(keys(secrets))
  }
}

output "placeholder_secrets_to_fill" {
  description = "Secrets created with a TODO value that an operator must set out of band. Anything still starting \"TODO\" is treated as ABSENT by the app, so the feature behind it is off (or, for the _LUMI9 ones, falls back to the shared account)."
  value       = sort([for k, v in aws_secretsmanager_secret.app : v.name])
}

output "next_steps" {
  description = "What has to happen after a first apply, in order."
  value       = <<-EOT
    1. Push an image to each ECR repo (see .github/workflows/deploy-platform.yml).
    2. Fill the placeholder secrets — `terraform output placeholder_secrets_to_fill`.
       Anything left as TODO reads as absent: payments and mail stay off.
    3. Seed each brand's catalogue with a one-off ECS task (README.md).
    4. Create the first admin — also a one-off task; there is no self-service
       sign-up and there should not be.
    5. Narrow admin_allowed_cidrs. It defaults to the whole internet so a first
       apply cannot lock the team out of their own back office; that default is
       not one to keep on a console that can refund money. It covers EVERY
       console hostname at once — see `terraform output admin_hosts`.
    6. Point DNS at each site's cloudfront_domain, NOT at alb_dns_name.
  EOT
}
