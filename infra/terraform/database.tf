# ─────────────────────────────────────────────────────────────────────────────
# database.tf
# Aurora Serverless v2 (PostgreSQL) with an RDS Proxy in front.
#
#   App (pooled)  ──► RDS Proxy ──► Aurora writer/reader   (DATABASE_URL)
#   App (migrate) ─────────────────► Aurora writer          (DIRECT_URL)
#
# Why a proxy: Fargate tasks scale out and Prisma opens a connection pool per
# task; Aurora Serverless v2 has a bounded max_connections. RDS Proxy multiplexes
# those, protects the DB during scale events and failovers, and holds the DB
# credentials so the app never sees the master password directly.
#
# Encryption at rest, automated backups, PITR (continuous backups) and a
# Multi-AZ writer/reader pair are all enabled below.
# ─────────────────────────────────────────────────────────────────────────────

# ── Master password ──────────────────────────────────────────────────────────
# Generated, never human-chosen. override_special excludes URL-reserved
# characters (@ : / ? # [ ] % &) so it can be embedded in DATABASE_URL/DIRECT_URL
# without percent-encoding.
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!*()-_=+"
}

# ── Subnet group ─────────────────────────────────────────────────────────────
# Aurora lives only in the private subnets — never publicly reachable.
resource "aws_db_subnet_group" "this" {
  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = aws_subnet.private[*].id
  tags       = merge(local.tags, { Name = "${local.name_prefix}-db-subnets" })
}

# ── Aurora cluster (Serverless v2) ───────────────────────────────────────────
resource "aws_rds_cluster" "this" {
  cluster_identifier = "${local.name_prefix}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # required for Serverless v2 (not "serverless")
  engine_version     = var.db_engine_version

  database_name   = var.db_name
  master_username = var.db_master_username
  master_password = random_password.db.result

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]
  port                   = 5432

  # Encryption at rest with the AWS-managed RDS key (aws/rds). Supply a
  # customer-managed kms_key_id here if your compliance posture requires one.
  storage_encrypted = true

  # Backups + PITR. backup_retention_period > 0 turns on continuous backups, so
  # you can restore to any second within the window.
  backup_retention_period      = var.db_backup_retention_days
  preferred_backup_window      = "18:00-19:00" # UTC == 23:30 IST-ish, low traffic
  preferred_maintenance_window = "sun:19:30-sun:20:30"
  copy_tags_to_snapshot        = true

  # Serverless v2 autoscaling range (in ACUs).
  serverlessv2_scaling_configuration {
    min_capacity = var.db_min_acu
    max_capacity = var.db_max_acu
  }

  # Ship Postgres logs to CloudWatch for debugging slow queries / errors.
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Safety rails: protect from destroy and take a final snapshot on deletion.
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${local.name_prefix}-aurora-final"

  # The generated password rotates only when we intend it to; ignore drift from
  # out-of-band console changes to avoid surprise replacements.
  lifecycle {
    ignore_changes = [engine_version] # let minor version auto-upgrade in a maintenance window
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-aurora" })
}

# ── Cluster instances ────────────────────────────────────────────────────────
# db.serverless = Serverless v2 capacity. Creating two instances places a writer
# and a reader in different AZs, giving Multi-AZ high availability with automatic
# failover. Set db_instance_count=1 for a cheaper single-AZ writer.
resource "aws_rds_cluster_instance" "this" {
  count              = var.db_instance_count
  identifier         = "${local.name_prefix}-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.this.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.this.engine
  engine_version     = aws_rds_cluster.this.engine_version

  publicly_accessible = false
  # Lower tier number = higher promotion priority on failover.
  promotion_tier = count.index

  tags = merge(local.tags, { Name = "${local.name_prefix}-aurora-${count.index}" })
}

# ─────────────────────────────────────────────────────────────────────────────
# RDS Proxy
# ─────────────────────────────────────────────────────────────────────────────

# IAM role the proxy assumes to read the DB credentials secret from Secrets
# Manager (defined in secrets.tf).
data "aws_iam_policy_document" "rds_proxy_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_proxy" {
  name               = "${local.name_prefix}-rds-proxy-role"
  assume_role_policy = data.aws_iam_policy_document.rds_proxy_assume.json
  tags               = local.tags
}

data "aws_iam_policy_document" "rds_proxy_secret" {
  statement {
    sid       = "ReadDbCredentials"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_credentials.arn]
  }
  # Secrets encrypted with the default aws/secretsmanager key are decryptable via
  # the secret grant; if you switch to a customer-managed KMS key, add a
  # kms:Decrypt statement scoped to that key ARN here.
}

resource "aws_iam_role_policy" "rds_proxy_secret" {
  name   = "read-db-credentials"
  role   = aws_iam_role.rds_proxy.id
  policy = data.aws_iam_policy_document.rds_proxy_secret.json
}

resource "aws_db_proxy" "this" {
  name                   = "${local.name_prefix}-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.rds_proxy.arn
  vpc_subnet_ids         = aws_subnet.private[*].id
  vpc_security_group_ids = [aws_security_group.rds_proxy.id]

  require_tls         = true # clients must connect over TLS (hence sslmode=require in the URLs)
  idle_client_timeout = 1800
  debug_logging       = false

  # Secret-based auth (IAM auth left DISABLED for simplicity; flip to REQUIRED if
  # you want the app to fetch short-lived IAM tokens instead of a password).
  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials.arn
    description = "Aurora master credentials for ${local.name_prefix}"
  }

  # The proxy validates it can read the credentials on create, so the secret
  # VERSION (not just the secret) must exist first.
  depends_on = [aws_secretsmanager_secret_version.db_credentials]

  tags = merge(local.tags, { Name = "${local.name_prefix}-proxy" })
}

# Connection-pooling behaviour for the proxy.
resource "aws_db_proxy_default_target_group" "this" {
  db_proxy_name = aws_db_proxy.this.name

  connection_pool_config {
    # Keep well under Aurora's max_connections so a task storm can't exhaust it.
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

# Register the Aurora cluster as the proxy's target.
resource "aws_db_proxy_target" "this" {
  db_proxy_name         = aws_db_proxy.this.name
  target_group_name     = aws_db_proxy_default_target_group.this.name
  db_cluster_identifier = aws_rds_cluster.this.cluster_identifier

  # A cluster can only be registered once it has an available instance.
  depends_on = [aws_rds_cluster_instance.this]
}
