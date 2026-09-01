# ─────────────────────────────────────────────────────────────────────────────
# ecs.tf — one Fargate cluster, three services.
#
# Everything here is `for_each` over local.apps: log group, execution role, task
# role, task definition, service, autoscaling. Three services means three of
# each, and adding a fourth brand adds no code.
#
# ── Why a separate EXECUTION ROLE per service ───────────────────────────────
# The execution role is what reads the injected secrets, and it is scoped to
# exactly the ARNs that service's task definition names. One shared role would
# be scoped to the union — every service technically able to read every other
# brand's connection string, whether or not its task definition asked for one.
# The extra role is the difference between "Lumi9's tasks are not given Femi9's
# database URL" and "Lumi9's tasks cannot obtain it".
# ─────────────────────────────────────────────────────────────────────────────

# ── Logs ─────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "app" {
  for_each = local.apps

  name              = "/ecs/${local.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days
  tags              = merge(local.tags, { Name = "${local.name_prefix}-${each.key}-logs" })
}

# ── Cluster ──────────────────────────────────────────────────────────────────
# One cluster for all three. A cluster is a scheduling and metrics boundary, not
# a security one — isolation is the task role, the security group and the
# connection string — so three clusters would buy nothing and cost three
# dashboards to look at during an incident.
resource "aws_ecs_cluster" "this" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-cluster" })
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # Baseline on on-demand FARGATE. Add a FARGATE_SPOT strategy here for cheaper
  # burst capacity that tolerates interruption.
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# IAM
# ─────────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# ── Execution role: the ECS AGENT's identity ─────────────────────────────────
# Pulls from ECR, writes logs, reads the injected secrets.
resource "aws_iam_role" "task_execution" {
  for_each = local.apps

  name               = "${local.name_prefix}-${each.key}-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  for_each = aws_iam_role.task_execution

  role       = each.value.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Read exactly this service's secrets — nothing else in the account.
data "aws_iam_policy_document" "task_execution_secrets" {
  for_each = local.service_secrets

  statement {
    sid       = "ReadInjectedSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(each.value)
  }
  # If these secrets are re-encrypted with a customer-managed KMS key, add a
  # kms:Decrypt statement for that key ARN here.
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  for_each = local.service_secrets

  name   = "read-${each.key}-secrets"
  role   = aws_iam_role.task_execution[each.key].id
  policy = data.aws_iam_policy_document.task_execution_secrets[each.key].json
}

# ── Task role: the APPLICATION's identity at runtime ─────────────────────────
resource "aws_iam_role" "task" {
  for_each = local.apps

  name               = "${local.name_prefix}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

# Permissions for `aws ecs execute-command` — an interactive shell into a task,
# which is how you debug a container without SSHing anywhere. Remove this and
# the enable_execute_command below together if that is not wanted.
data "aws_iam_policy_document" "task_exec_ssm" {
  statement {
    sid = "EcsExecSSMChannel"
    actions = [
      "ssmmessages:CreateControlChannel",
      "ssmmessages:CreateDataChannel",
      "ssmmessages:OpenControlChannel",
      "ssmmessages:OpenDataChannel",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "task_exec_ssm" {
  for_each = aws_iam_role.task

  name   = "ecs-exec-ssm"
  role   = each.value.id
  policy = data.aws_iam_policy_document.task_exec_ssm.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Task definitions
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Non-secret runtime environment, per service.
  #
  # NEXT_PUBLIC_* also appear here even though they are inlined into the client
  # bundle at build time: server code reads them too, and having one list of
  # what a brand publishes is worth the small redundancy. CI must pass the same
  # values as --build-arg or the two will disagree.
  #
  # SITE_URL IS NOT THE SAME VARIABLE AS NEXT_PUBLIC_SITE_URL. A NEXT_PUBLIC_*
  # name is INLINED BY THE BUILD: the Docker build stage has no deploy
  # configuration, so whatever the image was built with is what the client
  # bundle carries forever, and a value written into a task definition under
  # that name reaches no client code at all - only server code that happens to
  # read the same name.
  #
  # apps/lumi9-web/src/lib/seo.ts reads SITE_URL FIRST and deliberately does not
  # take a public name: canonicals, sitemap.xml, robots.txt and every JSON-LD
  # @id resolve through it, and the robots staging guard has to be able to fire
  # at RUNTIME. With only the public name in the task, SITE_URL was absent
  # entirely and every deploy fell back to the CANONICAL_ORIGIN compiled into
  # the image - right on production by luck, and silently wrong everywhere else,
  # where it makes a staging deploy claim production's canonicals.
  #
  # So both are emitted, from the same local, for every service. An app with no
  # site configured yet gets "", which the app reads as unset exactly as before.
  base_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.container_port) },
    # Next's standalone server binds localhost unless told otherwise, and a task
    # bound to localhost never passes an ALB health check.
    { name = "HOSTNAME", value = "0.0.0.0" },
    { name = "SENTRY_ENVIRONMENT", value = var.environment },
    { name = "NEXT_PUBLIC_SENTRY_ENVIRONMENT", value = var.environment },
    { name = "NEXT_PUBLIC_SENTRY_DSN", value = var.next_public_sentry_dsn },
    # In base_environment because all THREE services send WhatsApp: the
    # storefronts mint sign-in OTPs and order confirmations, and the console is
    # where an order is marked delivered or cancelled. A task holding the token
    # but not the sender id sends nothing, and says so only in a log line.
    { name = "WHATSAPP_PHONE_NUMBER_ID", value = var.whatsapp_phone_number_id },
    # Empty = the app default (en). Must match the language the templates were
    # approved under; a mismatch fails exactly like a missing template.
    { name = "WHATSAPP_TEMPLATE_LANGUAGE", value = var.whatsapp_template_language },
  ]

  service_environment = {
    femi9 = concat(local.base_environment, [
      { name = "SITE_URL", value = local.app_urls["femi9"] },
      { name = "NEXT_PUBLIC_SITE_URL", value = local.app_urls["femi9"] },
      { name = "GOOGLE_REDIRECT_URI", value = "${local.app_urls["femi9"]}/api/auth/google/callback" },
      { name = "NEXT_PUBLIC_RAZORPAY_KEY_ID", value = var.femi9_public_razorpay_key_id },
      { name = "MSG91_TEMPLATE_ID", value = var.msg91_template_id },
      { name = "EMAIL_FROM", value = var.femi9_email_from },
      # Empty today: Femi9 is live on Resend and infers it from its API key.
      # Set femi9_mail_provider only after femi9_ses_domain is verified AND out
      # of the SES sandbox — see ses.tf.
      { name = "MAIL_PROVIDER", value = var.femi9_mail_provider },
      { name = "SES_REGION", value = var.aws_region },
      { name = "SES_CONFIGURATION_SET", value = try(aws_sesv2_configuration_set.brand["femi9"].configuration_set_name, "") },
      # Without an entry here the app reads THARA_ENABLED as unset whatever a
      # laptop's .env says, every /api/thara route 404s, and the storefront
      # hides the programme. It has to be stated explicitly.
      { name = "THARA_ENABLED", value = var.thara_enabled ? "true" : "false" },
      { name = "UPLOADS_BUCKET", value = local.uploads_bucket_name },
      { name = "RATE_LIMIT_TABLE", value = aws_dynamodb_table.rate_limit.name },
    ])

    lumi9 = concat(local.base_environment, [
      # The one the storefront's SEO actually reads. See base_environment.
      { name = "SITE_URL", value = local.app_urls["lumi9"] },
      { name = "NEXT_PUBLIC_SITE_URL", value = local.app_urls["lumi9"] },
      # The per-brand name resolves first; the shared one is the fallback, and
      # is what runs while both brands are on one merchant account.
      { name = "NEXT_PUBLIC_RAZORPAY_KEY_ID_LUMI9", value = var.lumi9_public_razorpay_key_id },
      { name = "NEXT_PUBLIC_RAZORPAY_KEY_ID", value = var.femi9_public_razorpay_key_id },
      # Same shape for mail: Lumi9's verified sender if it has one, else Femi9's.
      # See variables.tf for why leaving this empty is a launch blocker.
      { name = "EMAIL_FROM_LUMI9", value = var.lumi9_email_from },
      { name = "EMAIL_FROM", value = var.femi9_email_from },
      { name = "EMAIL_REPLY_TO_LUMI9", value = var.lumi9_reply_to_email },

      # ── Which transport, and it is STATED ─────────────────────────────────
      # This task also carries the shared RESEND_API_KEY (Femi9's account), so
      # "use whichever credential is present" would send every Lumi9 sign-in
      # link through Femi9's Resend account from a domain that account has not
      # verified. mail-identity.ts reads this name first for exactly that
      # reason. Empty is a valid value and means "infer", which is the old
      # behaviour.
      { name = "MAIL_PROVIDER_LUMI9", value = var.lumi9_mail_provider },
      # SES carries no key: the task role is the credential (ses.tf). What it
      # does need is which region's endpoint to call and which configuration set
      # to send under — outside a config set the mail is delivered and the
      # bounce feed is silently lost.
      { name = "SES_REGION_LUMI9", value = var.aws_region },
      { name = "SES_CONFIGURATION_SET_LUMI9", value = try(aws_sesv2_configuration_set.brand["lumi9"].configuration_set_name, "") },
      # The topic the bounce webhook authenticates against. A valid AWS
      # signature only proves AWS sent the event, not that it came from OUR
      # topic, so /api/webhooks/ses fails closed without this.
      { name = "SES_EVENT_TOPIC_ARN", value = try(aws_sns_topic.ses_events["lumi9"].arn, "") },
      # And again for WhatsApp: Lumi9's own sender if it has one, else the
      # shared number from base_environment. Empty is read as absent, so this
      # costs nothing until the brands split.
      { name = "WHATSAPP_PHONE_NUMBER_ID_LUMI9", value = var.lumi9_whatsapp_phone_number_id },
      # The schema this brand's entrypoint migrates. It MUST agree with the
      # `?schema=` in DATABASE_URL_LUMI9 — see secrets.tf.
      { name = "BRAND_DB_SCHEMA", value = var.lumi9_schema },
      # Where /api/contact delivers. Absent, that route answers 503 and tells the
      # visitor to email us — deliberately, because the form it replaced showed a
      # green tick and discarded the message.
      { name = "CARE_INBOX_EMAIL_LUMI9", value = var.lumi9_care_inbox_email },
      # Whether /welcome stops a shopper for a mobile number. Stated explicitly
      # for the same reason THARA_ENABLED is on the femi9 service: the app reads
      # an absent variable as REQUIRED, so "off" only exists if it is written
      # here. Only the literal "false" turns it off - see profilePhoneRequired().
      { name = "REQUIRE_PROFILE_PHONE", value = var.lumi9_require_profile_phone ? "true" : "false" },
      { name = "UPLOADS_BUCKET", value = local.uploads_bucket_name },
      { name = "RATE_LIMIT_TABLE", value = aws_dynamodb_table.rate_limit.name },
      ],
      # Sign-in kill switches, emitted ONLY for the methods actually listed —
      # an unset variable means "follow the provider probe", so writing an empty
      # value here would be a third state the app has to interpret. See
      # var.lumi9_disabled_auth_methods for when this is the right tool and when
      # configuring the provider is.
      [
        for m in var.lumi9_disabled_auth_methods :
        { name = "AUTH_${upper(m)}_ENABLED", value = "false" }
    ])

    admin = concat(local.base_environment, [
      # The console SENDS: marking an order shipped mails the customer, as the
      # brand that owns the order. So it carries both brands' mail identities
      # and both brands' provider choices, and ses.tf grants its task role
      # permission to send as each SES brand.
      { name = "MAIL_PROVIDER", value = var.femi9_mail_provider },
      { name = "MAIL_PROVIDER_LUMI9", value = var.lumi9_mail_provider },
      { name = "SES_REGION", value = var.aws_region },
      { name = "SES_CONFIGURATION_SET", value = try(aws_sesv2_configuration_set.brand["femi9"].configuration_set_name, "") },
      { name = "SES_CONFIGURATION_SET_LUMI9", value = try(aws_sesv2_configuration_set.brand["lumi9"].configuration_set_name, "") },
      { name = "EMAIL_REPLY_TO_LUMI9", value = var.lumi9_reply_to_email },
      { name = "SITE_URL", value = local.app_urls["admin"] },
      { name = "NEXT_PUBLIC_SITE_URL", value = local.app_urls["admin"] },
      { name = "PLATFORM_DB_SCHEMA", value = var.platform_schema },
      # The console renders both brands' mail templates in previews and issues
      # refunds against both gateways, so it carries both identities.
      { name = "EMAIL_FROM", value = var.femi9_email_from },
      { name = "EMAIL_FROM_LUMI9", value = var.lumi9_email_from },
      { name = "UPLOADS_BUCKET", value = local.uploads_bucket_name },
      { name = "RATE_LIMIT_TABLE", value = aws_dynamodb_table.rate_limit.name },
    ])
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each = local.apps

  family = "${local.name_prefix}-${each.key}"

  # The account guardrail policy denies ecs:DeregisterTaskDefinition, so
  # Terraform must not try to delete old revisions when it registers a new one.
  skip_destroy = true

  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.task_execution[each.key].arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  runtime_platform {
    operating_system_family = "LINUX"
    # Switch to ARM64 (and build arm64 images) for cheaper Graviton Fargate.
    cpu_architecture = "X86_64"
  }

  container_definitions = jsonencode([
    {
      # The container name is "app" in all three, so one
      # amazon-ecs-render-task-definition step in CI covers every service.
      name      = "app"
      image     = "${aws_ecr_repository.app[each.key].repository_url}:${each.value.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = local.service_environment[each.key]
      secrets = [
        for name, arn in local.service_secrets[each.key] : { name = name, valueFrom = arn }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app[each.key].name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }

      # No container-level healthCheck block: the ALB target group's check on
      # /api/health is the source of truth, and duplicating it here means two
      # definitions of healthy that can disagree.
    }
  ])

  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}" })
}

# ─────────────────────────────────────────────────────────────────────────────
# Services
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_ecs_service" "app" {
  for_each = local.apps

  name            = "${local.name_prefix}-${each.key}"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app[each.key].arn
  desired_count   = each.value.desired
  launch_type     = "FARGATE"

  # Roll forward without dropping below capacity; allow a brief overlap.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  enable_execute_command = true

  # Each image runs `prisma migrate deploy` before it serves, so a cold task
  # needs longer than a warm one. Under this grace period a first-ever deploy
  # against an empty schema can be killed mid-migration.
  health_check_grace_period_seconds = 120

  network_configuration {
    # With NAT: tasks stay private and egress through the NAT gateway.
    # Without NAT (no spare EIP): tasks run in PUBLIC subnets with a public IP
    # for egress. Inbound is still ALB-only via aws_security_group.app, so
    # nothing but the load balancer can reach a container either way.
    subnets          = local.tasks_in_private ? local.private_subnet_ids : local.public_subnet_ids
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = local.tasks_in_private ? false : true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app[each.key].arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # Autoscaling owns desired_count after the first deploy — don't let a later
  # apply reset it and drop live capacity.
  lifecycle {
    ignore_changes = [desired_count]
  }

  # A service can only register targets once a listener is wired to the group.
  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http_forward,
    aws_lb_listener.http_redirect,
    aws_iam_role_policy.task_execution_secrets,
  ]

  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}" })
}

# ─────────────────────────────────────────────────────────────────────────────
# Autoscaling (Application Auto Scaling, target tracking)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_appautoscaling_target" "ecs" {
  for_each = local.apps

  max_capacity       = each.value.max
  min_capacity       = each.value.min
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app[each.key].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU target tracking — applies to all three.
resource "aws_appautoscaling_policy" "cpu" {
  for_each = local.apps

  name               = "${local.name_prefix}-${each.key}-cpu-tt"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.cpu_target_value
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

# Requests-per-task target tracking — STOREFRONTS ONLY.
#
# The console is excluded deliberately. A dozen staff generate a request count
# so far below the target that this policy would hold it at minimum forever
# while still counting as a scaling policy that fires alarms and shows up in
# every capacity review. Its CPU policy above is the one that means anything.
resource "aws_appautoscaling_policy" "requests" {
  for_each = { for key, app in local.apps : key => app if app.brand != null }

  name               = "${local.name_prefix}-${each.key}-req-tt"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs[each.key].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs[each.key].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs[each.key].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      # Ties the metric to THIS load balancer and THIS target group.
      resource_label = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.app[each.key].arn_suffix}"
    }
    target_value       = var.request_count_target
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}
