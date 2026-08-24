# ─────────────────────────────────────────────────────────────────────────────
# alb.tf — one internet-facing load balancer, three target groups, host routing.
#
#   Internet ─► ALB :443 ─┬─ Host: femi9_host   ─► femi9 TG ─► femi9-web tasks
#                         ├─ Host: lumi9_host   ─► lumi9 TG ─► lumi9-web tasks
#                         ├─ Host: admin_host   ─► admin TG ─► admin      tasks
#                         └─ (no match)         ─► alb_default_app's TG
#            ALB :80  ─────► 301 to HTTPS (or forward, when no cert exists yet)
#
# ── Why one ALB and not three ───────────────────────────────────────────────
# Three would be tidier in one respect — total blast-radius separation — and
# worse in every other: three times the fixed hourly cost, three sets of DNS and
# certificates to keep in step, and three places to change a security rule. The
# separation that actually matters here is not the load balancer; it is the
# target group, the security group, and above all the connection string. Those
# are per-service already.
#
# Requests are separated by HOST, never by path. Each app is a Next.js
# application that believes it is mounted at `/`, so a path-prefix split would
# need a basePath rebuild of each image and would break every absolute asset
# URL. Host routing needs no cooperation from the app at all.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  has_cert = var.acm_certificate_arn != ""

  # Only apps that were actually given a hostname get a routing rule. Everything
  # else is reachable through the default action, which is what makes a first
  # apply useful before any DNS exists.
  routed_apps = { for key, app in local.apps : key => app if app.host != "" }

  # Deterministic priorities. `for_each` over a map iterates in sorted key
  # order, so index() over sorted keys gives every rule a stable number — and a
  # rule that never renumbers is a rule that never causes a spurious diff.
  routed_keys = sort(keys(local.routed_apps))

  # The console's allowlist is meaningful only if it is not the default.
  admin_is_restricted = !contains(var.admin_allowed_cidrs, "0.0.0.0/0")
}

resource "aws_lb" "this" {
  name               = "${local.name_prefix}-alb"
  load_balancer_type = "application"
  internal           = false
  subnets            = aws_subnet.public[*].id
  security_groups    = [aws_security_group.alb.id]

  enable_deletion_protection = var.enable_alb_deletion_protection
  idle_timeout               = 60
  drop_invalid_header_fields = true # defence in depth against header smuggling

  tags = merge(local.tags, { Name = "${local.name_prefix}-alb" })
}

# ── Target groups ────────────────────────────────────────────────────────────
# target_type = "ip" is required for Fargate: awsvpc tasks register by ENI IP.
#
# Every one of the three apps now serves /api/health, and each fails CLOSED —
# 503 when its database is unreachable. That is what makes a bad deploy stall
# with the previous revision still serving instead of replacing healthy tasks
# with broken ones.
resource "aws_lb_target_group" "app" {
  for_each = local.apps

  name        = "${local.name_prefix}-${each.key}"
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id

  # A few seconds for in-flight requests to drain on deploy or scale-in.
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}-tg" })
}

# ── Listeners ────────────────────────────────────────────────────────────────

resource "aws_lb_listener" "https" {
  count             = local.has_cert ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  # Anything that matches no host rule. Constrained by a variable validation to
  # a storefront: making the console the default would publish it at the load
  # balancer's own DNS name, where it is found by scanning rather than knowing.
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[var.alb_default_app].arn
  }

  tags = local.tags
}

# Extra certificates over SNI, for hosts on domains the primary cert misses.
resource "aws_lb_listener_certificate" "additional" {
  for_each = local.has_cert ? toset(var.additional_certificate_arns) : toset([])

  listener_arn    = aws_lb_listener.https[0].arn
  certificate_arn = each.value
}

# Port 80. With a cert → redirect. Without → serve directly, so a first apply is
# smoke-testable before ACM validation completes. The two counts are mutually
# exclusive; only ever one listener on :80.

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
    target_group_arn = aws_lb_target_group.app[var.alb_default_app].arn
  }

  tags = local.tags
}

locals {
  # Whichever listener exists is the one the rules attach to.
  primary_listener_arn = local.has_cert ? aws_lb_listener.https[0].arn : aws_lb_listener.http_forward[0].arn
}

