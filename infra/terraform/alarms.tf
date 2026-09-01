# ─────────────────────────────────────────────────────────────────────────────
# alarms.tf — the thing that tells somebody.
#
# This stack had no alarms at all. Every failure mode it is capable of was
# equally silent: a 500 storm on one brand, a scheduled job that stopped
# running, a task that could not start, a filling dead-letter queue. Several of
# the worst findings in the launch audit were invisible for exactly that reason
# — not because they were subtle, but because nothing reports.
#
# ── What is alarmed, and what deliberately is not ───────────────────────────
# Everything here is a symptom a human has to act on, and every one of them is
# per-app: "Lumi9 is throwing 500s" is actionable in a way that "the platform
# is throwing 500s" is not, and a shared alarm would let one brand's outage
# hide inside the other's traffic.
#
# There is no latency alarm and no CPU alarm. Autoscaling already responds to
# load (ecs.tf), and a page that pages someone for a slow afternoon teaches
# them to ignore the topic — which is worse than having no topic.
#
# ── What this costs ─────────────────────────────────────────────────────────
# A standard CloudWatch alarm is $0.10/month and the first ten are free; this
# file creates seventeen at three services and six schedules, so call it a
# dollar a month. Every metric it reads is already being published (Container
# Insights is on in ecs.tf), and SNS email is free at this volume.
# ─────────────────────────────────────────────────────────────────────────────

# ── Where an alarm goes ──────────────────────────────────────────────────────
# One topic for the whole stack. Alarm names carry the app, so a filter in a
# mail client does what several topics would, without four subscriptions to
# confirm.
resource "aws_sns_topic" "alarms" {
  name = "${local.name_prefix}-alarms"
  tags = merge(local.tags, { Name = "${local.name_prefix}-alarms" })
}

# AWS emails a confirmation link and DELIVERS NOTHING UNTIL IT IS CLICKED.
# Terraform reports the subscription as created either way — `pending
# confirmation` is a successful apply — so check for the mail after the first
# one. `terraform output alarm_subscription_state` prints what AWS thinks.
resource "aws_sns_topic_subscription" "alarm_email" {
  count = var.alarm_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  # Alarms notify on the way in AND on the way out. Recovery is the half people
  # skip, and it is what stops an incident channel guessing whether the thing
  # that woke them at 2am is still happening.
  alarm_actions = [aws_sns_topic.alarms.arn]

  # An ALB metric identifies its target group by a suffix, not an ARN.
  tg_suffix  = { for k, tg in aws_lb_target_group.app : k => tg.arn_suffix }
  alb_suffix = aws_lb.this.arn_suffix
}

# ─────────────────────────────────────────────────────────────────────────────
# The application is failing
# ─────────────────────────────────────────────────────────────────────────────

# 5xx FROM THE APP, per brand. TargetResponse counts what the task returned, so
# this is "our code is throwing", not "the load balancer had a bad minute".
#
# `treat_missing_data = "notBreaching"`: a quiet console overnight emits no
# datapoints at all, and an alarm that goes red on silence is one nobody keeps.
resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each = local.apps

  alarm_name        = "${local.name_prefix}-${each.key}-5xx"
  alarm_description = "${each.key} is returning 5xx to real traffic. Check the /ecs/${local.name_prefix}-${each.key} log group first: a burst that starts at a deploy is the deploy."

  namespace   = "AWS/ApplicationELB"
  metric_name = "HTTPCode_Target_5XX_Count"
  dimensions = {
    LoadBalancer = local.alb_suffix
    TargetGroup  = local.tg_suffix[each.key]
  }

  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.alarm_5xx_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = local.tags
}

# No healthy tasks behind an app. This is the outage alarm: the ALB is serving
# 503s of its own and no application log will show it, because nothing is
# reaching the application.
#
# `breaching` on missing data, unlike every other alarm here — an app whose
# targets have all deregistered stops publishing HealthyHostCount entirely, so
# silence IS the failure.
resource "aws_cloudwatch_metric_alarm" "no_healthy_hosts" {
  for_each = local.apps

  alarm_name        = "${local.name_prefix}-${each.key}-no-healthy-hosts"
  alarm_description = "${each.key} has no healthy targets — the ALB is answering 503 for every request. Either the tasks are failing /api/health (which fails closed on an unreachable database, and on missing blocking configuration) or they are not starting at all."

  namespace   = "AWS/ApplicationELB"
  metric_name = "HealthyHostCount"
  dimensions = {
    LoadBalancer = local.alb_suffix
    TargetGroup  = local.tg_suffix[each.key]
  }

  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = local.tags
}

