# ─────────────────────────────────────────────────────────────────────────────
# network.tf — the VPC this stack runs in, and the least-privilege chain of
# security groups: internet → ALB → app → proxy → db.
#
# ── TWO MODES ───────────────────────────────────────────────────────────────
# CREATE (var.existing_network = null): a fresh VPC, two public and two private
# subnets across two AZs, and optionally a NAT gateway.
#
# REUSE (var.existing_network set): no VPC is created; the ALB and the tasks go
# into subnets that already exist. This is not a convenience — an Aurora cluster
# is only reachable from inside its own VPC, so reusing an existing database
# means running in the VPC that database lives in. Reusing the network without
# reusing the database, or the reverse, is the one combination that does not
# work; the variables' descriptions say so and this comment says so twice.
#
# The SECURITY GROUPS are created in both modes. They belong to this stack: they
# describe what THESE services may talk to, and adopting somebody else's groups
# would mean this stack's blast radius included theirs.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  create_network  = var.existing_network == null
  create_database = var.existing_database == null

  # Everything downstream reads these three rather than the resources, so a
  # reference does not have to know which mode it is in.
  vpc_id = local.create_network ? aws_vpc.this[0].id : var.existing_network.vpc_id

  public_subnet_ids = local.create_network ? aws_subnet.public[*].id : var.existing_network.public_subnet_ids

  private_subnet_ids = local.create_network ? aws_subnet.private[*].id : var.existing_network.private_subnet_ids

  # Where the Fargate tasks run.
  #
  # Private subnets only have outbound internet through a NAT gateway, and a
  # task with no egress cannot reach Razorpay, Resend, ECR or Secrets Manager —
  # it fails to start, with a pull error rather than anything about networking.
  # In CREATE mode that is decided by whether this stack built a NAT. In REUSE
  # mode this stack did not build the VPC's egress and must be TOLD whether the
  # private subnets have any: `enable_nat` means "they do". Set it false for a
  # VPC with no NAT gateway, and the tasks run in the public subnets with a
  # public IP instead — still ALB-only inbound, because the security group says
  # so and a public subnet is not a public service.
  tasks_in_private = local.create_network ? local.nat_gateway_count > 0 : var.enable_nat

  # The group Aurora accepts connections on — this stack's own when it built the
  # cluster, the existing cluster's when it did not.
  db_security_group_id = local.create_database ? aws_security_group.db[0].id : var.existing_database.security_group_id
}

# ── VPC ──────────────────────────────────────────────────────────────────────
resource "aws_vpc" "this" {
  count = local.create_network ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-vpc" })
}

resource "aws_internet_gateway" "this" {
  count = local.create_network ? 1 : 0

  vpc_id = aws_vpc.this[0].id
  tags   = merge(local.tags, { Name = "${local.name_prefix}-igw" })
}

# ── Subnets ──────────────────────────────────────────────────────────────────
# Public: the ALB, and the NAT gateway when one exists.
resource "aws_subnet" "public" {
  count = local.create_network ? length(var.public_subnet_cidrs) : 0

  vpc_id                  = aws_vpc.this[0].id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-public-${local.azs[count.index]}" })
}

# Private: Aurora and the RDS Proxy, plus the Fargate tasks when NAT is on.
resource "aws_subnet" "private" {
  count = local.create_network ? length(var.private_subnet_cidrs) : 0

  vpc_id            = aws_vpc.this[0].id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.tags, { Name = "${local.name_prefix}-private-${local.azs[count.index]}" })
}

# ── NAT ──────────────────────────────────────────────────────────────────────
# Private subnets have no route to the IGW, so outbound calls to third-party
# APIs (Razorpay, MSG91, Resend) egress through a NAT gateway in a public
# subnet. single_nat_gateway keeps one shared (cheaper) rather than one per AZ.

locals {
  # 0 when NAT is disabled, or when the network is somebody else's — reusing a
  # VPC means reusing whatever egress path it already has, and quietly adding a
  # second NAT gateway to it would be both surprising and billable.
  nat_gateway_count = (
    local.create_network && var.enable_nat
    ? (var.single_nat_gateway ? 1 : length(var.public_subnet_cidrs))
    : 0
  )
}

