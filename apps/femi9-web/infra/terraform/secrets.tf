# ─────────────────────────────────────────────────────────────────────────────
# secrets.tf
# AWS Secrets Manager secrets consumed by the ECS task (see ecs.tf `secrets`).
#
# Two kinds of secret live here:
#   1. DERIVED (fully managed by Terraform): the DB credentials JSON for RDS
#      Proxy, and DATABASE_URL / DIRECT_URL built from the live Aurora + proxy
#      endpoints. AUTH_SECRET is generated once and kept stable in state.
#   2. OPERATOR-FILLED placeholders: third-party API keys we cannot know
#      (Razorpay, MSG91, Resend, Sentry, admin bootstrap). These are created with
#      a "TODO" value and `ignore_changes`, so you set the real value ONCE in the
#      console/CLI and Terraform will never clobber it on subsequent applies.
#
# IMPORTANT: because the derived secrets embed generated credentials, Terraform
# STATE is sensitive — keep it in the encrypted S3 backend (see versions.tf).
# ─────────────────────────────────────────────────────────────────────────────

# recovery_window_in_days = 0 means a destroyed secret is deleted immediately
# (no 7–30 day soft-delete), which makes iterative apply/destroy painless during
# setup. For a locked-down prod account you may prefer 7–30 for undo safety.
locals {
  secret_recovery_window_days = 7
}

# ─────────────────────────────────────────────────────────────────────────────
# 1a. DB credentials JSON — consumed by RDS Proxy (database.tf), not the app.
#     Must be the {"username","password"} shape RDS Proxy expects.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${local.name_prefix}/db-credentials"
  description             = "Aurora master username/password for RDS Proxy"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db.result
  })
}

# ─────────────────────────────────────────────────────────────────────────────
# 1b. DATABASE_URL — pooled connection string through the RDS Proxy endpoint.
#     Used by the running app (Prisma `datasource url`).
#     NOTE: if you hit Prisma prepared-statement errors under proxy pinning,
#     append "&pgbouncer=true" to disable prepared statements.
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${local.name_prefix}/DATABASE_URL"
  description             = "Prisma pooled connection string (via RDS Proxy)"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.db_master_username}:${random_password.db.result}@${aws_db_proxy.this.endpoint}:5432/${var.db_name}?schema=public&sslmode=require"
}

