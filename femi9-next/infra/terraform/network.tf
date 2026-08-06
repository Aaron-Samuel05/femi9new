# ─────────────────────────────────────────────────────────────────────────────
# network.tf
# The VPC and its plumbing:
#   • 2 public subnets  (ALB + NAT gateway) across 2 AZs
#   • 2 private subnets (Fargate tasks, Aurora, RDS Proxy) across the same AZs
#   • Internet Gateway for public ingress/egress
#   • NAT Gateway(s) so private tasks can reach Razorpay / Resend / MSG91 / SES
#   • Route tables wiring it all together
#   • Security groups: alb_sg → app_sg → (rds_proxy_sg) → db_sg
# ─────────────────────────────────────────────────────────────────────────────

# ── VPC ──────────────────────────────────────────────────────────────────────

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true # required for RDS Proxy / Aurora endpoint resolution
  enable_dns_hostnames = true

  tags = merge(local.tags, { Name = "${local.name_prefix}-vpc" })
}

# ── Internet Gateway (public egress/ingress) ─────────────────────────────────

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.name_prefix}-igw" })
}

# ── Subnets ──────────────────────────────────────────────────────────────────
# Two of each type, one per AZ. `count` walks the CIDR lists in lockstep with
# the AZ list from main.tf.

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true # ALB nodes / NAT live here and need public IPs

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-public-${local.azs[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count             = length(var.private_subnet_cidrs)
  vpc_id            = aws_vpc.this.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]
  # No public IPs: tasks and DB are unreachable from the internet directly.

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-private-${local.azs[count.index]}"
    Tier = "private"
  })
}

# ── NAT Gateway(s) ───────────────────────────────────────────────────────────
# Private subnets have no route to the IGW, so outbound calls to third-party
# APIs (Razorpay, MSG91, Resend/SES) egress through a NAT GW in a public subnet.
# single_nat_gateway=true keeps one shared NAT (cheaper); false gives one per AZ.

locals {
  # 0 when NAT is disabled → no EIP, no NAT GW created (tasks egress via a public
  # IP in a public subnet instead; see ecs.tf network_configuration).
  nat_gateway_count = var.enable_nat ? (var.single_nat_gateway ? 1 : length(var.public_subnet_cidrs)) : 0
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

# Public: default route to the Internet Gateway.
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.name_prefix}-public-rt" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private: one route table per subnet so each AZ can point at its own NAT when
# single_nat_gateway=false. When shared, they all point at NAT #0.
resource "aws_route_table" "private" {
  count  = length(aws_subnet.private)
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${local.name_prefix}-private-rt-${count.index}" })
}

resource "aws_route" "private_nat" {
  # No NAT → no default route out of the private subnets. That's fine: only Aurora
  # and the RDS Proxy live there, and neither needs internet egress. The app tasks
  # move to public subnets (ecs.tf) when NAT is disabled.
  count                  = var.enable_nat ? length(aws_route_table.private) : 0
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  # Shared NAT → index 0; per-AZ NAT → matching index.
  nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.this[0].id : aws_nat_gateway.this[count.index].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ─────────────────────────────────────────────────────────────────────────────
# Security groups — least-privilege chain: internet → ALB → app → proxy → db
# ─────────────────────────────────────────────────────────────────────────────

# ALB: accepts 80/443 from the internet, talks to the app on the container port.
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "ALB: allow HTTP/HTTPS from the internet"
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-alb-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from anywhere"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP from anywhere (redirected to HTTPS when a cert is set)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_app" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward to app tasks on the container port"
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
  referenced_security_group_id = aws_security_group.app.id
}

# App (Fargate tasks): only the ALB may reach the container port; unrestricted
# egress so tasks can reach the DB/proxy, Secrets Manager, ECR, and the internet
# (via NAT) for Razorpay/MSG91/Resend.
resource "aws_security_group" "app" {
  name        = "${local.name_prefix}-app-sg"
  description = "App tasks: ingress only from the ALB"
  vpc_id      = aws_vpc.this.id
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
  description       = "All egress (DB, proxy, Secrets Manager, ECR, third-party APIs via NAT)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

# RDS Proxy: sits between the app and Aurora. Accepts 5432 from the app, egresses
# 5432 to the DB security group.
resource "aws_security_group" "rds_proxy" {
  name        = "${local.name_prefix}-rds-proxy-sg"
  description = "RDS Proxy: 5432 from app tasks, 5432 to Aurora"
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-rds-proxy-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "proxy_from_app" {
  security_group_id            = aws_security_group.rds_proxy.id
  description                  = "Postgres from app tasks"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_egress_rule" "proxy_to_db" {
  security_group_id            = aws_security_group.rds_proxy.id
  description                  = "Postgres to the Aurora cluster"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.db.id
}

# DB (Aurora): accepts 5432 from the RDS Proxy (pooled app traffic) and directly
# from the app tasks (Prisma migrations use DIRECT_URL, which bypasses the proxy).
resource "aws_security_group" "db" {
  name        = "${local.name_prefix}-db-sg"
  description = "Aurora: 5432 from RDS Proxy and app tasks only"
  vpc_id      = aws_vpc.this.id
  tags        = merge(local.tags, { Name = "${local.name_prefix}-db-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "db_from_proxy" {
  security_group_id            = aws_security_group.db.id
  description                  = "Postgres from RDS Proxy (pooled)"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.rds_proxy.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "Postgres direct from app tasks (Prisma migrate deploy via DIRECT_URL)"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
}

resource "aws_vpc_security_group_egress_rule" "db_all" {
  security_group_id = aws_security_group.db.id
  description       = "Default egress"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
