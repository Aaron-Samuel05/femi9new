# ─────────────────────────────────────────────────────────────────────────────
# alb.tf
# Internet-facing Application Load Balancer in the public subnets, fronting the
# Fargate service in the private subnets.
#
#   Internet ─► ALB :443 (ACM cert) ─┐
#             ─► ALB :80  (redirect) ─┴─► target group (ip) ─► tasks :3000 /api/health
#
# If no ACM certificate ARN is supplied, the ALB comes up on plain HTTP:80
# (fine for an initial smoke test); add the cert to switch on HTTPS + redirect.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Whether we have a TLS cert to attach. Drives the HTTPS listener + redirect.
  has_cert = var.acm_certificate_arn != ""
}

resource "aws_lb" "this" {
  name               = "${local.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]

  enable_deletion_protection = var.enable_alb_deletion_protection
  idle_timeout               = 60
  drop_invalid_header_fields = true # defense-in-depth against header smuggling

  tags = merge(local.tags, { Name = "${local.name_prefix}-alb" })
}

# ── Target group ─────────────────────────────────────────────────────────────
# target_type = "ip" is required for Fargate (awsvpc networking): tasks register
# by ENI IP, not instance id.
resource "aws_lb_target_group" "this" {
  name        = "${local.name_prefix}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id

  # Give a task a few seconds to drain in-flight requests on deploy/scale-in.
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/api/health" # returns 200 (ok/degraded) — see app/api/health/route.ts
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-tg" })
}

# ── HTTPS listener (only when a cert is provided) ────────────────────────────
resource "aws_lb_listener" "https" {
  count             = local.has_cert ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  # Modern TLS policy (TLS 1.2+). Bump to a TLS 1.3-only policy if your clients allow.
  ssl_policy      = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  tags = local.tags
}

# ── HTTP listener :80 ────────────────────────────────────────────────────────
# With a cert → redirect everything to HTTPS. Without a cert → serve directly.
# Only one of these two exists at a time (mutually exclusive counts on port 80).

resource "aws_lb_listener" "http_redirect" {
  count             = local.has_cert ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      protocol    = "HTTPS"
      port        = "443"
      status_code = "HTTP_301"
    }
  }

  tags = local.tags
}

resource "aws_lb_listener" "http_forward" {
  count             = local.has_cert ? 0 : 1
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  tags = local.tags
}

# ── Optional DNS: alias domain_name → ALB ────────────────────────────────────
# Created only when BOTH a hosted zone id and a domain name are supplied.
resource "aws_route53_record" "alb" {
  count   = var.route53_zone_id != "" && var.domain_name != "" ? 1 : 0
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
