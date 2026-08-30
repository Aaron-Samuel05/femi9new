# ─────────────────────────────────────────────────────────────────────────────
# cron.tf — the scheduled jobs each storefront depends on.
#
# ── Why this file exists ─────────────────────────────────────────────────────
# `CRON_SECRET` has been a placeholder secret in secrets.tf since this stack was
# written, described as the "EventBridge -> /api/cron shared secret". There was
# no EventBridge. Four `/api/cron/*` routes existed in femi9-web, all of them
# reachable and none of them ever called:
#
#   renew-subscriptions   every due Subscription generates its next order here.
#                         Without it a subscription is a row that ships one box
#                         and then nothing, forever, while the customer's
#                         account page keeps showing a "next delivery" date that
#                         quietly recedes into the past.
#   reconcile             asks Razorpay what actually happened to every order
#                         still `pending` after an hour. It is the backstop for
#                         a missed webhook: money taken, order stuck pending,
#                         stock reserved against a sale nobody will fulfil.
#   thara-close-cycle     closes the open Thara cycle and settles commissions.
#   thara-expire-vouchers expires unclaimed vouchers.
#
# None of these fail loudly when they do not run. That is the point of writing
# them down here: the failure mode of an unscheduled cron is a system that looks
# healthy on every dashboard and is quietly wrong about money.
#
# ── How it is wired ──────────────────────────────────────────────────────────
# EventBridge Rule (schedule) → API Destination (HTTPS POST) → the app's own
# route, authenticated by the shared secret in `x-cron-secret`.
#
# An API Destination carries a Connection, and a Connection with API_KEY auth
# sends exactly one header — which is why the route reads a header rather than a
# signature. `cronSecretOk()` in @femi9/core/cron-auth compares it in constant
# time and treats the "TODO-" placeholder as unset, so an unconfigured stack has
# an endpoint nothing can reach rather than an open one.
#
# ── The secret, and Terraform state ──────────────────────────────────────────
# The Connection needs the secret VALUE, not a reference, so this reads the
# current Secrets Manager version at plan time. Two consequences, both real:
#
#  1. It lands in Terraform state. State here is already sensitive — it holds
#     the generated Aurora password and every connection string built from it —
#     and lives in the encrypted, locked S3 backend for that reason. This adds
#     nothing to the threat model that was not already true.
#  2. Setting the real secret out of band (`aws secretsmanager put-secret-value`)
#     does NOT reach the Connection on its own. Run `terraform apply` afterwards.
#     Until you do, every scheduled call presents the placeholder, the routes
#     refuse it, and the jobs do not run — which is the safe direction to fail,
#     but it IS a failure and it is silent. Check `/api/cron/*` in the task logs
#     after rotating.
# ─────────────────────────────────────────────────────────────────────────────

data "aws_secretsmanager_secret_version" "cron_secret" {
  secret_id = aws_secretsmanager_secret.app["CRON_SECRET"].id
  # The seeded placeholder version exists from the first apply, so this never
  # races the secret's creation.
  depends_on = [aws_secretsmanager_secret_version.app]
}

locals {
  # Only schedule against an app that has a URL. On a first apply with `sites`
  # empty, app_urls still resolves to each distribution's *.cloudfront.net name;
  # an app with no site key at all resolves to "" and is skipped rather than
  # producing a rule that POSTs to nowhere.
  cron_targets = {
    femi9 = local.app_urls["femi9"]
    lumi9 = local.app_urls["lumi9"]
  }

  # Every job, per app. `schedule` is UTC — the platform's customers are in IST
  # (UTC+5:30), so the overnight windows below are chosen to land in the small
  # hours there rather than in the middle of a trading afternoon.
  #
  # A job is listed for an app only if that app SERVES it: Thara is a Femi9
  # programme, `brandConfig('lumi9').modules` excludes it, and lumi9-web has no
  # such routes. A rule pointing at a 404 would run forever, succeed as far as
  # EventBridge is concerned, and do nothing.
  cron_jobs = {
    # ── Femi9 ────────────────────────────────────────────────────────────────
    "femi9-renew-subscriptions" = {
      app      = "femi9"
      path     = "/api/cron/renew-subscriptions"
      schedule = "cron(30 20 * * ? *)" # 02:00 IST daily
    }
    "femi9-reconcile" = {
      app  = "femi9"
      path = "/api/cron/reconcile"
      # Hourly, because it is the backstop for a missed webhook and an order
      # sitting `pending` is holding stock the whole time.
      schedule = "rate(1 hour)"
    }
    "femi9-thara-expire-vouchers" = {
      app      = "femi9"
      path     = "/api/cron/thara-expire-vouchers"
      schedule = "cron(0 21 * * ? *)" # 02:30 IST daily
    }
    "femi9-thara-close-cycle" = {
      app  = "femi9"
      path = "/api/cron/thara-close-cycle"
      # Monthly. The route answers 400 when there is no open cycle to close,
      # which is the correct no-op and not an error worth alarming on.
      schedule = "cron(30 21 1 * ? *)" # 03:00 IST on the 1st
    }

    # ── Lumi9 ────────────────────────────────────────────────────────────────
    "lumi9-renew-subscriptions" = {
      app      = "lumi9"
      path     = "/api/cron/renew-subscriptions"
      schedule = "cron(45 20 * * ? *)" # 02:15 IST daily — offset from Femi9's
    }
    "lumi9-reconcile" = {
      app      = "lumi9"
      path     = "/api/cron/reconcile"
      schedule = "rate(1 hour)"
    }
  }

  # Drop any job whose app has no reachable URL yet.
  active_cron_jobs = {
    for name, job in local.cron_jobs :
    name => job if try(local.cron_targets[job.app], "") != ""
  }
}

