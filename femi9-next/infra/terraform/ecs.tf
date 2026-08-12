# ─────────────────────────────────────────────────────────────────────────────
# ecs.tf
# The compute layer: an ECS (Fargate) cluster, task definition, service behind
# the ALB target group, IAM roles, CloudWatch logs, and target-tracking
# autoscaling on CPU and ALB request count.
# ─────────────────────────────────────────────────────────────────────────────

# ── CloudWatch log group ─────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  tags              = merge(local.tags, { Name = "${local.name_prefix}-logs" })
}

# ── ECS cluster ──────────────────────────────────────────────────────────────
resource "aws_ecs_cluster" "this" {
  name = "${local.name_prefix}-cluster"

  # Container Insights = per-task CPU/mem/network metrics in CloudWatch.
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-cluster" })
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # All baseline tasks on on-demand FARGATE. Add a FARGATE_SPOT strategy here if
  # you want cheaper burst capacity that tolerates interruption.
  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# IAM roles
#   • execution role — used by the ECS AGENT to pull from ECR, write logs, and
#     read the injected secrets. This is the role that needs Secrets Manager.
#   • task role      — the app's own AWS identity at runtime (minimal here;
#     includes the channel perms needed for `aws ecs execute-command` debugging).
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

# ── Task execution role ──────────────────────────────────────────────────────
resource "aws_iam_role" "task_execution" {
  name               = "${local.name_prefix}-task-exec-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

# AWS-managed policy: ECR pull + CloudWatch Logs write.
resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Read exactly the secrets this task injects — nothing else.
data "aws_iam_policy_document" "task_execution_secrets" {
  statement {
    sid       = "ReadInjectedSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = values(local.app_secret_arns)
  }
  # If you re-encrypt these secrets with a customer-managed KMS key, add a
  # kms:Decrypt statement for that key ARN here.
}

resource "aws_iam_role_policy" "task_execution_secrets" {
  name   = "read-app-secrets"
  role   = aws_iam_role.task_execution.id
  policy = data.aws_iam_policy_document.task_execution_secrets.json
}

# ── Task role (application runtime identity) ─────────────────────────────────
resource "aws_iam_role" "task" {
  name               = "${local.name_prefix}-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
  tags               = local.tags
}

# Permissions for ECS Exec (interactive `execute-command` into a task) — handy
# for prod debugging without SSHing anywhere. Remove if you disable exec below.
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
  name   = "ecs-exec-ssm"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_exec_ssm.json
}

# ─────────────────────────────────────────────────────────────────────────────
# Task definition
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Fully-qualified image reference for this deploy.
  container_image = "${aws_ecr_repository.app.repository_url}:${var.container_image_tag}"

  # Non-secret runtime env. NEXT_PUBLIC_* are ALSO build-time (see variables.tf);
  # these entries cover server-side reads and keep everything documented in one
  # place.
  container_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.container_port) },
    { name = "HOSTNAME", value = "0.0.0.0" }, # Next standalone must bind all interfaces
    { name = "NEXT_PUBLIC_SITE_URL", value = local.site_url },
    { name = "GOOGLE_REDIRECT_URI", value = "${local.site_url}/api/auth/google/callback" },
    { name = "NEXT_PUBLIC_RAZORPAY_KEY_ID", value = var.next_public_razorpay_key_id },
    { name = "NEXT_PUBLIC_SENTRY_DSN", value = var.next_public_sentry_dsn },
    { name = "SENTRY_ENVIRONMENT", value = var.environment },
    { name = "NEXT_PUBLIC_SENTRY_ENVIRONMENT", value = var.environment },
    { name = "UPLOADS_BUCKET", value = aws_s3_bucket.uploads.bucket },
    { name = "RATE_LIMIT_TABLE", value = aws_dynamodb_table.rate_limit.name },
    { name = "MSG91_TEMPLATE_ID", value = var.msg91_template_id },
    { name = "EMAIL_FROM", value = var.email_from },
  ]

  # Secrets injected from Secrets Manager: name → valueFrom(ARN). Because each
  # secret stores a single raw string, the bare ARN injects the whole value.
  container_secrets = [
    for name, arn in local.app_secret_arns : { name = name, valueFrom = arn }
  ]
}

resource "aws_ecs_task_definition" "app" {
  family = "${local.name_prefix}-app"
  # This account's guardrail policy (RDS-ECS-CreateEditOwn-NoDelete) explicitly
  # denies ecs:DeregisterTaskDefinition, so Terraform must NOT try to delete old
  # revisions when it registers a new one — keep them instead.
  skip_destroy             = true
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    # Switch to "ARM64" (and build an arm64 image) for cheaper Graviton Fargate.
    cpu_architecture = "X86_64"
  }

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = local.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = local.container_environment
      secrets     = local.container_secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }

      # No container-level healthCheck: the Next.js standalone image ships no
      # curl/wget to probe with. The ALB target group health check on
      # /api/health is the source of truth for task health.
    }
  ])

  tags = merge(local.tags, { Name = "${local.name_prefix}-app" })
}

# ─────────────────────────────────────────────────────────────────────────────
# ECS service
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_ecs_service" "app" {
  name            = "${local.name_prefix}-svc"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Roll forward safely: never drop below capacity, allow a brief overlap.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Interactive debugging via `aws ecs execute-command`.
  enable_execute_command = true

  # Give a fresh task time to warm up before health checks can fail it.
  health_check_grace_period_seconds = 60

  network_configuration {
    # With NAT: tasks stay private and egress via the NAT GW.
    # Without NAT (no spare EIP): tasks run in PUBLIC subnets with a public IP for
    # egress. Inbound is still restricted to the ALB only by aws_security_group.app,
    # so nothing but the load balancer can reach the container.
    subnets          = var.enable_nat ? aws_subnet.private[*].id : aws_subnet.public[*].id
    security_groups  = [aws_security_group.app.id]
    assign_public_ip = var.enable_nat ? false : true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # Autoscaling owns desired_count after the first deploy — don't let Terraform
  # reset it on every apply.
  lifecycle {
    ignore_changes = [desired_count]
  }

  # The service can only register targets once a listener is wired to the TG.
  depends_on = [
    aws_lb_listener.https,
    aws_lb_listener.http_forward,
    aws_lb_listener.http_redirect,
    aws_iam_role_policy.task_execution_secrets,
  ]

  tags = merge(local.tags, { Name = "${local.name_prefix}-svc" })
}

# ─────────────────────────────────────────────────────────────────────────────
# Autoscaling (Application Auto Scaling, target tracking)
# ─────────────────────────────────────────────────────────────────────────────
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.app.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale to hold average CPU near the target.
resource "aws_appautoscaling_policy" "cpu" {
  name               = "${local.name_prefix}-cpu-tt"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.cpu_target_value
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}

# Scale to hold ALB requests-per-task near the target (traffic-driven scaling).
resource "aws_appautoscaling_policy" "requests" {
  name               = "${local.name_prefix}-req-tt"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      # Ties the metric to THIS ALB + target group.
      resource_label = "${aws_lb.this.arn_suffix}/${aws_lb_target_group.this.arn_suffix}"
    }
    target_value       = var.request_count_target
    scale_in_cooldown  = 120
    scale_out_cooldown = 60
  }
}
