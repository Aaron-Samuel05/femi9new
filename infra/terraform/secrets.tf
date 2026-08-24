# ─────────────────────────────────────────────────────────────────────────────
# secrets.tf — Secrets Manager entries, and the map of which service gets which.
#
# ── THIS FILE IS THE ISOLATION BOUNDARY ─────────────────────────────────────
# Schema-per-brand only isolates anything if a brand's tasks are never handed
# another brand's connection string. That is decided here, in
# `local.service_secrets`, and nowhere else. The Lumi9 task definition contains
# no Femi9 URL, so a Lumi9 bug — a wrong `dbFor()` argument, an injected brand,
# a mistake in a service — cannot read Femi9's customers. It fails instead,
# loudly, because the variable it would need is absent.
#
# ── Three kinds of secret live here ─────────────────────────────────────────
# 1. DERIVED — built by Terraform from the live Aurora and proxy endpoints, plus
#    AUTH_SECRET and the cycle-data key, generated once and held stable in state.
# 2. SHARED PLACEHOLDERS — third-party keys Terraform cannot know (Razorpay,
#    Resend, MSG91, …). Created with a TODO value and `ignore_changes`, so the
#    real value is set ONCE out of band and never clobbered by a later apply.
# 3. PER-BRAND OVERRIDES — the same keys suffixed _LUMI9. Also seeded with TODO,
#    and that is load-bearing rather than lazy: `usable()` in
#    packages/core/src/payment-identity.ts treats a value starting "TODO" as
#    ABSENT, so Lumi9 transparently falls back to the shared key until someone
#    puts a real one in. Splitting the brands onto their own merchant account is
#    then a single `put-secret-value` — no code change, no Terraform change, no
#    deploy.
#
# Because the derived secrets embed generated credentials, Terraform STATE IS
# SENSITIVE. Keep it in the encrypted, locked S3 backend — see versions.tf.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  secret_recovery_window_days = 7
}

# ─────────────────────────────────────────────────────────────────────────────
# 1. Derived
# ─────────────────────────────────────────────────────────────────────────────

# DB credentials JSON — consumed by RDS Proxy (database.tf), not by any app.
# Must be the {"username","password"} shape the proxy expects.
resource "aws_secretsmanager_secret" "db_credentials" {
  count = local.create_database ? 1 : 0

  name                    = "${local.name_prefix}/db-credentials"
  description             = "Aurora master username/password for RDS Proxy"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  count = local.create_database ? 1 : 0

  secret_id = aws_secretsmanager_secret.db_credentials[0].id
  secret_string = jsonencode({
    username = var.db_master_username
    password = random_password.db[0].result
  })
}

locals {
  # One database, three schemas. Every URL below is the same host and the same
  # credentials with a different `?schema=` — which is precisely the point:
  # isolation is a property of the connection, not of a column somebody has to
  # remember to filter on.
  #
  # FEMI9 IS A SPECIAL CASE WHEN REUSING AN EXISTING CLUSTER. Femi9's data is in
  # `public`; the rename to `femi9` is written, rehearsed, and has never been
  # run against anything live (docs/RENAME-RUNBOOK.md). Pointing this stack at
  # `femi9` would give it an empty schema and a storefront with no products,
  # while the real rows sat untouched a schema away. So femi9_schema_is_public
  # points it where the data actually is, and the rename stays a separate,
  # deliberate exercise. Lumi9 and the platform get their own schemas either
  # way, so the brands are still isolated by connection string.
  db_schemas = {
    FEMI9    = var.femi9_schema_is_public ? "public" : var.femi9_schema
    LUMI9    = var.lumi9_schema
    PLATFORM = var.platform_schema
  }

  # Pooled. When this stack builds the cluster that means through RDS Proxy —
  # Fargate scales out, Prisma opens a pool per task, and the proxy multiplexes
  # so a scale event cannot exhaust Aurora. When reusing somebody else's
  # cluster there is no proxy (see database.tf) and this is the writer endpoint,
  # which makes the connection ceiling something to watch.
  #
  # NOTE: if Prisma reports prepared-statement errors under proxy pinning,
  # append "&pgbouncer=true" here to turn prepared statements off.
  pooled_url = {
    for key, schema in local.db_schemas :
    key => "postgresql://${local.db_username}:${local.db_password}@${local.db_pooled_endpoint}:5432/${local.db_name}?schema=${schema}&sslmode=require"
  }

  # Direct to the writer, bypassing any pooler. Migrations need this: DDL
  # through a pooler can pin a connection or be rejected outright.
  direct_url = {
    for key, schema in local.db_schemas :
    key => "postgresql://${local.db_username}:${local.db_password}@${local.db_direct_endpoint}:5432/${local.db_name}?schema=${schema}&sslmode=require"
  }

  # Flattened into one map so the secrets below are a single for_each rather
  # than six near-identical resource blocks.
  connection_secrets = merge(
    { for key, url in local.pooled_url : "DATABASE_URL_${key}" => url },
    { for key, url in local.direct_url : "DIRECT_URL_${key}" => url },

    # Femi9 additionally gets the BARE names. `dbFor('femi9')` accepts
    # DATABASE_URL as a transitional fallback, femi9-web's entrypoint requires
    # it by that name, and eighteen of its files still reach for the raw client.
    # Lumi9 deliberately has no such fallback, so there is no bare pair pointing
    # at its schema and never should be.
    {
      DATABASE_URL = local.pooled_url["FEMI9"]
      DIRECT_URL   = local.direct_url["FEMI9"]
    },
  )
}