# Fewer tasks running than the service is meant to keep. Catches the failures
# that never reach a target group: CannotPullContainerError from an image tag
# that does not exist, a task exiting on a missing secret, a migration that
# fails on boot. All three have happened to this stack.
resource "aws_cloudwatch_metric_alarm" "service_task_count" {
  for_each = local.apps

  alarm_name        = "${local.name_prefix}-${each.key}-tasks-below-desired"
  alarm_description = "${each.key} is running fewer tasks than desired. Look at `aws ecs describe-services` stoppedReason: a pull error means container_image_tag names an image that was never pushed for THIS app."

  namespace   = "ECS/ContainerInsights"
  metric_name = "RunningTaskCount"
  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = aws_ecs_service.app[each.key].name
  }

  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = each.value.min
  comparison_operator = "LessThanThreshold"
  # Container Insights has to be enabled for this metric to exist at all
  # (ecs.tf turns it on). Missing data here means "no metric", not "no tasks",
  # and alarming on that would fire once at creation and stay red.
  treat_missing_data = "missing"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = local.tags
}

# ─────────────────────────────────────────────────────────────────────────────
# The scheduled jobs
#
# These are the quietest failures on the platform and the most expensive.
# Without `renew-subscriptions` a subscription ships one box and then nothing,
# forever, while the account page keeps showing a next-delivery date. Without
# `reconcile` an order whose webhook was missed sits `pending` indefinitely,
# holding its stock, with the money already taken. Nothing on any dashboard
# looks wrong in either case — which is precisely why they are alarmed and the
# storefront's latency is not.
# ─────────────────────────────────────────────────────────────────────────────

# EventBridge could not deliver — the target refused it, or the endpoint was
# unreachable. One alarm per job, because "a cron failed" sends someone to read
# six rules and "lumi9-reconcile failed" does not.
resource "aws_cloudwatch_metric_alarm" "cron_failed" {
  for_each = local.active_cron_jobs

  alarm_name        = "${local.name_prefix}-cron-${each.key}-failed"
  alarm_description = "The ${each.key} schedule could not be delivered. A 401 means CRON_SECRET in the EventBridge connection disagrees with the task's — the connection holds a COPY, so setting the secret out of band requires a terraform apply to reach it."

  namespace   = "AWS/Events"
  metric_name = "FailedInvocations"
  dimensions  = { RuleName = aws_cloudwatch_event_rule.cron[each.key].name }

  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = local.tags
}

# Anything in the dead-letter queue. Not a rate, not a threshold: one message
# means one scheduled run did not happen, and an empty queue is the healthy
# state. `alarm_actions` only — a DLQ that drains because the retention window
# expired is not a recovery worth announcing.
resource "aws_cloudwatch_metric_alarm" "cron_dlq" {
  alarm_name        = "${local.name_prefix}-cron-dead-letter"
  alarm_description = "A scheduled job failed every retry and its invocation is in the dead-letter queue (see the cron_dead_letter_queue output). Read the message, fix the cause, and re-run the job by hand — nothing replays it for you."

  namespace   = "AWS/SQS"
  metric_name = "ApproximateNumberOfMessagesVisible"
  dimensions  = { QueueName = aws_sqs_queue.cron_dlq.name }

  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  tags          = local.tags
}

# ─────────────────────────────────────────────────────────────────────────────
# The database
# ─────────────────────────────────────────────────────────────────────────────

# Only when this stack owns the cluster. Pointed at an existing one, the alarms
# belong with whoever owns that cluster, and creating them here would mean two
# stacks alarming on one database and two people acknowledging half of it.
resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  count = local.create_database ? 1 : 0

  alarm_name        = "${local.name_prefix}-db-cpu"
  alarm_description = "Aurora CPU is pinned. On Serverless v2 this usually means the ACU ceiling (db_max_acu) is the limit rather than the workload."

  namespace   = "AWS/RDS"
  metric_name = "CPUUtilization"
  dimensions  = { DBClusterIdentifier = aws_rds_cluster.this[0].cluster_identifier }

  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 90
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"

  alarm_actions = local.alarm_actions
  ok_actions    = local.alarm_actions
  tags          = local.tags
}

output "alarm_topic_arn" {
  description = "SNS topic every alarm publishes to. Subscribe a chat webhook or a pager to it as well as the email."
  value       = aws_sns_topic.alarms.arn
}

output "alarm_subscription_state" {
  description = "Whether the email subscription has been CONFIRMED. `pending confirmation` means AWS sent a link nobody has clicked, and the alarms are reporting to nobody — a successful apply either way."
  value = var.alarm_email == "" ? "no alarm_email set - alarms report to nobody" : try(
    aws_sns_topic_subscription.alarm_email[0].pending_confirmation
    ? "PENDING - check ${var.alarm_email} for the confirmation link; nothing is being delivered until it is clicked"
    : "confirmed - ${var.alarm_email}",
    "unknown",
  )
}