# One Connection for the whole stack. The header name and value are identical
# for every job — the secret authenticates the CALLER, not the call.
resource "aws_cloudwatch_event_connection" "cron" {
  name               = "${local.name_prefix}-cron"
  description        = "Shared secret for the apps' /api/cron/* routes"
  authorization_type = "API_KEY"

  auth_parameters {
    api_key {
      key   = "x-cron-secret"
      value = data.aws_secretsmanager_secret_version.cron_secret.secret_string
    }
  }
}

resource "aws_cloudwatch_event_api_destination" "cron" {
  for_each = local.active_cron_jobs

  name                             = "${local.name_prefix}-${each.key}"
  description                      = "POST ${each.value.path} on ${each.value.app}"
  invocation_endpoint              = "${local.cron_targets[each.value.app]}${each.value.path}"
  http_method                      = "POST"
  connection_arn                   = aws_cloudwatch_event_connection.cron.arn
  invocation_rate_limit_per_second = 1
}

resource "aws_cloudwatch_event_rule" "cron" {
  for_each = local.active_cron_jobs

  name                = "${local.name_prefix}-${each.key}"
  description         = "Scheduled ${each.value.path} for ${each.value.app}"
  schedule_expression = each.value.schedule
  tags                = local.tags
}

# EventBridge assumes this to call an API Destination. Scoped to the
# destinations this file creates — not `*` — so the role cannot be used to
# invoke a destination somebody adds later for another purpose.
data "aws_iam_policy_document" "cron_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cron_invoke" {
  name               = "${local.name_prefix}-cron-invoke"
  assume_role_policy = data.aws_iam_policy_document.cron_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "cron_invoke" {
  statement {
    sid       = "InvokeCronDestinations"
    actions   = ["events:InvokeApiDestination"]
    resources = [for d in aws_cloudwatch_event_api_destination.cron : d.arn]
  }
}

resource "aws_iam_role_policy" "cron_invoke" {
  name   = "invoke-api-destinations"
  role   = aws_iam_role.cron_invoke.id
  policy = data.aws_iam_policy_document.cron_invoke.json
}

resource "aws_cloudwatch_event_target" "cron" {
  for_each = local.active_cron_jobs

  rule     = aws_cloudwatch_event_rule.cron[each.key].name
  arn      = aws_cloudwatch_event_api_destination.cron[each.key].arn
  role_arn = aws_iam_role.cron_invoke.arn

  # The routes read no body; an empty JSON object keeps EventBridge from sending
  # its own event envelope as one.
  input = jsonencode({})

  retry_policy {
    # A task rolling during the window, or a cold start, should not lose the run.
    maximum_retry_attempts       = 3
    maximum_event_age_in_seconds = 3600
  }

  dead_letter_config {
    arn = aws_sqs_queue.cron_dlq.arn
  }
}

# A run that exhausts its retries has to land SOMEWHERE. Without this, a night
# where every renewal attempt failed looks exactly like a night with nothing due.
resource "aws_sqs_queue" "cron_dlq" {
  name                      = "${local.name_prefix}-cron-dlq"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
  tags                      = local.tags
}

data "aws_iam_policy_document" "cron_dlq" {
  statement {
    sid       = "AllowEventBridgeDLQ"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.cron_dlq.arn]

    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }

    # Only the rules in this file, not any EventBridge rule in the account.
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [for r in aws_cloudwatch_event_rule.cron : r.arn]
    }
  }
}

resource "aws_sqs_queue_policy" "cron_dlq" {
  queue_url = aws_sqs_queue.cron_dlq.id
  policy    = data.aws_iam_policy_document.cron_dlq.json
}

output "cron_jobs" {
  description = "Scheduled job → the endpoint it POSTs to."
  value = {
    for name, job in local.active_cron_jobs :
    name => "${job.schedule}  ${local.cron_targets[job.app]}${job.path}"
  }
}

output "cron_dead_letter_queue" {
  description = "Runs that exhausted their retries land here. An empty queue is the healthy state."
  value       = aws_sqs_queue.cron_dlq.url
}