resource "aws_eip" "nat" {
  count  = local.nat_gateway_count
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${local.name_prefix}-nat-eip-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  count         = local.nat_gateway_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.tags, { Name = "${local.name_prefix}-nat-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

# ── Route tables ─────────────────────────────────────────────────────────────
# Only in CREATE mode. An existing VPC brings its own routing, and rewriting it
# is exactly the kind of change that takes an unrelated service down.

resource "aws_route_table" "public" {
  count = local.create_network ? 1 : 0

  vpc_id = aws_vpc.this[0].id
  tags   = merge(local.tags, { Name = "${local.name_prefix}-public-rt" })
}

resource "aws_route" "public_internet" {
  count = local.create_network ? 1 : 0

  route_table_id         = aws_route_table.public[0].id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this[0].id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

# One private table per subnet, so each AZ can point at its own NAT when
# single_nat_gateway is false. When shared, they all point at NAT #0.
resource "aws_route_table" "private" {
  count = length(aws_subnet.private)

  vpc_id = aws_vpc.this[0].id
  tags   = merge(local.tags, { Name = "${local.name_prefix}-private-rt-${count.index}" })
}

resource "aws_route" "private_nat" {
  # No NAT → no default route out of the private subnets. That is fine: only
  # Aurora and the proxy live there, and neither needs internet egress. The
  # tasks move to public subnets (ecs.tf) when NAT is off.
  count                  = local.nat_gateway_count > 0 ? length(aws_route_table.private) : 0
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = var.single_nat_gateway ? aws_nat_gateway.this[0].id : aws_nat_gateway.this[count.index].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ─────────────────────────────────────────────────────────────────────────────
# Security groups
# ─────────────────────────────────────────────────────────────────────────────

# ALB: accepts 80/443 from CloudFront's edge only, talks to the tasks on the
# app port.
#
# ── Why not the internet ────────────────────────────────────────────────────
# Every site here is served through CloudFront, so nothing legitimate arrives at
# the ALB from anywhere else — and the difference is not academic. The platform
# rate-limits per IP on `CloudFront-Viewer-Address`, a header GENERATED at the
# edge that a viewer cannot set (packages/core/src/rate-limit.ts). That property
# holds only while the edge is the sole route in. With the ALB open, anyone who
# found it could send that header themselves and vary it per request: OTP sends,
# magic links, admin sign-in and checkout would all have been unlimited, from
# code that reads as though it throttles them.
#
# The same rule is what makes it safe for the ALB to be addressed over plain
# HTTP while alb_origin_host is unset — the cleartext hop is edge-to-origin,
# never viewer-to-origin.
#
# `X-Platform-App` (cloudfront.tf) is a routing signal and not a second gate. It
# is not secret, and it never was: this is the gate.
resource "aws_security_group" "alb" {
  name = "${local.name_prefix}-alb-sg"
  # ── DO NOT "CORRECT" THIS DESCRIPTION ────────────────────────────────────
  # It says "from the internet" and the rules below admit only the CloudFront
  # edge. That reads wrong, and it stays: EC2 cannot edit a security group
  # description, so any change to this string REPLACES the group — which means
  # detaching and reattaching the security group of a load balancer that is
  # serving, to improve a sentence nobody reads at runtime. The rules are the
  # truth; this is a label, and a plan that replaces the ALB's security group
  # for a label is a bad trade. (Also: no apostrophe — see the app group below.)
  description = "ALB: allow HTTP/HTTPS from the internet"
  vpc_id      = local.vpc_id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-alb-sg" })
}

# AWS publishes the edge's origin-facing ranges as a managed prefix list, so
# "CloudFront only" is one rule that stays correct as those ranges change. It is
# a GLOBAL list published into every region — the name is literal.
#
# ── THERE IS ROOM FOR EXACTLY ONE PREFIX-LIST RULE HERE ─────────────────────
# A prefix list rule counts against the security group's rule quota as its
# max_entries — currently 55 against a default limit of 60. So a SECOND one does
# not fit, and AWS rejects it.
#
# This file used to open 80 AND 443 to the edge, as two rules, and that took the
# whole platform down on 1 September. Terraform destroyed the old
# 0.0.0.0/0 rules, created the 443 rule (55 entries), and was refused on the 80
# rule for exceeding the quota. CloudFront reaches this origin on PORT 80 —
# http-only, because the ALB has no certificate — so the one port that mattered
# was the one that failed, and all three distributions timed out while every
# ECS task sat healthy in its target group and nothing looked wrong anywhere.
#
# So: ONE rule, on the port CloudFront actually uses, derived from the same
# local that sets the origin protocol policy. The two cannot disagree.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  count = var.alb_ingress_source == "cloudfront" ? 1 : 0
  name  = "com.amazonaws.global.cloudfront.origin-facing"
}

locals {
  # The port the EDGE connects to, which is a consequence of how CloudFront was
  # told to address the origin (see local.alb_origin_protocol in cloudfront.tf):
  #
  #   http-only     -> 80    the default, while the ALB has no certificate
  #   https-only    -> 443   once alb_origin_host + acm_certificate_arn are set
  #   match-viewer  -> both, so a RANGE, because two prefix-list rules do not
  #                    fit. 80-443 admits ports nothing listens on, which costs
  #                    nothing: a port with no listener refuses regardless.
  alb_edge_from_port = local.alb_origin_protocol == "https-only" ? 443 : 80
  alb_edge_to_port   = local.alb_origin_protocol == "http-only" ? 80 : 443

  # Direct access, for the escape hatches below. These are plain CIDR rules
  # worth one entry each, and there are about five entries left in the group.
  alb_ingress_ports = { https = 443, http = 80 }
}

# ── ADOPT the rule that is serving, do not replace it ───────────────────────
# The live rule was repaired by hand during the 1 September outage: it is the
# same rule that was created as alb_edge["https"], moved from port 443 to 80
# with modify-security-group-rules, and then removed from state — so the group
# is correct and Terraform no longer knows about it.
#
# It has to be ADOPTED rather than recreated, and that is not a preference.
# Only ONE prefix-list rule fits the group (55 entries against a limit of 60),
# so a plan that creates this one while the live one still exists is refused,
# and a plan that deletes the live one first is an outage for as long as the
# apply takes. Import is the only transition with neither.
#
# `terraform import` cannot do it: importing evaluates the WHOLE configuration,
# and aws_route_table_association.public counts on length(aws_subnet.public),
# which is unknowable while this stack runs on an existing network. An import
# block is evaluated during plan, where that same expression resolves.
#
# Remove this block once it has been applied — a one-shot instruction, not a
# permanent declaration.
import {
  to = aws_vpc_security_group_ingress_rule.alb_edge[0]
  id = "sgr-02258160c466a68bf"
}

resource "aws_vpc_security_group_ingress_rule" "alb_edge" {
  count = var.alb_ingress_source == "cloudfront" ? 1 : 0

  security_group_id = aws_security_group.alb.id
  description       = "Origin traffic from the CloudFront edge (${local.alb_origin_protocol})"
  ip_protocol       = "tcp"
  from_port         = local.alb_edge_from_port
  to_port           = local.alb_edge_to_port
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront[0].id
}

# The edge must be able to reach the port CloudFront was told to use. Getting
# this wrong does not fail the apply and does not fail a health check — the
# tasks stay healthy behind an ALB nothing can reach — so it is asserted here.
check "alb_edge_port_matches_origin_protocol" {
  assert {
    condition = var.alb_ingress_source != "cloudfront" || (
      local.alb_origin_protocol == "http-only" ? local.alb_edge_from_port == 80 : local.alb_edge_to_port == 443
    )
    error_message = "The ALB security group would not admit the port CloudFront uses to reach the origin. Every distribution would time out while every task stayed healthy."
  }
}

# The escape hatch, and it is a real one: this is the posture that made every
# per-IP limit forgeable. See var.alb_ingress_source.
resource "aws_vpc_security_group_ingress_rule" "alb_internet" {
  for_each = var.alb_ingress_source == "internet" ? local.alb_ingress_ports : {}

  security_group_id = aws_security_group.alb.id
  description       = "${upper(each.key)} from anywhere - BYPASSES the edge, and with it per-IP rate limiting"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_debug" {
  for_each = {
    for pair in setproduct(keys(local.alb_ingress_ports), var.alb_debug_cidrs) :
    "${pair[0]}-${pair[1]}" => { port = local.alb_ingress_ports[pair[0]], cidr = pair[1] }
  }

  security_group_id = aws_security_group.alb.id
  description       = "Direct origin access for debugging: ${each.value.cidr}"
  ip_protocol       = "tcp"
  from_port         = each.value.port
  to_port           = each.value.port
  cidr_ipv4         = each.value.cidr
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward to app tasks on the container port"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.app.id
}

# App (Fargate tasks): only the ALB may reach the container port. Egress is
# unrestricted so tasks can reach the database, Secrets Manager, ECR and the
# third-party APIs.
resource "aws_security_group" "app" {
  name = "${local.name_prefix}-app-sg"
  # NO APOSTROPHE. EC2 rejects a security group description containing one --
  # the valid set is a-zA-Z0-9. _-:/()#,@[]+=&;{}!$* and nothing else. It fails
  # at CreateSecurityGroup with InvalidParameterValue, and because the tasks and
  # the database ingress rule both reference this group, the whole compute layer
  # goes with it. Cosmetic-looking text, load-bearing effect.
  description = "Platform app tasks: ingress only from this stack ALB"
  vpc_id      = local.vpc_id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-app-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  security_group_id            = aws_security_group.app.id
  description                  = "Container port from the ALB only"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "All egress (database, Secrets Manager, ECR, third-party APIs)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# ── Reaching an EXISTING database ───────────────────────────────────────────
# THE ONE RESOURCE THIS STACK MODIFIES THAT IT DID NOT CREATE.
#
# The existing cluster's security group admits its own app tier and nothing
# else, so without this rule the new tasks resolve the endpoint, open a socket,
# and hang until the connection times out. It is purely additive — one ingress
# rule referencing this stack's app group — and removing this stack removes it
# again. Nothing else about that group, that cluster, or its current tenant is
# touched.
resource "aws_vpc_security_group_ingress_rule" "existing_db_from_app" {
  count = local.create_database ? 0 : 1

  security_group_id            = var.existing_database.security_group_id
  description                  = "Postgres from ${local.name_prefix} tasks"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

# ── Groups that exist only when this stack builds the database ──────────────

# RDS Proxy: between the app and Aurora.
resource "aws_security_group" "rds_proxy" {
  count = local.create_database ? 1 : 0

  name        = "${local.name_prefix}-rds-proxy-sg"
  description = "RDS Proxy: 5432 from app tasks, 5432 to Aurora"
  vpc_id      = local.vpc_id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-rds-proxy-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "proxy_from_app" {
  count = local.create_database ? 1 : 0

  security_group_id            = aws_security_group.rds_proxy[0].id
  description                  = "Postgres from app tasks"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_egress_rule" "proxy_to_db" {
  count = local.create_database ? 1 : 0

  security_group_id            = aws_security_group.rds_proxy[0].id
  description                  = "Postgres to the Aurora cluster"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.db[0].id
}

# DB (Aurora): accepts 5432 from the proxy (pooled) and directly from the tasks
# (migrations use DIRECT_URL, which bypasses the proxy).
resource "aws_security_group" "db" {
  count = local.create_database ? 1 : 0

  name        = "${local.name_prefix}-db-sg"
  description = "Aurora: 5432 from RDS Proxy and app tasks only"
  vpc_id      = local.vpc_id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-db-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "db_from_proxy" {
  count = local.create_database ? 1 : 0

  security_group_id            = aws_security_group.db[0].id
  description                  = "Postgres from RDS Proxy (pooled)"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.rds_proxy[0].id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  count = local.create_database ? 1 : 0

  security_group_id            = aws_security_group.db[0].id
  description                  = "Postgres direct from app tasks (prisma migrate deploy via DIRECT_URL)"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_egress_rule" "db_all" {
  count = local.create_database ? 1 : 0

  security_group_id = aws_security_group.db[0].id
  description       = "Default egress"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