resource "aws_secretsmanager_secret" "connection" {
  for_each = local.connection_secrets

  name                    = "${local.name_prefix}/${each.key}"
  description             = "Prisma connection string: ${each.key}"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "connection" {
  for_each = local.connection_secrets

  secret_id     = aws_secretsmanager_secret.connection[each.key].id
  secret_string = each.value
}

# AUTH_SECRET — signs every session cookie on the platform.
#
# ONE secret for all three services, on purpose. The barrier between a Femi9
# session and a Lumi9 one is the JWT *audience* (`femi9-customer` vs
# `lumi9-customer` vs `femi9-admin-<brand>`), which is verified on every read;
# a token minted for one is rejected by the other even though both were signed
# here. Giving each service its own key would add no isolation the audience
# check does not already provide, and would mean three rotations instead of one.
resource "random_password" "auth_secret" {
  length  = 48
  special = false # base62 stays copy/paste-safe through every tool
}

resource "aws_secretsmanager_secret" "auth_secret" {
  name                    = "${local.name_prefix}/AUTH_SECRET"
  description             = "Session signing key — shared; the JWT audience is what separates the brands"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id     = aws_secretsmanager_secret.auth_secret.id
  secret_string = random_password.auth_secret.result
}

# Field-level encryption for Femi9's period and symptom payloads. Generated
# once; rotating it needs a decrypt/re-encrypt migration, which is why it is not
# in the rotatable placeholder set.
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
# 2 + 3. Operator-filled placeholders.
#
# After apply, set each real value ONCE:
#   aws secretsmanager put-secret-value \
#     --secret-id femi9plat-staging/RAZORPAY_KEY_SECRET \
#     --secret-string 'the_real_secret' --region ap-south-1
# Terraform ignores the value thereafter.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  shared_placeholder_secrets = {
    RAZORPAY_KEY_ID         = "TODO-rzp_live_xxxxxxxx"
    RAZORPAY_KEY_SECRET     = "TODO-change-me"
    RAZORPAY_WEBHOOK_SECRET = "TODO-change-me"
    MSG91_AUTH_KEY          = "TODO-change-me"
    RESEND_API_KEY          = "TODO-re_xxxxxxxx"
    RESEND_WEBHOOK_SECRET   = "TODO-whsec_change-me"
    CRON_SECRET             = "TODO-change-me"
    SENTRY_DSN              = "TODO-https://public@o0.ingest.sentry.io/0"
    GOOGLE_CLIENT_ID        = "TODO-xxxx.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET    = "TODO-GOCSPX-change-me"
  }

  # Lumi9's own accounts, when it gets them. Injected from day one carrying TODO
  # values, which core reads as "not set" and falls back to the shared key —
  # so this costs nothing until it is filled in, and costs no deploy when it is.
  #
  # RAZORPAY_WEBHOOK_SECRET_LUMI9 is the one that MUST be filled the moment the
  # merchant accounts diverge. Razorpay signs a webhook with the secret of the
  # account that took the charge, so a Lumi9 payment verified against Femi9's
  # secret fails its signature check and the order is never marked paid: money
  # taken, nothing shipped, and no error anyone sees.
  lumi9_placeholder_secrets = {
    RAZORPAY_KEY_ID_LUMI9         = "TODO-rzp_live_lumi9"
    RAZORPAY_KEY_SECRET_LUMI9     = "TODO-change-me"
    RAZORPAY_WEBHOOK_SECRET_LUMI9 = "TODO-change-me"
    RESEND_API_KEY_LUMI9          = "TODO-re_lumi9"
  }

  placeholder_secrets = merge(local.shared_placeholder_secrets, local.lumi9_placeholder_secrets)
}