# 1c. DIRECT_URL — direct connection to the Aurora writer, bypassing the proxy.
#     Used by `prisma migrate deploy` (migrations need a direct, unpooled link).
resource "aws_secretsmanager_secret" "direct_url" {
  name                    = "${local.name_prefix}/DIRECT_URL"
  description             = "Prisma direct connection string (Aurora writer, for migrations)"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "direct_url" {
  secret_id     = aws_secretsmanager_secret.direct_url.id
  secret_string = "postgresql://${var.db_master_username}:${random_password.db.result}@${aws_rds_cluster.this.endpoint}:5432/${var.db_name}?schema=public&sslmode=require"
}

# 1d. AUTH_SECRET — Auth.js/jose session-signing key. Generated once, then held
#     stable in state so sessions survive re-applies. Rotate by tainting this.
resource "random_password" "auth_secret" {
  length  = 48
  special = false # base62 keeps it copy/paste-safe everywhere
}

resource "aws_secretsmanager_secret" "auth_secret" {
  name                    = "${local.name_prefix}/AUTH_SECRET"
  description             = "Auth.js session signing secret"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id     = aws_secretsmanager_secret.auth_secret.id
  secret_string = random_password.auth_secret.result
}

# 1e. Field-level encryption key for sensitive cycle payloads. The key is
# generated once; rotating it requires decrypt/re-encrypt migration support.
resource "random_id" "cycle_data_encryption_key" {
  byte_length = 32
}

resource "aws_secretsmanager_secret" "cycle_data_encryption_key" {
  name                    = "${local.name_prefix}/CYCLE_DATA_ENCRYPTION_KEY"
  description             = "AES-256-GCM key for period and symptom payloads"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "cycle_data_encryption_key" {
  secret_id     = aws_secretsmanager_secret.cycle_data_encryption_key.id
  secret_string = random_id.cycle_data_encryption_key.b64_std
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. OPERATOR-FILLED placeholders.
#    Map key = the env var name the app expects. The created secret is named
#    "<prefix>/<KEY>". After `apply`, set each real value ONCE, e.g.:
#
#      aws secretsmanager put-secret-value \
#        --secret-id femi9-prod/RAZORPAY_KEY_SECRET \
#        --secret-string 'the_real_secret' --region ap-south-1
#
#    Terraform ignores changes to these values afterwards.
# ─────────────────────────────────────────────────────────────────────────────
locals {
  placeholder_secrets = {
    ADMIN_EMAIL             = "TODO-admin@example.com"                    # bootstrap admin login
    ADMIN_PASSWORD          = "TODO-change-me-strong-password"            # bootstrap admin password
    RAZORPAY_KEY_ID         = "TODO-rzp_live_xxxxxxxx"                    # server-side Razorpay key id
    RAZORPAY_KEY_SECRET     = "TODO-change-me"                            # Razorpay key secret
    RAZORPAY_WEBHOOK_SECRET = "TODO-change-me"                            # Razorpay webhook signing secret
    MSG91_AUTH_KEY          = "TODO-change-me"                            # MSG91 reward-code SMS (no longer sign-in)
    WHATSAPP_TOKEN          = "TODO-change-me"                            # WhatsApp Cloud API token — sign-in OTP + order messages
    RESEND_API_KEY          = "TODO-re_xxxxxxxx"                          # Resend transactional email key
    RESEND_WEBHOOK_SECRET   = "TODO-whsec_change-me"                      # Resend/Svix webhook signing secret
    CRON_SECRET             = "TODO-change-me"                            # EventBridge -> /api/cron shared secret
    SENTRY_DSN              = "TODO-https://public@o0.ingest.sentry.io/0" # Sentry DSN
    GOOGLE_CLIENT_ID        = "TODO-xxxx.apps.googleusercontent.com"      # Google OAuth (customer sign-in)
    GOOGLE_CLIENT_SECRET    = "TODO-GOCSPX-change-me"                     # Google OAuth client secret
  }
}

resource "aws_secretsmanager_secret" "app" {
  for_each                = local.placeholder_secrets
  name                    = "${local.name_prefix}/${each.key}"
  description             = "App secret ${each.key} — set the real value out-of-band after apply"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each      = local.placeholder_secrets
  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value

  # Seed the placeholder, then step aside: operator-managed thereafter.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. OPTIONAL: Upstash Redis credentials for shared/distributed rate limiting.
#    Created only when enable_rate_limit_redis = true.
# ─────────────────────────────────────────────────────────────────────────────
locals {
  redis_secrets = var.enable_rate_limit_redis ? {
    UPSTASH_REDIS_REST_URL   = "TODO-https://xxxx.upstash.io"
    UPSTASH_REDIS_REST_TOKEN = "TODO-change-me"
  } : {}
}

resource "aws_secretsmanager_secret" "redis" {
  for_each                = local.redis_secrets
  name                    = "${local.name_prefix}/${each.key}"
  description             = "Upstash Redis ${each.key} — set the real value out-of-band after apply"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "redis" {
  for_each      = local.redis_secrets
  secret_id     = aws_secretsmanager_secret.redis[each.key].id
  secret_string = each.value

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Convenience local: the full name→ARN map the ECS task injects as `secrets`.
# concat/merge keeps the derived + placeholder + optional-redis secrets together.
# ─────────────────────────────────────────────────────────────────────────────
locals {
  app_secret_arns = merge(
    {
      DATABASE_URL              = aws_secretsmanager_secret.database_url.arn
      DIRECT_URL                = aws_secretsmanager_secret.direct_url.arn
      AUTH_SECRET               = aws_secretsmanager_secret.auth_secret.arn
      CYCLE_DATA_ENCRYPTION_KEY = aws_secretsmanager_secret.cycle_data_encryption_key.arn
    },
    { for k, s in aws_secretsmanager_secret.app : k => s.arn },
    { for k, s in aws_secretsmanager_secret.redis : k => s.arn },
  )
}