# ── Routing rules ───────────────────────────────────────────────────────────
#
# Two independent signals reach the same target group:
#   • the Host header, once DNS points a hostname at this ALB
#   • X-Platform-App, injected by that app's CloudFront distribution
#
# The second exists because the first is unavailable before DNS: a viewer on
# `dxxxx.cloudfront.net` sends a Host that matches no rule, and without the
# header every brand's CDN would fall through to alb_default_app.
#
# Priorities, in bands, evaluated ascending — first match wins:
#   100-109  console allow  (host / header) AND an allowed source address
#   110-119  console deny   (host / header) catch-all -> 403
#   150-159  per-app CloudFront header forwards
#   200-209  per-app host forwards
#
# THE CONSOLE'S TWO SIGNALS MUST EACH BE GUARDED. Guarding only the hostname
# would leave the console's CloudFront URL as an unrestricted way in — the
# allowlist would look enforced and not be. Hence a matched allow/deny pair for
# each signal, and the generic rules below skip the console entirely when the
# allowlist is in force.

locals {
  # Each entry becomes one allow rule and one deny rule for the console.
  # Present only when the operator has actually narrowed admin_allowed_cidrs.
  admin_signals = local.admin_is_restricted ? merge(
    var.admin_host != "" ? { host = var.admin_host } : {},
    { header = "admin" },
  ) : {}

  # Offsets so each signal's allow and deny keep a fixed, non-colliding number.
  admin_signal_order = { host = 0, header = 1 }
}

resource "aws_lb_listener_rule" "admin_allow" {
  for_each = local.admin_signals

  listener_arn = local.primary_listener_arn
  priority     = 100 + local.admin_signal_order[each.key]

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app["admin"].arn
  }

  # Conditions are ANDed: the right signal AND an allowed source address.
  dynamic "condition" {
    for_each = each.key == "host" ? [each.value] : []
    content {
      host_header {
        values = [condition.value]
      }
    }
  }

  dynamic "condition" {
    for_each = each.key == "header" ? [each.value] : []
    content {
      http_header {
        http_header_name = "X-Platform-App"
        values           = [condition.value]
      }
    }
  }

  condition {
    source_ip {
      values = var.admin_allowed_cidrs
    }
  }

  tags = local.tags
}

# The deny half. ALB conditions cannot be negated, so "block everyone else" is a
# lower-priority catch-all on the same signal: anything reaching here matched
# the signal but not the source address above it.
#
# 403, not a redirect and not a 404. There is no useful ambiguity to preserve
# about whether a console exists — the hostname already said so — and a
# colleague on the wrong network deserves a status code that explains itself.
resource "aws_lb_listener_rule" "admin_deny" {
  for_each = local.admin_signals

  listener_arn = local.primary_listener_arn
  priority     = 110 + local.admin_signal_order[each.key]

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  dynamic "condition" {
    for_each = each.key == "host" ? [each.value] : []
    content {
      host_header {
        values = [condition.value]
      }
    }
  }

  dynamic "condition" {
    for_each = each.key == "header" ? [each.value] : []
    content {
      http_header {
        http_header_name = "X-Platform-App"
        values           = [condition.value]
      }
    }
  }

  tags = local.tags
}

# ── CloudFront header forwards ──────────────────────────────────────────────
# One per app. The console is omitted when its allowlist is in force, because
# the guarded pair above already owns that header.
resource "aws_lb_listener_rule" "cdn" {
  for_each = {
    for key, app in local.apps :
    key => app if !(key == "admin" && local.admin_is_restricted)
  }

  listener_arn = local.primary_listener_arn
  priority     = 150 + index(sort(keys(local.apps)), each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.key].arn
  }

  condition {
    http_header {
      http_header_name = "X-Platform-App"
      values           = [each.key]
    }
  }

  tags = local.tags
}

# ── Host forwards ───────────────────────────────────────────────────────────
# One per configured hostname, same omission for the guarded console.
resource "aws_lb_listener_rule" "host" {
  for_each = {
    for key, app in local.routed_apps :
    key => app if !(key == "admin" && local.admin_is_restricted)
  }

  listener_arn = local.primary_listener_arn
  priority     = 200 + index(local.routed_keys, each.key)

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app[each.key].arn
  }

  condition {
    host_header {
      values = [each.value.host]
    }
  }

  tags = local.tags
}

# ── Optional DNS ─────────────────────────────────────────────────────────────
# An alias record per configured host, created only when a hosted zone is given.
resource "aws_route53_record" "app" {
  for_each = var.route53_zone_id != "" ? local.routed_apps : {}

  zone_id = var.route53_zone_id
  name    = each.value.host
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