resource "aws_secretsmanager_secret" "app" {
  for_each = local.placeholder_secrets

  name                    = "${local.name_prefix}/${each.key}"
  description             = "App secret ${each.key} — set the real value out of band after apply"
  recovery_window_in_days = local.secret_recovery_window_days
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "app" {
  for_each = local.placeholder_secrets

  secret_id     = aws_secretsmanager_secret.app[each.key].id
  secret_string = each.value

  # Seed the placeholder, then step aside: operator-managed thereafter.
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# Which service gets which secret.
#
# Read this as the answer to "what could this task possibly reach?" — the ECS
# execution role is scoped to exactly these ARNs and no others (ecs.tf), so it
# is an enforced answer rather than a documented intention.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  conn = { for k, s in aws_secretsmanager_secret.connection : k => s.arn }
  ph   = { for k, s in aws_secretsmanager_secret.app : k => s.arn }

  # Everything a storefront needs to charge a card and send mail.
  storefront_shared = {
    for k in keys(local.shared_placeholder_secrets) : k => local.ph[k]
  }

  service_secrets = {
    # Femi9 gets its own schema under both the bare and the suffixed names, and
    # nothing of Lumi9's.
    femi9 = merge(
      {
        DATABASE_URL              = local.conn["DATABASE_URL"]
        DIRECT_URL                = local.conn["DIRECT_URL"]
        DATABASE_URL_FEMI9        = local.conn["DATABASE_URL_FEMI9"]
        DIRECT_URL_FEMI9          = local.conn["DIRECT_URL_FEMI9"]
        AUTH_SECRET               = aws_secretsmanager_secret.auth_secret.arn
        CYCLE_DATA_ENCRYPTION_KEY = aws_secretsmanager_secret.cycle_data_encryption_key.arn
      },
      local.storefront_shared,
    )

    # Lumi9 gets ONLY its own schema. No bare DATABASE_URL: `dbFor('femi9')`
    # would accept one as Femi9's fallback and quietly succeed against Lumi9's
    # data, which is the exact failure this layout exists to prevent.
    lumi9 = merge(
      {
        DATABASE_URL_LUMI9 = local.conn["DATABASE_URL_LUMI9"]
        DIRECT_URL_LUMI9   = local.conn["DIRECT_URL_LUMI9"]
        AUTH_SECRET        = aws_secretsmanager_secret.auth_secret.arn
      },
      local.storefront_shared,
      { for k in keys(local.lumi9_placeholder_secrets) : k => local.ph[k] },
    )

    # The console is the one service that legitimately reaches both brands —
    # that is what it is for. It also holds the platform schema, which neither
    # storefront can see.
    admin = merge(
      {
        DATABASE_URL_PLATFORM     = local.conn["DATABASE_URL_PLATFORM"]
        DIRECT_URL_PLATFORM       = local.conn["DIRECT_URL_PLATFORM"]
        DATABASE_URL_FEMI9        = local.conn["DATABASE_URL_FEMI9"]
        DIRECT_URL_FEMI9          = local.conn["DIRECT_URL_FEMI9"]
        DATABASE_URL_LUMI9        = local.conn["DATABASE_URL_LUMI9"]
        DIRECT_URL_LUMI9          = local.conn["DIRECT_URL_LUMI9"]
        AUTH_SECRET               = aws_secretsmanager_secret.auth_secret.arn
        CYCLE_DATA_ENCRYPTION_KEY = aws_secretsmanager_secret.cycle_data_encryption_key.arn
      },
      # Refunds go back through the gateway that took the payment, so the
      # console needs both brands' Razorpay credentials.
      local.storefront_shared,
      { for k in keys(local.lumi9_placeholder_secrets) : k => local.ph[k] },
    )
  }
}
